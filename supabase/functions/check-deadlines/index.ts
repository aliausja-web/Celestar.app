import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Find units with approaching deadlines (next 3 days) that aren't completed
    const { data: approachingUnits, error: approachingError } = await supabase
      .from('units')
      .select(`
        id,
        title,
        required_green_by,
        computed_status,
        workstreams!inner(
          id,
          name,
          lead_email,
          programs!inner(
            id,
            name,
            owner_email,
            org_id
          )
        )
      `)
      .gte('required_green_by', now.toISOString())
      .lte('required_green_by', threeDaysFromNow.toISOString())
      .not('computed_status', 'eq', 'GREEN');

    if (approachingError) throw approachingError;

    // Find overdue units
    const { data: overdueUnits, error: overdueError } = await supabase
      .from('units')
      .select(`
        id,
        title,
        required_green_by,
        computed_status,
        workstreams!inner(
          id,
          name,
          lead_email,
          programs!inner(
            id,
            name,
            owner_email,
            org_id
          )
        )
      `)
      .lt('required_green_by', now.toISOString())
      .not('computed_status', 'eq', 'GREEN');

    if (overdueError) throw overdueError;

    const notifications: any[] = [];

    // Process approaching deadline notifications
    for (const unit of approachingUnits || []) {
      const workstream = unit.workstreams as any;
      const program = workstream?.programs;
      const deadline = new Date(unit.required_green_by);
      const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      if (workstream?.lead_email) {
        notifications.push({
          escalation_id: null,
          recipient_email: workstream.lead_email,
          recipient_name: workstream.lead_email.split('@')[0],
          channel: 'email',
          subject: `⏰ Deadline Approaching: "${unit.title}" - ${daysUntil} day${daysUntil === 1 ? '' : 's'} left`,
          message: `Unit "${unit.title}" in workstream "${workstream.name}" has a deadline approaching.\n\nDeadline: ${deadline.toLocaleDateString()}\nDays remaining: ${daysUntil}\nCurrent status: ${unit.computed_status || 'IN PROGRESS'}`,
          template_data: {
            unit_title: unit.title,
            workstream_name: workstream.name,
            deadline: deadline.toISOString(),
            days_remaining: daysUntil,
            priority: daysUntil <= 1 ? 'critical' : 'high',
          },
          status: 'pending',
        });
      }

      if (daysUntil <= 1 && program?.owner_email) {
        notifications.push({
          escalation_id: null,
          recipient_email: program.owner_email,
          recipient_name: program.owner_email.split('@')[0],
          channel: 'email',
          subject: `🚨 URGENT: "${unit.title}" deadline is TOMORROW`,
          message: `URGENT: Unit "${unit.title}" deadline is tomorrow!\n\nProgram: ${program.name}\nWorkstream: ${workstream.name}`,
          template_data: {
            unit_title: unit.title,
            program_name: program.name,
            priority: 'critical',
          },
          status: 'pending',
        });
      }
    }

    // Process overdue notifications
    for (const unit of overdueUnits || []) {
      const workstream = unit.workstreams as any;
      const program = workstream?.programs;
      const deadline = new Date(unit.required_green_by);
      const daysOverdue = Math.ceil((now.getTime() - deadline.getTime()) / (24 * 60 * 60 * 1000));

      const recipients = [workstream?.lead_email, program?.owner_email].filter(Boolean);

      for (const email of recipients) {
        notifications.push({
          escalation_id: null,
          recipient_email: email,
          recipient_name: email.split('@')[0],
          channel: 'email',
          subject: `🔴 OVERDUE: "${unit.title}" - ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} past deadline`,
          message: `OVERDUE: Unit "${unit.title}" is past its deadline!\n\nDays overdue: ${daysOverdue}`,
          template_data: {
            unit_title: unit.title,
            days_overdue: daysOverdue,
            priority: 'critical',
          },
          status: 'pending',
        });
      }
    }

    // Dedupe and insert
    if (notifications.length > 0) {
      const seen = new Set();
      const uniqueNotifications = notifications.filter((n) => {
        const key = `${n.recipient_email}:${n.subject}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      await supabase.from('escalation_notifications').insert(uniqueNotifications);

      // Now send all pending emails
      const { data: pendingNotifications } = await supabase
        .from('escalation_notifications')
        .select('*')
        .eq('status', 'pending')
        .limit(50);

      let sentCount = 0;
      for (const notification of pendingNotifications || []) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: 'Celestar Platform <notifications@celestar.app>',
              to: [notification.recipient_email],
              subject: notification.subject,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #1a1a2e;">${notification.subject}</h2>
                  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
                    <pre style="white-space: pre-wrap; font-family: inherit;">${notification.message}</pre>
                  </div>
                  <p style="color: #666; font-size: 12px; margin-top: 20px;">
                    This is an automated notification from Celestar Platform.
                  </p>
                </div>
              `,
            }),
          });

          if (res.ok) {
            await supabase
              .from('escalation_notifications')
              .update({ status: 'sent', sent_at: new Date().toISOString() })
              .eq('id', notification.id);
            sentCount++;
          } else {
            const errorText = await res.text();
            await supabase
              .from('escalation_notifications')
              .update({ status: 'failed', error_message: errorText })
              .eq('id', notification.id);
          }
        } catch (err: any) {
          await supabase
            .from('escalation_notifications')
            .update({ status: 'failed', error_message: err.message })
            .eq('id', notification.id);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          approaching_deadlines: approachingUnits?.length || 0,
          overdue_units: overdueUnits?.length || 0,
          notifications_queued: uniqueNotifications.length,
          emails_sent: sentCount,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        approaching_deadlines: 0,
        overdue_units: 0,
        message: 'No deadline reminders needed',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Deadline check error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
