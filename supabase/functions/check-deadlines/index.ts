// Supabase Edge Function: Automatic Deadline Reminders
// Thresholds are loaded from the alert_thresholds table — no code changes needed
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fallback thresholds if the table doesn't exist or is empty
const DEFAULT_THRESHOLDS = [
  { level: 1, percent: 10, label: 'Early Reminder', emoji: '📋', color: '#2563eb', tone: 'We wanted to give you an early heads-up', notify_roles: ['WORKSTREAM_LEAD'] },
  { level: 2, percent: 30, label: 'Important Reminder', emoji: '📌', color: '#ea580c', tone: 'This is an important reminder that time is moving along', notify_roles: ['WORKSTREAM_LEAD', 'PROGRAM_OWNER'] },
  { level: 3, percent: 100, label: 'Final Reminder', emoji: '⏳', color: '#dc2626', tone: 'This is a final reminder — the deadline has arrived', notify_roles: ['WORKSTREAM_LEAD', 'PROGRAM_OWNER', 'PLATFORM_ADMIN'] },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();

    // HTML escape helper to prevent email template injection
    const escapeHtml = (text: string) => String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');

    // Load thresholds from database (fall back to defaults)
    let THRESHOLDS = DEFAULT_THRESHOLDS;
    try {
      const { data: dbThresholds, error: thErr } = await supabase
        .from('alert_thresholds')
        .select('level, percent, label, emoji, color, tone, notify_roles')
        .order('level', { ascending: true });

      if (!thErr && dbThresholds && dbThresholds.length > 0) {
        THRESHOLDS = dbThresholds;
      }
    } catch {
      console.warn('Could not load alert_thresholds table, using defaults');
    }

    // Fetch all non-GREEN units that have a deadline set
    const { data: units, error: unitsError } = await supabase
      .from('units')
      .select(`
        id,
        title,
        required_green_by,
        computed_status,
        current_escalation_level,
        created_at,
        workstream_id,
        workstreams!inner(
          id,
          name,
          program_id,
          programs!inner(
            id,
            name,
            org_id
          )
        )
      `)
      .not('computed_status', 'eq', 'GREEN')
      .not('required_green_by', 'is', null);

    if (unitsError) throw unitsError;

    let alertsSent = 0;
    let unitsChecked = 0;
    const results: any[] = [];
    const skipped: any[] = [];

    // Build threshold percentages string for email footer
    const thresholdPcts = THRESHOLDS.map(t => `${t.percent}%`).join(', ');

    for (const unit of units || []) {
      unitsChecked++;
      const workstream = unit.workstreams as any;
      const program = workstream?.programs;

      const createdAt = new Date(unit.created_at);
      const deadline = new Date(unit.required_green_by);
      const totalDuration = deadline.getTime() - createdAt.getTime();

      // If deadline has already passed, treat as 100% elapsed (overdue)
      let percentElapsed: number;
      if (now.getTime() >= deadline.getTime()) {
        percentElapsed = 100;
      } else if (totalDuration <= 0) {
        // Created after deadline but somehow not yet past deadline — shouldn't happen, skip
        skipped.push({ unit: unit.title, reason: 'negative_duration', created_at: unit.created_at, deadline: unit.required_green_by });
        continue;
      } else {
        const elapsed = now.getTime() - createdAt.getTime();
        percentElapsed = Math.min(Math.round((elapsed / totalDuration) * 100), 100);
      }

      // Determine reminder level based on percentage thresholds
      let targetLevel = 0;
      let threshold = THRESHOLDS[0];
      for (const t of THRESHOLDS) {
        if (percentElapsed >= t.percent) {
          targetLevel = t.level;
          threshold = t;
        }
      }

      const currentLevel = unit.current_escalation_level || 0;

      // Only remind if we've crossed a NEW threshold
      if (targetLevel <= currentLevel || targetLevel === 0) {
        skipped.push({ unit: unit.title, reason: 'level_already_sent', percent: percentElapsed, targetLevel, currentLevel, orgId: program?.org_id });
        continue;
      }

      // Build recipient list dynamically from notify_roles in the threshold
      const orgId = program?.org_id;
      const recipients: { email: string; name: string; role: string; user_id?: string }[] = [];
      const addedEmails = new Set<string>();

      if (!orgId) {
        console.warn(`Unit "${unit.title}" has no org_id on its program — skipping`);
        skipped.push({ unit: unit.title, reason: 'no_org_id' });
        continue;
      }

      // Get the roles that should be notified at THIS level
      const rolesToNotify: string[] = threshold.notify_roles || [];

      for (const role of rolesToNotify) {
        if (role === 'PLATFORM_ADMIN') {
          // Platform admins oversee everything — no org filter
          const { data: admins } = await supabase
            .from('profiles')
            .select('user_id, email, full_name, role')
            .eq('role', 'PLATFORM_ADMIN');

          for (const admin of admins || []) {
            if (admin.email && !addedEmails.has(admin.email)) {
              addedEmails.add(admin.email);
              recipients.push({
                email: admin.email,
                name: admin.full_name || admin.email.split('@')[0],
                role: 'PLATFORM_ADMIN',
                user_id: admin.user_id,
              });
            }
          }
        } else {
          // Org-scoped roles (WORKSTREAM_LEAD, PROGRAM_OWNER, etc.)
          const { data: users } = await supabase
            .from('profiles')
            .select('user_id, email, full_name, role')
            .eq('org_id', orgId)
            .eq('role', role);

          for (const user of users || []) {
            if (user.email && !addedEmails.has(user.email)) {
              addedEmails.add(user.email);
              recipients.push({
                email: user.email,
                name: user.full_name || user.email.split('@')[0],
                role: role,
                user_id: user.user_id,
              });
            }
          }
        }
      }

      if (recipients.length === 0) {
        skipped.push({ unit: unit.title, reason: 'no_recipients', orgId, roles: rolesToNotify });
        continue;
      }

      const msRemaining = deadline.getTime() - now.getTime();
      const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
      const deadlineStr = deadline.toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      });

      // Create escalation record for audit trail
      await supabase.from('unit_escalations').insert({
        unit_id: unit.id,
        workstream_id: unit.workstream_id,
        program_id: workstream?.program_id || program?.id,
        level: targetLevel,
        triggered_at: now.toISOString(),
        threshold_minutes_past_deadline: 0,
        recipients: recipients.map((r) => ({ email: r.email, level: targetLevel })),
        status: 'active',
      });

      // Update unit's current level
      await supabase
        .from('units')
        .update({ current_escalation_level: targetLevel })
        .eq('id', unit.id);

      // Create in-app notifications for all recipients
      const inAppNotifications = recipients
        .filter(r => r.user_id)
        .map(r => ({
          user_id: r.user_id,
          title: `${threshold.emoji} ${threshold.label}`,
          message: `"${unit.title}" has reached ${percentElapsed}% of its timeline. ${daysRemaining > 0 ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining.` : 'The deadline has passed.'}`,
          type: 'deadline_approaching',
          priority: targetLevel >= 3 ? 'critical' : targetLevel >= 2 ? 'high' : 'normal',
          related_unit_id: unit.id,
          action_url: `/units/${unit.id}`,
          metadata: {
            threshold_level: targetLevel,
            percent_elapsed: percentElapsed,
            days_remaining: daysRemaining,
            unit_title: unit.title,
            workstream_name: workstream?.name,
            program_name: program?.name,
          },
        }));

      if (inAppNotifications.length > 0) {
        await supabase.from('in_app_notifications').insert(inAppNotifications);
      }

      // Send polite reminder emails (1200ms delay between sends for Resend rate limit)
      for (let ri = 0; ri < recipients.length; ri++) {
        if (ri > 0) await new Promise(r => setTimeout(r, 1200));
        const recipient = recipients[ri];
        const subject = `${threshold.emoji} Deadline Reminder: "${unit.title}" — ${percentElapsed}% of timeline elapsed`;

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: ${threshold.color}; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">${threshold.emoji} ${threshold.label}</h1>
              <p style="margin: 5px 0 0 0; font-size: 14px;">Automatic Deadline Reminder</p>
            </div>

            <div style="padding: 20px; background: #f9fafb; border: 1px solid #e5e7eb;">
              <p>Hi ${escapeHtml(recipient.name)},</p>

              <p>${escapeHtml(threshold.tone)} — <strong>${percentElapsed}%</strong> of the allocated time for
              <strong>"${escapeHtml(unit.title)}"</strong> has been used.</p>

              <div style="background: #fff; border-left: 4px solid ${threshold.color}; padding: 15px; margin: 15px 0;">
                <strong style="font-size: 18px;">${daysRemaining > 0 ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining` : 'The deadline has passed'}</strong>
                <p style="margin: 8px 0 0 0; color: #6b7280;">Deadline: ${deadlineStr}</p>
              </div>

              <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                <tr>
                  <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Unit:</strong></td>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(unit.title)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Workstream:</strong></td>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(workstream?.name || 'N/A')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Program:</strong></td>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(program?.name || 'N/A')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Current Status:</strong></td>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(unit.computed_status || 'IN PROGRESS')}</td>
                </tr>
              </table>

              <p>Please ensure this task is on track to meet its deadline. If you're facing any blockers,
              please raise a manual escalation through the portal.</p>

              <a href="https://celestar.app/units/${unit.id}"
                 style="display: inline-block; background: ${threshold.color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">
                View Unit in Portal
              </a>
            </div>

            <div style="padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
              <p>This is an automatic deadline reminder from Celestar</p>
              <p>Reminders are sent at ${thresholdPcts} of the timeline</p>
            </div>
          </div>
        `;

        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: 'Celestar Reminders <alerts@celestar.app>',
              to: [recipient.email],
              subject,
              html,
            }),
          });

          if (res.ok) {
            alertsSent++;
            console.log(`Reminder L${targetLevel} sent to ${recipient.email} for "${unit.title}" (${percentElapsed}%)`);
          } else {
            const errText = await res.text();
            console.error(`Failed to send to ${recipient.email}:`, errText);
          }
        } catch (err: any) {
          console.error(`Error sending to ${recipient.email}:`, err.message);
        }
      }

      results.push({
        unit: unit.title,
        percent: percentElapsed,
        previousLevel: currentLevel,
        newLevel: targetLevel,
        orgId: orgId,
        recipientCount: recipients.length,
        recipientEmails: recipients.map(r => `${r.email} (${r.role})`),
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        thresholds_used: THRESHOLDS.map(t => ({ level: t.level, percent: t.percent, roles: t.notify_roles })),
        units_checked: unitsChecked,
        reminders_sent: alertsSent,
        details: results,
        skipped: skipped,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Deadline reminder error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
