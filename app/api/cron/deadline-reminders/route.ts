import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Default alert thresholds — used when a unit has no escalation_config or
 * when escalation_config.thresholds is empty.
 *
 * Each level notifies exactly ONE tier, escalating upward:
 *   L1 (50%) → Workstream Lead   — early heads-up, still time to recover
 *   L2 (75%) → Program Owner     — lead already notified, owner must review
 *   L3 (90%) → Platform Admin    — critical, system-level visibility needed
 */
const DEFAULT_THRESHOLDS = [
  { level: 1, percentage_elapsed: 50, target_roles: ['WORKSTREAM_LEAD'] },
  { level: 2, percentage_elapsed: 75, target_roles: ['PROGRAM_OWNER'] },
  { level: 3, percentage_elapsed: 90, target_roles: ['PLATFORM_ADMIN'] },
];

/** Returns the % of deadline window that has elapsed (capped at 100). */
function calcPercentElapsed(createdAt: string, deadline: string): number {
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const due = new Date(deadline).getTime();
  if (due <= created) return 100;
  return Math.min(100, ((now - created) / (due - created)) * 100);
}

function alertSubject(unitTitle: string, level: number, pct: number): string {
  const roundedPct = Math.round(pct);
  if (level === 1) return `[L1 Alert] "${unitTitle}" is ${roundedPct}% through its deadline`;
  if (level === 2) return `[L2 Alert] Action Required: "${unitTitle}" — ${roundedPct}% elapsed`;
  return `[L3 CRITICAL] "${unitTitle}" is ${roundedPct}% through its deadline — intervene now`;
}

function alertMessage(
  unitTitle: string,
  workstreamName: string,
  programName: string,
  level: number,
  pct: number
): string {
  const roundedPct = Math.round(pct);
  if (level === 1) {
    return (
      `Heads up — "${unitTitle}" in ${workstreamName} (${programName}) is ${roundedPct}% through its deadline window.\n\n` +
      `This is an early alert. Please make sure the unit is on track for on-time delivery.`
    );
  }
  if (level === 2) {
    return (
      `Action required — "${unitTitle}" in ${workstreamName} (${programName}) has used ${roundedPct}% of its deadline window.\n\n` +
      `The Workstream Lead was notified at the 50% mark. Please review progress and intervene if delivery is at risk.`
    );
  }
  return (
    `CRITICAL — "${unitTitle}" in ${workstreamName} (${programName}) is ${roundedPct}% through its deadline window with no GREEN status.\n\n` +
    `The Workstream Lead and Program Owner have been notified at earlier thresholds. Immediate intervention is required.`
  );
}

/**
 * POST /api/cron/deadline-reminders
 *
 * Percentage-based deadline alert engine. For each non-GREEN unit, calculates
 * how much of the deadline window has elapsed and fires the appropriate level
 * alert when a threshold is crossed for the first time.
 *
 * L1 (50%) → Workstream Lead
 * L2 (75%) → Program Owner
 * L3 (90%) → Platform Admin
 *
 * Deduplication: once an alert for a given (unit, level) pair has been queued
 * or sent it is never re-sent, so this endpoint is safe to call every few hours.
 *
 * Call daily (or multiple times a day) with Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[deadline-reminders] CRON_SECRET not configured');
    return NextResponse.json(
      { error: 'Server misconfiguration: CRON_SECRET not set' },
      { status: 500 }
    );
  }

  // Accept both the cron secret and the Supabase service role key (for edge-function calls)
  if (
    authHeader !== `Bearer ${cronSecret}` &&
    authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const runId = crypto.randomUUID();

  await supabase.from('cron_runs').insert({
    id: runId,
    job_name: 'deadline-reminders',
    status: 'running',
  });

  try {
    // ── 1. Fetch all non-GREEN units that have both a creation time and a deadline ──
    const { data: units, error: unitsError } = await supabase
      .from('units')
      .select(`
        id,
        title,
        created_at,
        required_green_by,
        computed_status,
        escalation_config,
        workstreams!inner(
          id,
          name,
          programs!inner(
            id,
            name,
            org_id
          )
        )
      `)
      .not('computed_status', 'eq', 'GREEN')
      .not('required_green_by', 'is', null)
      .not('created_at', 'is', null);

    if (unitsError) throw unitsError;

    if (!units || units.length === 0) {
      await supabase
        .from('cron_runs')
        .update({ status: 'success', completed_at: new Date().toISOString(), records_processed: 0 })
        .eq('id', runId);
      return NextResponse.json({ success: true, units_checked: 0, alerts_queued: 0 });
    }

    // ── 2. Load already-sent/pending alerts to prevent duplicate notifications ──
    // We stamp unit_id + alert_level into template_data when we queue the notification,
    // so we can cheaply check whether a given (unit, level) has already fired.
    const { data: alreadySentRaw } = await supabase
      .from('escalation_notifications')
      .select('template_data')
      .not('template_data->>alert_level', 'is', null)
      .in('status', ['pending', 'sent']);

    const sentKeys = new Set<string>(
      (alreadySentRaw || [])
        .filter((n) => n.template_data?.unit_id && n.template_data?.alert_level)
        .map((n) => `${n.template_data.unit_id}:${n.template_data.alert_level}`)
    );

    // ── 3. Walk every unit and check which thresholds have been crossed ──
    const emailNotifications: any[] = [];
    const inAppNotifications: any[] = [];

    for (const unit of units) {
      const workstream = (unit.workstreams as any);
      const program = workstream?.programs;
      const orgId = program?.org_id;
      if (!orgId) continue;

      const config = (unit.escalation_config as any) ?? {};
      // Respect the per-unit "enabled" flag (defaults to true if absent)
      if (config.enabled === false) continue;

      const thresholds: Array<{
        level: number;
        percentage_elapsed: number;
        target_roles: string[];
      }> = Array.isArray(config.thresholds) && config.thresholds.length > 0
        ? config.thresholds
        : DEFAULT_THRESHOLDS;

      const pct = calcPercentElapsed(unit.created_at, unit.required_green_by);

      for (const threshold of thresholds) {
        // Skip if this threshold hasn't been reached yet
        if (pct < threshold.percentage_elapsed) continue;

        // Skip if we've already sent this level for this unit
        const alertKey = `${unit.id}:${threshold.level}`;
        if (sentKeys.has(alertKey)) continue;

        const priority =
          threshold.level >= 3 ? 'critical' : threshold.level === 2 ? 'high' : 'normal';
        const subject = alertSubject(unit.title, threshold.level, pct);
        const message = alertMessage(unit.title, workstream.name, program.name, threshold.level, pct);

        for (const role of threshold.target_roles) {
          let recipientRows: { user_id: string; email: string; full_name: string | null }[] = [];

          if (role === 'PLATFORM_ADMIN') {
            // Platform admins have system-wide scope — no org filter
            const { data } = await supabase
              .from('profiles')
              .select('user_id, email, full_name')
              .eq('role', 'PLATFORM_ADMIN');
            recipientRows = data || [];
          } else {
            const { data } = await supabase
              .from('profiles')
              .select('user_id, email, full_name')
              .eq('org_id', orgId)
              .eq('role', role);
            recipientRows = data || [];
          }

          for (const r of recipientRows) {
            if (!r.email) continue;

            emailNotifications.push({
              escalation_id: null,
              recipient_email: r.email,
              recipient_name: r.full_name || r.email.split('@')[0],
              channel: 'email',
              subject,
              message,
              template_data: {
                unit_id: unit.id,
                unit_title: unit.title,
                workstream_name: workstream.name,
                program_name: program.name,
                alert_level: String(threshold.level),
                percentage_elapsed: String(Math.round(pct)),
                priority,
              },
              status: 'pending',
            });

            if (r.user_id) {
              const inAppMsg =
                threshold.level === 1
                  ? `"${unit.title}" is ${Math.round(pct)}% through its deadline. Make sure delivery stays on track.`
                  : threshold.level === 2
                  ? `"${unit.title}" has used ${Math.round(pct)}% of its deadline window. Immediate review required.`
                  : `CRITICAL: "${unit.title}" is ${Math.round(pct)}% through its deadline with no GREEN status.`;

              inAppNotifications.push({
                user_id: r.user_id,
                title: `[L${threshold.level}] Deadline Alert: ${unit.title}`,
                message: inAppMsg,
                type: 'deadline_alert',
                priority,
                related_unit_id: unit.id,
                action_url: `/units/${unit.id}`,
                metadata: {
                  alert_level: threshold.level,
                  percentage_elapsed: Math.round(pct),
                  unit_title: unit.title,
                },
              });
            }
          }
        }
      }
    }

    // ── 4. Deduplicate before inserting ──
    // Email: one record per (recipient, unit, level)
    const seenEmailKeys = new Set<string>();
    const uniqueEmails = emailNotifications.filter((n) => {
      const key = `${n.recipient_email}:${n.template_data.unit_id}:${n.template_data.alert_level}`;
      if (seenEmailKeys.has(key)) return false;
      seenEmailKeys.add(key);
      return true;
    });

    // In-app: one record per (user, unit, level)
    const seenInAppKeys = new Set<string>();
    const uniqueInApp = inAppNotifications.filter((n) => {
      const key = `${n.user_id}:${n.related_unit_id}:${n.metadata.alert_level}`;
      if (seenInAppKeys.has(key)) return false;
      seenInAppKeys.add(key);
      return true;
    });

    // ── 5. Persist and dispatch ──
    let alertsQueued = 0;

    if (uniqueEmails.length > 0) {
      await supabase.from('escalation_notifications').insert(uniqueEmails);
      alertsQueued = uniqueEmails.length;

      // Kick the edge function to process the queue
      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-escalation-emails`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
      } catch (edgeErr: any) {
        console.error('[deadline-reminders] Edge function trigger failed:', edgeErr.message);
      }
    }

    if (uniqueInApp.length > 0) {
      await supabase.from('in_app_notifications').insert(uniqueInApp);
    }

    await supabase
      .from('cron_runs')
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
        records_processed: alertsQueued,
      })
      .eq('id', runId);

    return NextResponse.json({
      success: true,
      units_checked: units.length,
      alerts_queued: alertsQueued,
      in_app_sent: uniqueInApp.length,
    });
  } catch (error: any) {
    console.error('[deadline-reminders] Fatal error:', error);
    await supabase
      .from('cron_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', runId);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET for health check / cron dashboard
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'deadline-reminders',
    description:
      'Percentage-based deadline alert engine. ' +
      'L1 (50%) → Workstream Lead, L2 (75%) → Program Owner, L3 (90%) → Platform Admin. ' +
      'Each (unit, level) pair is only ever sent once.',
  });
}
