import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create Supabase admin client
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// Level → roles that should be notified
const ESCALATION_LEVEL_ROLES: Record<number, string[]> = {
  1: ['WORKSTREAM_LEAD'],
  2: ['PROGRAM_OWNER', 'WORKSTREAM_LEAD'],
  3: ['PLATFORM_ADMIN', 'PROGRAM_OWNER'],
};

/**
 * After the DB RPCs create unit_escalation records, this function queries for
 * any escalations triggered since runStartTime, builds email + in-app notification
 * payloads, and calls the send-escalation-emails Edge Function to dispatch them.
 */
async function dispatchAutomaticEscalationNotifications(
  supabase: ReturnType<typeof createClient>,
  runStartTime: string
): Promise<number> {
  // Find escalations created in this run
  const { data: newEscalations, error } = await supabase
    .from('unit_escalations')
    .select(`
      id,
      unit_id,
      level,
      triggered_at,
      units!inner(
        title,
        workstreams!inner(
          name,
          programs!inner(
            name,
            org_id
          )
        )
      )
    `)
    .eq('status', 'active')
    .gte('triggered_at', runStartTime);

  if (error || !newEscalations || newEscalations.length === 0) return 0;

  const emailNotifications: any[] = [];
  const inAppNotifications: any[] = [];

  for (const esc of newEscalations) {
    const unit = esc.units as any;
    const workstream = unit?.workstreams;
    const program = workstream?.programs;
    const orgId = program?.org_id;
    if (!orgId) continue;

    const targetRoles = ESCALATION_LEVEL_ROLES[esc.level] || ['WORKSTREAM_LEAD'];

    // Fetch org-scoped users for the target roles (non-PLATFORM_ADMIN)
    const orgTargetRoles = targetRoles.filter(r => r !== 'PLATFORM_ADMIN');

    const { data: orgRecipients } = orgTargetRoles.length > 0
      ? await supabase
          .from('profiles')
          .select('user_id, email, full_name, role')
          .eq('org_id', orgId)
          .in('role', orgTargetRoles)
      : { data: [] };

    // PLATFORM_ADMINs always receive their targeted escalations regardless of org.
    // For L3 they are explicitly targeted; they are also always included so they
    // have full visibility across all tenants.
    const { data: platformAdmins } = await supabase
      .from('profiles')
      .select('user_id, email, full_name, role')
      .eq('role', 'PLATFORM_ADMIN');

    // Deduplicate (handles PLATFORM_ADMIN who also belongs to same org)
    const seenRecipientIds = new Set<string>();
    const recipients = [...(orgRecipients || []), ...(platformAdmins || [])].filter(r => {
      if (seenRecipientIds.has(r.user_id)) return false;
      seenRecipientIds.add(r.user_id);
      return true;
    });

    if (recipients.length === 0) continue;

    const levelLabel = esc.level === 1 ? 'L1' : esc.level === 2 ? 'L2' : 'L3';
    const subject = `[${levelLabel} Escalation] "${unit.title}" requires attention`;

    for (const recipient of recipients) {
      emailNotifications.push({
        escalation_id: esc.id,
        recipient_email: recipient.email,
        recipient_name: recipient.full_name || recipient.email.split('@')[0],
        channel: 'email',
        subject,
        message: `Automatic escalation triggered for unit "${unit.title}" in workstream "${workstream.name}" (${program.name}). Level: ${esc.level}. Please review and take action.`,
        template_data: {
          unit_title: unit.title,
          workstream_name: workstream.name,
          program_name: program.name,
          escalation_level: esc.level,
          priority: esc.level >= 3 ? 'critical' : esc.level === 2 ? 'high' : 'normal',
        },
        status: 'pending',
      });

      if (recipient.user_id) {
        inAppNotifications.push({
          user_id: recipient.user_id,
          title: `${levelLabel} Escalation: ${unit.title}`,
          message: `"${unit.title}" has been automatically escalated to level ${esc.level}. Immediate review required.`,
          type: 'automatic_escalation',
          priority: esc.level >= 3 ? 'critical' : esc.level === 2 ? 'high' : 'normal',
          related_unit_id: esc.unit_id,
          related_escalation_id: esc.id,
          action_url: `/units/${esc.unit_id}`,
          metadata: {
            escalation_level: esc.level,
            unit_title: unit.title,
          },
        });
      }
    }
  }

  if (emailNotifications.length > 0) {
    // Deduplicate by recipient + subject
    const seen = new Set<string>();
    const unique = emailNotifications.filter((n) => {
      const key = `${n.recipient_email}:${n.subject}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    await supabase.from('escalation_notifications').insert(unique);
  }

  if (inAppNotifications.length > 0) {
    const seen = new Set<string>();
    const unique = inAppNotifications.filter((n: any) => {
      const key = `${n.user_id}:${n.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    await supabase.from('in_app_notifications').insert(unique);
  }

  // Trigger Edge Function to dispatch the queued emails
  if (emailNotifications.length > 0) {
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
    } catch (edgeFnError: any) {
      console.error('[CRON] Edge Function call failed:', edgeFnError.message);
    }
  }

  return emailNotifications.length + inAppNotifications.length;
}

/**
 * INTEGRITY MODE: Escalation Checker Cron Job
 *
 * This endpoint should be called every 5-15 minutes by an external cron service
 * (Vercel Cron, GitHub Actions, or similar).
 *
 * It triggers the automatic escalation engine that:
 * 1. Checks all RED units past their deadline (hierarchical model)
 * 2. Checks all RED zones past their deadline (legacy model)
 * 3. Creates escalation events at L1, L2, L3
 * 4. Updates deadlines automatically
 * 5. Logs everything to audit_log/status_events
 *
 * Security: Use CRON_SECRET to prevent unauthorized calls
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (mandatory - reject if not configured)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET not configured - rejecting request for security');
    return NextResponse.json(
      { error: 'Server misconfiguration: CRON_SECRET not set' },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('Unauthorized cron request - invalid secret');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const supabaseAdmin = getSupabaseAdmin();
  const runId = crypto.randomUUID();

  // Insert run start record
  await supabaseAdmin.from('cron_runs').insert({
    id: runId,
    job_name: 'check-escalations',
    status: 'running',
  });

  try {
    console.log('[CRON] Starting escalation check...', new Date().toISOString());
    const runStartTime = new Date().toISOString();

    // Call the new hierarchical model escalation engine
    const { data: unitData, error: unitError } = await supabaseAdmin.rpc(
      'check_and_trigger_unit_escalations'
    );

    // Call the legacy zone escalation engine
    const { data: zoneData, error: zoneError } = await supabaseAdmin.rpc(
      'check_and_trigger_escalations'
    );

    // Check and mark expired proofs, revert affected units to RED
    const { data: expiryData, error: expiryError } = await supabaseAdmin.rpc(
      'check_proof_expiry'
    );

    const unitResult = unitData?.[0] || { units_checked: 0, escalations_created: 0 };
    const zoneResult = zoneData?.[0] || { zones_checked: 0, escalations_created: 0 };
    const expiryResult = expiryData?.[0] || { proofs_expired: 0, units_reverted: 0 };

    const recordsProcessed =
      (unitResult.units_checked || 0) +
      (zoneResult.zones_checked || 0) +
      (expiryResult.proofs_expired || 0);

    console.log('[CRON] Escalation check completed:', {
      units: unitResult,
      zones: zoneResult,
      expiry: expiryResult,
    });

    // Dispatch notifications for any newly created automatic escalations.
    // The DB RPCs create unit_escalations records but don't send emails or in-app alerts —
    // we do that here so automatic escalations are as visible as manual ones.
    let notificationsDispatched = 0;
    try {
      notificationsDispatched = await dispatchAutomaticEscalationNotifications(
        supabaseAdmin,
        runStartTime
      );
    } catch (notifError: any) {
      console.error('[CRON] Notification dispatch failed (non-fatal):', notifError.message);
    }

    // Update run record on success
    await supabaseAdmin
      .from('cron_runs')
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
        records_processed: recordsProcessed,
      })
      .eq('id', runId);

    return NextResponse.json({
      success: true,
      units_checked: unitResult.units_checked,
      unit_escalations_created: unitResult.escalations_created,
      zones_checked: zoneResult.zones_checked,
      zone_escalations_created: zoneResult.escalations_created,
      proofs_expired: expiryResult.proofs_expired,
      units_reverted_by_expiry: expiryResult.units_reverted,
      notifications_dispatched: notificationsDispatched,
      timestamp: new Date().toISOString(),
      errors: {
        unit_error: unitError?.message || null,
        zone_error: zoneError?.message || null,
        expiry_error: expiryError?.message || null,
      },
    });
  } catch (error: any) {
    console.error('[CRON] Fatal error in escalation check:', error);

    // Update run record on failure
    await supabaseAdmin
      .from('cron_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', runId);

    return NextResponse.json(
      {
        error: 'Cron job failed',
        details: error instanceof Error ? error.message : 'Unknown',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Also support POST for flexibility
export async function POST(request: NextRequest) {
  return GET(request);
}
