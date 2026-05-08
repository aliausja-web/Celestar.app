// Supabase Edge Function: Process and send pending escalation/alert notification emails
// Handles both automatic deadline alerts (L1/L2/L3) and overflow from other queued notifications.
// Manual escalations are sent directly by the API route — this processes the queue.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (_req) => {
  try {
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY is not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all pending email notifications (process up to 50 at a time)
    const { data: pendingEmails, error: fetchError } = await supabase
      .from('escalation_notifications')
      .select('*')
      .eq('status', 'pending')
      .eq('channel', 'email')
      .limit(50);

    if (fetchError) throw fetchError;

    if (!pendingEmails || pendingEmails.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending emails to send', count: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const email of pendingEmails) {
      try {
        // If this notification is tied to an escalation, skip if that escalation resolved
        if (email.escalation_id) {
          const { data: escalation } = await supabase
            .from('unit_escalations')
            .select('status')
            .eq('id', email.escalation_id)
            .single();

          if (escalation?.status === 'resolved') {
            await supabase
              .from('escalation_notifications')
              .update({
                status: 'failed',
                error_message: 'Escalation resolved before email was sent',
              })
              .eq('id', email.id);
            continue;
          }
        }

        const alertLevel = email.template_data?.alert_level
          ? Number(email.template_data.alert_level)
          : null;
        const priority = email.template_data?.priority || 'normal';

        const html = alertLevel
          ? formatDeadlineAlertEmail(email, alertLevel, priority)
          : formatReminderEmail(email, priority);

        // Throttle to avoid Resend rate limits (2 req/sec on free plan)
        await new Promise((r) => setTimeout(r, 600));

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'Celestar Alerts <alerts@celestar.app>',
            to: [email.recipient_email],
            subject: email.subject,
            html,
            text: email.message,
          }),
        });

        const result = await response.json();

        if (response.ok) {
          await supabase
            .from('escalation_notifications')
            .update({ status: 'sent', sent_at: new Date().toISOString(), external_id: result.id })
            .eq('id', email.id);
          sentCount++;
        } else {
          await supabase
            .from('escalation_notifications')
            .update({ status: 'failed', error_message: JSON.stringify(result) })
            .eq('id', email.id);
          failedCount++;
        }
      } catch (emailError: any) {
        await supabase
          .from('escalation_notifications')
          .update({ status: 'failed', error_message: emailError.message })
          .eq('id', email.id);
        failedCount++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, failed: failedCount }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// ─── Email formatters ────────────────────────────────────────────────────────

/**
 * Renders a structured deadline alert email for L1 / L2 / L3 alerts.
 * Colour and tone shift with the level so recipients immediately grasp urgency.
 */
function formatDeadlineAlertEmail(email: any, level: number, priority: string): string {
  const td = email.template_data || {};
  const pct = td.percentage_elapsed ? `${td.percentage_elapsed}%` : '';

  const levelConfig: Record<number, { color: string; badge: string; tone: string }> = {
    1: { color: '#ca8a04', badge: 'L1 — Deadline Alert',   tone: 'Heads up' },
    2: { color: '#ea580c', badge: 'L2 — Action Required',  tone: 'Action required' },
    3: { color: '#dc2626', badge: 'L3 — Critical Alert',   tone: 'Immediate intervention required' },
  };
  const cfg = levelConfig[level] ?? levelConfig[3];

  const escHtml = (s: string) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');

  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:${cfg.color};color:#fff;padding:20px;text-align:center;">
    <h1 style="margin:0;font-size:20px;">${escHtml(cfg.badge)}</h1>
    ${pct ? `<p style="margin:6px 0 0;font-size:14px;">Deadline window ${escHtml(pct)} elapsed</p>` : ''}
  </div>

  <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;">
    <p>Hi ${escHtml(email.recipient_name || 'there')},</p>

    <div style="background:#fff;border-left:4px solid ${cfg.color};padding:15px;margin:15px 0;">
      <p style="margin:0;white-space:pre-wrap;">${escHtml(email.message)}</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin:15px 0;">
      ${td.unit_title ? `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;width:140px;"><strong>Unit</strong></td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${escHtml(td.unit_title)}</td>
      </tr>` : ''}
      ${td.workstream_name ? `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;"><strong>Workstream</strong></td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${escHtml(td.workstream_name)}</td>
      </tr>` : ''}
      ${td.program_name ? `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;"><strong>Program</strong></td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${escHtml(td.program_name)}</td>
      </tr>` : ''}
      ${pct ? `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;"><strong>Timeline Used</strong></td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${escHtml(pct)}</td>
      </tr>` : ''}
    </table>

    <p><strong>${escHtml(cfg.tone)}.</strong> Please log in to the portal to review this unit.</p>

    <a href="https://celestar.app/units/${escHtml(td.unit_id || '')}"
       style="display:inline-block;background:${cfg.color};color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin-top:10px;">
      View Unit in Portal
    </a>
  </div>

  <div style="padding:15px;text-align:center;color:#6b7280;font-size:12px;">
    <p>Automatic deadline alert from Celestar Execution Portal</p>
  </div>
</div>`.trim();
}

/**
 * Generic reminder email — used for non-level-tagged notifications
 * (e.g. manual escalation overflow or legacy deadline_approaching records).
 */
function formatReminderEmail(email: any, priority: string): string {
  const color =
    priority === 'critical' ? '#dc2626' : priority === 'high' ? '#ea580c' : '#2563eb';
  const label =
    priority === 'critical' ? 'Final Reminder' : priority === 'high' ? 'Important Reminder' : 'Friendly Reminder';
  const emoji = priority === 'critical' ? '⏳' : priority === 'high' ? '📌' : '📋';
  const td = email.template_data || {};

  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:${color};color:#fff;padding:20px;text-align:center;">
    <h1 style="margin:0;">${emoji} ${label}</h1>
    <p style="margin:5px 0 0;font-size:14px;">Automatic Deadline Reminder</p>
  </div>

  <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;">
    <p>Hi ${email.recipient_name || 'there'},</p>

    <div style="background:#fff;border-left:4px solid ${color};padding:15px;margin:15px 0;">
      <p style="margin:0;white-space:pre-wrap;">${email.message}</p>
    </div>

    ${td.unit_title ? `
    <table style="width:100%;border-collapse:collapse;margin:15px 0;">
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;"><strong>Unit:</strong></td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${td.unit_title}</td>
      </tr>
      ${td.workstream_name ? `<tr>
        <td style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;"><strong>Workstream:</strong></td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${td.workstream_name}</td>
      </tr>` : ''}
      ${td.program_name ? `<tr>
        <td style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;"><strong>Program:</strong></td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${td.program_name}</td>
      </tr>` : ''}
      ${td.days_remaining ? `<tr>
        <td style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;"><strong>Days Remaining:</strong></td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${td.days_remaining}</td>
      </tr>` : ''}
      ${td.days_overdue ? `<tr>
        <td style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;"><strong>Days Overdue:</strong></td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${td.days_overdue}</td>
      </tr>` : ''}
    </table>` : ''}

    <p>Please ensure this task is on track. If you're facing blockers, raise a manual escalation through the portal.</p>

    <a href="https://celestar.app/programs"
       style="display:inline-block;background:${color};color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin-top:10px;">
      View in Portal
    </a>
  </div>

  <div style="padding:15px;text-align:center;color:#6b7280;font-size:12px;">
    <p>This is an automatic deadline reminder from Celestar</p>
  </div>
</div>`.trim();
}
