// Supabase Edge Function: Automatic Deadline Reminders
// Polite reminders at 50%, 75%, and 90% of timeline elapsed
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const THRESHOLDS = [
  { level: 1, percent: 50, label: 'Friendly Reminder', emoji: '📋', color: '#2563eb', tone: 'We wanted to give you a heads-up' },
  { level: 2, percent: 75, label: 'Important Reminder', emoji: '📌', color: '#ea580c', tone: 'This is an important reminder that time is moving along' },
  { level: 3, percent: 90, label: 'Final Reminder', emoji: '⏳', color: '#dc2626', tone: 'This is a final reminder — the deadline is very close' },
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

    for (const unit of units || []) {
      unitsChecked++;
      const workstream = unit.workstreams as any;
      const program = workstream?.programs;

      const createdAt = new Date(unit.created_at);
      const deadline = new Date(unit.required_green_by);
      const totalDuration = deadline.getTime() - createdAt.getTime();

      if (totalDuration <= 0) continue;

      const elapsed = now.getTime() - createdAt.getTime();
      const percentElapsed = Math.min(Math.round((elapsed / totalDuration) * 100), 100);

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
      if (targetLevel <= currentLevel || targetLevel === 0) continue;

      // Build recipient list based on level using profiles table (org_id + role)
      // This matches the same reliable pattern used by manual escalations
      const orgId = program?.org_id;
      const recipients: { email: string; name: string; role: string }[] = [];
      const addedEmails = new Set<string>();

      if (!orgId) {
        console.warn(`Unit "${unit.title}" has no org_id on its program — skipping`);
        continue;
      }

      // L1+: Workstream Leads in the same org
      const { data: wsLeads } = await supabase
        .from('profiles')
        .select('email, full_name, role')
        .eq('org_id', orgId)
        .eq('role', 'WORKSTREAM_LEAD');

      for (const lead of wsLeads || []) {
        if (lead.email && !addedEmails.has(lead.email)) {
          addedEmails.add(lead.email);
          recipients.push({
            email: lead.email,
            name: lead.full_name || lead.email.split('@')[0],
            role: 'WORKSTREAM_LEAD',
          });
        }
      }

      // L2+: Program Owners in the same org
      if (targetLevel >= 2) {
        const { data: progOwners } = await supabase
          .from('profiles')
          .select('email, full_name, role')
          .eq('org_id', orgId)
          .eq('role', 'PROGRAM_OWNER');

        for (const owner of progOwners || []) {
          if (owner.email && !addedEmails.has(owner.email)) {
            addedEmails.add(owner.email);
            recipients.push({
              email: owner.email,
              name: owner.full_name || owner.email.split('@')[0],
              role: 'PROGRAM_OWNER',
            });
          }
        }
      }

      // L3: Platform Admins (any org — they oversee everything)
      if (targetLevel >= 3) {
        const { data: admins } = await supabase
          .from('profiles')
          .select('email, full_name, role')
          .eq('role', 'PLATFORM_ADMIN');

        for (const admin of admins || []) {
          if (admin.email && !addedEmails.has(admin.email)) {
            addedEmails.add(admin.email);
            recipients.push({
              email: admin.email,
              name: admin.full_name || admin.email.split('@')[0],
              role: 'PLATFORM_ADMIN',
            });
          }
        }
      }

      if (recipients.length === 0) continue;

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
              <p>Hi ${recipient.name},</p>

              <p>${threshold.tone} — <strong>${percentElapsed}%</strong> of the allocated time for
              <strong>"${unit.title}"</strong> has been used.</p>

              <div style="background: #fff; border-left: 4px solid ${threshold.color}; padding: 15px; margin: 15px 0;">
                <strong style="font-size: 18px;">${daysRemaining > 0 ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining` : 'The deadline has passed'}</strong>
                <p style="margin: 8px 0 0 0; color: #6b7280;">Deadline: ${deadlineStr}</p>
              </div>

              <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                <tr>
                  <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Unit:</strong></td>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${unit.title}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Workstream:</strong></td>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${workstream?.name || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Program:</strong></td>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${program?.name || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Current Status:</strong></td>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${unit.computed_status || 'IN PROGRESS'}</td>
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
              <p>Reminders are sent at 50%, 75%, and 90% of the timeline</p>
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
        units_checked: unitsChecked,
        reminders_sent: alertsSent,
        details: results,
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
