// Supabase Edge Function: Process and send pending escalation notification emails
// This function ONLY processes the escalation_notifications queue
// Manual escalations are sent directly by the API route — this handles overflow/retries
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all pending email notifications
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
        // Check if linked escalation is still active
        if (email.escalation_id) {
          const { data: escalation } = await supabase
            .from('unit_escalations')
            .select('status')
            .eq('id', email.escalation_id)
            .single();

          if (escalation?.status === 'resolved') {
            await supabase
              .from('escalation_notifications')
              .update({ status: 'failed', error_message: 'Escalation resolved before email sent' })
              .eq('id', email.id);
            continue;
          }
        }

        // These are deadline REMINDERS (queued by check-deadlines or deadline-reminders cron)
        // NOT manual escalations — those are sent directly by the API route
        const priority = email.template_data?.priority || 'normal';
        const html = formatReminderEmail(email, priority);

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'Celestar Reminders <alerts@celestar.app>',
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
      } catch (emailError) {
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
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Format as a polite deadline REMINDER — NOT an escalation
 */
function formatReminderEmail(email: any, priority: string): string {
  const color = priority === 'critical' ? '#dc2626' : priority === 'high' ? '#ea580c' : '#2563eb';
  const label = priority === 'critical' ? 'Final Reminder' : priority === 'high' ? 'Important Reminder' : 'Friendly Reminder';
  const emoji = priority === 'critical' ? '⏳' : priority === 'high' ? '📌' : '📋';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${color}; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">${emoji} ${label}</h1>
        <p style="margin: 5px 0 0 0; font-size: 14px;">Automatic Deadline Reminder</p>
      </div>

      <div style="padding: 20px; background: #f9fafb; border: 1px solid #e5e7eb;">
        <p>Hi ${email.recipient_name || 'there'},</p>

        <div style="background: #fff; border-left: 4px solid ${color}; padding: 15px; margin: 15px 0;">
          <p style="margin: 0; white-space: pre-wrap;">${email.message}</p>
        </div>

        ${email.template_data?.unit_title ? `
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Unit:</strong></td>
            <td style="padding: 8px; border: 1px solid #e5e7eb;">${email.template_data.unit_title}</td>
          </tr>
          ${email.template_data.workstream_name ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Workstream:</strong></td>
            <td style="padding: 8px; border: 1px solid #e5e7eb;">${email.template_data.workstream_name}</td>
          </tr>` : ''}
          ${email.template_data.program_name ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Program:</strong></td>
            <td style="padding: 8px; border: 1px solid #e5e7eb;">${email.template_data.program_name}</td>
          </tr>` : ''}
          ${email.template_data.days_remaining ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Days Remaining:</strong></td>
            <td style="padding: 8px; border: 1px solid #e5e7eb;">${email.template_data.days_remaining}</td>
          </tr>` : ''}
          ${email.template_data.days_overdue ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Days Overdue:</strong></td>
            <td style="padding: 8px; border: 1px solid #e5e7eb;">${email.template_data.days_overdue}</td>
          </tr>` : ''}
        </table>
        ` : ''}

        <p>Please ensure this task is on track. If you're facing blockers, raise a manual escalation through the portal.</p>

        <a href="https://celestar.app/programs"
           style="display: inline-block; background: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">
          View in Portal
        </a>
      </div>

      <div style="padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
        <p>This is an automatic deadline reminder from Celestar</p>
      </div>
    </div>
  `.trim();
}
