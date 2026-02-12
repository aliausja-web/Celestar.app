import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

// POST /api/cron/deadline-reminders - Check for approaching deadlines and send notifications
// This endpoint should be called by a cron job (e.g., daily at 9 AM)
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Allow if CRON_SECRET matches OR if called from Supabase Edge Function
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Also check for service role key for internal calls
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (authHeader !== `Bearer ${supabaseServiceKey}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const supabase = getSupabaseServer();
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Shared query shape (no lead_email/owner_email — those columns don't exist)
    const unitSelect = `
      id,
      title,
      required_green_by,
      computed_status,
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
    `;

    // Find units with approaching deadlines (next 3 days) that aren't completed
    const { data: approachingUnits, error: approachingError } = await supabase
      .from('units')
      .select(unitSelect)
      .gte('required_green_by', now.toISOString())
      .lte('required_green_by', threeDaysFromNow.toISOString())
      .not('computed_status', 'eq', 'GREEN');

    if (approachingError) throw approachingError;

    // Find overdue units
    const { data: overdueUnits, error: overdueError } = await supabase
      .from('units')
      .select(unitSelect)
      .lt('required_green_by', now.toISOString())
      .not('computed_status', 'eq', 'GREEN');

    if (overdueError) throw overdueError;

    const notifications: any[] = [];

    // Helper: look up recipients by org_id + role from profiles table
    const getRecipientsByRole = async (orgId: string, role: string) => {
      const { data } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('org_id', orgId)
        .eq('role', role);
      return (data || []).filter((p: any) => p.email);
    };

    // Process approaching deadline notifications
    for (const unit of approachingUnits || []) {
      const workstream = unit.workstreams as any;
      const program = workstream?.programs;
      const orgId = program?.org_id;
      if (!orgId) continue;

      const deadline = new Date(unit.required_green_by);
      const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      // Notify workstream leads in the org
      const wsLeads = await getRecipientsByRole(orgId, 'WORKSTREAM_LEAD');
      for (const lead of wsLeads) {
        notifications.push({
          escalation_id: null,
          recipient_email: lead.email,
          recipient_name: lead.full_name || lead.email.split('@')[0],
          channel: 'email',
          subject: `Deadline Approaching: "${unit.title}" - ${daysUntil} day${daysUntil === 1 ? '' : 's'} left`,
          message: `Unit "${unit.title}" in workstream "${workstream.name}" has a deadline approaching.\n\nDeadline: ${deadline.toLocaleDateString()}\nDays remaining: ${daysUntil}\nCurrent status: ${unit.computed_status || 'IN PROGRESS'}\n\nPlease ensure this unit is completed on time.`,
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

      // Also notify program owners if deadline is tomorrow
      if (daysUntil <= 1) {
        const progOwners = await getRecipientsByRole(orgId, 'PROGRAM_OWNER');
        for (const owner of progOwners) {
          notifications.push({
            escalation_id: null,
            recipient_email: owner.email,
            recipient_name: owner.full_name || owner.email.split('@')[0],
            channel: 'email',
            subject: `URGENT: "${unit.title}" deadline is TOMORROW`,
            message: `URGENT: Unit "${unit.title}" deadline is tomorrow!\n\nProgram: ${program.name}\nWorkstream: ${workstream.name}\nDeadline: ${deadline.toLocaleDateString()}\nCurrent status: ${unit.computed_status || 'IN PROGRESS'}\n\nImmediate attention required.`,
            template_data: {
              unit_title: unit.title,
              program_name: program.name,
              workstream_name: workstream.name,
              deadline: deadline.toISOString(),
              priority: 'critical',
            },
            status: 'pending',
          });
        }
      }
    }

    // Process overdue notifications
    for (const unit of overdueUnits || []) {
      const workstream = unit.workstreams as any;
      const program = workstream?.programs;
      const orgId = program?.org_id;
      if (!orgId) continue;

      const deadline = new Date(unit.required_green_by);
      const daysOverdue = Math.ceil((now.getTime() - deadline.getTime()) / (24 * 60 * 60 * 1000));

      // Notify both workstream leads and program owners for overdue
      const wsLeads = await getRecipientsByRole(orgId, 'WORKSTREAM_LEAD');
      const progOwners = await getRecipientsByRole(orgId, 'PROGRAM_OWNER');
      const allRecipients = [...wsLeads, ...progOwners];
      const seen = new Set<string>();

      for (const recipient of allRecipients) {
        if (seen.has(recipient.email)) continue;
        seen.add(recipient.email);
        notifications.push({
          escalation_id: null,
          recipient_email: recipient.email,
          recipient_name: recipient.full_name || recipient.email.split('@')[0],
          channel: 'email',
          subject: `OVERDUE: "${unit.title}" - ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} past deadline`,
          message: `OVERDUE ALERT: Unit "${unit.title}" is past its deadline!\n\nProgram: ${program?.name}\nWorkstream: ${workstream?.name}\nDeadline was: ${deadline.toLocaleDateString()}\nDays overdue: ${daysOverdue}\nCurrent status: ${unit.computed_status || 'IN PROGRESS'}\n\nThis requires immediate escalation and resolution.`,
          template_data: {
            unit_title: unit.title,
            program_name: program?.name,
            workstream_name: workstream?.name,
            deadline: deadline.toISOString(),
            days_overdue: daysOverdue,
            priority: 'critical',
          },
          status: 'pending',
        });
      }
    }

    // Insert notifications (dedupe by email + unit)
    if (notifications.length > 0) {
      // Simple dedupe by recipient + subject
      const seen = new Set();
      const uniqueNotifications = notifications.filter(n => {
        const key = `${n.recipient_email}:${n.subject}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      await supabase.from('escalation_notifications').insert(uniqueNotifications);

      // Trigger Edge Function to send emails
      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-escalation-emails`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
      } catch (emailError) {
        console.warn('Failed to trigger email function:', emailError);
      }

      return NextResponse.json({
        success: true,
        approaching_deadlines: approachingUnits?.length || 0,
        overdue_units: overdueUnits?.length || 0,
        notifications_queued: uniqueNotifications.length,
      });
    }

    return NextResponse.json({
      success: true,
      approaching_deadlines: 0,
      overdue_units: 0,
      notifications_queued: 0,
      message: 'No deadline reminders needed',
    });
  } catch (error: any) {
    console.error('Deadline reminder error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET for health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'deadline-reminders',
    description: 'Call POST to check deadlines and send notifications'
  });
}
