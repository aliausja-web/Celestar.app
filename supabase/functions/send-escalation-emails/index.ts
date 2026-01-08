// Supabase Edge Function to send escalation emails via Resend
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface EmailNotification {
  id: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  message: string;
  template_data: any;
  escalation_id: string;
}

serve(async (req) => {
  try {
    // Initialize Supabase client with service role (bypass RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all pending email notifications
    const { data: pendingEmails, error: fetchError } = await supabase
      .from('escalation_notifications')
      .select('*')
      .eq('status', 'pending')
      .eq('channel', 'email')
      .limit(50); // Process max 50 at a time

    if (fetchError) {
      console.error('Error fetching emails:', fetchError);
      throw fetchError;
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending emails to send', count: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${pendingEmails.length} pending emails...`);

    let sentCount = 0;
    let failedCount = 0;

    // Process each email
    for (const email of pendingEmails) {
      try {
        // Send email via Resend
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'Celestar Alerts <notifications@celestar.app>',
            to: [email.recipient_email],
            subject: email.subject,
            html: formatEmailHTML(email),
            text: email.message, // Plain text fallback
          }),
        });

        const result = await response.json();

        if (response.ok) {
          // Email sent successfully
          await supabase
            .from('escalation_notifications')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              delivery_status: 'delivered',
              external_id: result.id, // Resend's email ID
            })
            .eq('id', email.id);

          sentCount++;
          console.log(`✅ Sent email to ${email.recipient_email}`);
        } else {
          // Email failed
          await supabase
            .from('escalation_notifications')
            .update({
              status: 'failed',
              error_message: JSON.stringify(result),
            })
            .eq('id', email.id);

          failedCount++;
          console.error(`❌ Failed to send to ${email.recipient_email}:`, result);
        }
      } catch (emailError) {
        // Mark as failed
        await supabase
          .from('escalation_notifications')
          .update({
            status: 'failed',
            error_message: emailError.message,
          })
          .eq('id', email.id);

        failedCount++;
        console.error(`❌ Error sending to ${email.recipient_email}:`, emailError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: pendingEmails.length,
        sent: sentCount,
        failed: failedCount,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Format email with HTML template
 */
function formatEmailHTML(email: EmailNotification): string {
  const priorityColor = getPriorityColor(email.template_data?.priority || 'normal');
  const priorityLabel = getPriorityLabel(email.template_data?.priority || 'normal');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${email.subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${priorityColor}; padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">
                ${priorityLabel} Escalation Alert
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px;">
                Hi ${email.recipient_name || 'there'},
              </p>

              <div style="background-color: #f9f9f9; border-left: 4px solid ${priorityColor}; padding: 15px; margin-bottom: 20px;">
                <p style="margin: 0; color: #333333; font-size: 14px; white-space: pre-wrap;">
                  ${email.message}
                </p>
              </div>

              ${email.template_data?.unit_title ? `
              <table width="100%" cellpadding="8" cellspacing="0" style="margin-bottom: 20px; border: 1px solid #e0e0e0; border-radius: 4px;">
                <tr>
                  <td style="background-color: #f5f5f5; font-weight: bold; color: #666; font-size: 14px;">Unit:</td>
                  <td style="color: #333; font-size: 14px;">${email.template_data.unit_title}</td>
                </tr>
                <tr>
                  <td style="background-color: #f5f5f5; font-weight: bold; color: #666; font-size: 14px;">Escalation Level:</td>
                  <td style="color: #333; font-size: 14px;">Level ${email.template_data.escalation_level || 'N/A'}</td>
                </tr>
                ${email.template_data.reason ? `
                <tr>
                  <td style="background-color: #f5f5f5; font-weight: bold; color: #666; font-size: 14px;">Reason:</td>
                  <td style="color: #333; font-size: 14px;">${email.template_data.reason}</td>
                </tr>
                ` : ''}
              </table>
              ` : ''}

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-top: 20px;">
                    <a href="https://celestar.app/programs" style="display: inline-block; padding: 12px 30px; background-color: ${priorityColor}; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 16px; font-weight: bold;">
                      View in Portal
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #999; font-size: 12px;">
                This is an automated notification from Celestar Execution Readiness Portal
              </p>
              <p style="margin: 0; color: #999; font-size: 12px;">
                © ${new Date().getFullYear()} Celestar. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'critical':
      return '#dc2626'; // red
    case 'high':
      return '#ea580c'; // orange
    case 'normal':
      return '#2563eb'; // blue
    default:
      return '#6b7280'; // gray
  }
}

function getPriorityLabel(priority: string): string {
  switch (priority) {
    case 'critical':
      return '🚨 CRITICAL';
    case 'high':
      return '⚠️ URGENT';
    case 'normal':
      return '📢 NOTICE';
    default:
      return 'ALERT';
  }
}
