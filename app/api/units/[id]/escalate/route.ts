import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// POST /api/units/[id]/escalate - Manually escalate a unit
// Manual escalation = someone raises a real-world issue (e.g. water damage, broken equipment)
// This notifies ALL users in the org + ALL PLATFORM_ADMINs — no levels involved
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN', 'PROGRAM_OWNER', 'WORKSTREAM_LEAD', 'CLIENT_VIEWER'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();
    const unitId = params.id;
    const body = await request.json();
    const { reason, mark_as_blocked } = body;

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { error: 'Escalation reason is required' },
        { status: 400 }
      );
    }

    // Get user profile to check role
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', context!.user_id)
      .single();

    const userRole = userProfile?.role;

    const canConfirmBlocked = ['WORKSTREAM_LEAD', 'PROGRAM_OWNER', 'PLATFORM_ADMIN'].includes(userRole);
    const actuallyMarkBlocked = mark_as_blocked && canConfirmBlocked;

    // Get current unit details with tenant info
    const { data: unit, error: unitError } = await supabase
      .from('units')
      .select('*, workstreams!inner(program_id, programs!inner(org_id))')
      .eq('id', unitId)
      .single();

    if (unitError || !unit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    // TENANT SAFETY: Verify unit belongs to user's organization
    const unitOrgId = (unit.workstreams as any)?.programs?.org_id;
    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // Create escalation record (level 1 for audit trail — manual escalations don't use levels)
    const { data: escalation, error: escalationError } = await supabase
      .from('unit_escalations')
      .insert([
        {
          unit_id: unitId,
          workstream_id: unit.workstream_id,
          program_id: (unit.workstreams as any)?.program_id,
          level: 1,
          triggered_at: new Date().toISOString(),
          threshold_minutes_past_deadline: 0,
          recipients: [{ type: 'manual', reason }],
          status: 'active',
        },
      ])
      .select()
      .single();

    if (escalationError) throw escalationError;

    // Get workstream and program details for the email
    const { data: workstreamData } = await supabase
      .from('workstreams')
      .select('name, programs(name)')
      .eq('id', unit.workstream_id)
      .single();

    const workstreamName = workstreamData?.name || 'Unknown Workstream';
    const programName = (workstreamData?.programs as any)?.name || 'Unknown Program';

    // MANUAL ESCALATION: Notify ALL users in the org + ALL PLATFORM_ADMINs
    const { data: sameOrgUsers } = await supabase
      .from('profiles')
      .select('user_id, email, full_name, role')
      .eq('org_id', unitOrgId)
      .neq('role', 'PLATFORM_ADMIN');

    const { data: platformAdmins } = await supabase
      .from('profiles')
      .select('user_id, email, full_name, role')
      .eq('role', 'PLATFORM_ADMIN');

    const usersToNotify = [...(sameOrgUsers || []), ...(platformAdmins || [])];

    // Get escalator's name
    const { data: escalatorProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', context!.user_id)
      .single();

    const escalatorName = escalatorProfile?.full_name || escalatorProfile?.email || 'A team member';

    let emailsSent = 0;
    let emailsFailed = 0;
    const emailErrors: string[] = [];

    // Create in-app notifications
    if (usersToNotify && usersToNotify.length > 0) {
      const notifications = usersToNotify.map((user) => ({
        user_id: user.user_id,
        title: `MANUAL ESCALATION`,
        message: `Unit "${unit.title}" has been manually escalated by ${escalatorName}. Reason: ${reason}`,
        type: 'manual_escalation',
        priority: 'critical',
        related_unit_id: unitId,
        related_escalation_id: escalation.id,
        action_url: `/units/${unitId}`,
        metadata: { unit_title: unit.title, reason },
      }));

      await supabase.from('in_app_notifications').insert(notifications);

      // Send MANUAL ESCALATION emails via Resend
      const resendKey = process.env.RESEND_API_KEY;

      if (!resendKey) {
        emailErrors.push('RESEND_API_KEY is not set in environment variables');
        console.error('RESEND_API_KEY is not set — cannot send escalation emails');
      } else {
        for (const user of usersToNotify) {
          try {
            const emailRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'Celestar <onboarding@resend.dev>',
                to: [user.email],
                subject: `MANUAL ESCALATION: "${unit.title}" - Action Required`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
                      <h1 style="margin: 0;">MANUAL ESCALATION</h1>
                      <p style="margin: 5px 0 0 0; font-size: 14px;">This is NOT an automatic reminder — a team member has raised an urgent issue</p>
                    </div>

                    <div style="padding: 20px; background: #f9fafb; border: 1px solid #e5e7eb;">
                      <p>Hi ${user.full_name || user.email},</p>

                      <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 15px 0;">
                        <strong>REASON FOR ESCALATION:</strong>
                        <p style="margin: 10px 0 0 0; font-size: 16px;">"${reason}"</p>
                      </div>

                      <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                        <tr>
                          <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Unit:</strong></td>
                          <td style="padding: 8px; border: 1px solid #e5e7eb;">${unit.title}</td>
                        </tr>
                        <tr>
                          <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Workstream:</strong></td>
                          <td style="padding: 8px; border: 1px solid #e5e7eb;">${workstreamName}</td>
                        </tr>
                        <tr>
                          <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Program:</strong></td>
                          <td style="padding: 8px; border: 1px solid #e5e7eb;">${programName}</td>
                        </tr>
                        <tr>
                          <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Escalated By:</strong></td>
                          <td style="padding: 8px; border: 1px solid #e5e7eb;">${escalatorName}</td>
                        </tr>
                      </table>

                      <p><strong>Please review and take appropriate action immediately.</strong></p>

                      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://celestar.app'}/units/${unitId}"
                         style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">
                        View Unit in Portal
                      </a>
                    </div>

                    <div style="padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
                      <p>This is a manual escalation from Celestar Execution Readiness Portal</p>
                    </div>
                  </div>
                `,
              }),
            });

            const emailResult = await emailRes.json();
            if (emailRes.ok) {
              emailsSent++;
              console.log('Manual escalation email sent to', user.email);
            } else {
              emailsFailed++;
              const errMsg = `Resend error for ${user.email}: ${JSON.stringify(emailResult)}`;
              emailErrors.push(errMsg);
              console.error(errMsg);
            }
          } catch (emailError: any) {
            emailsFailed++;
            const errMsg = `Exception for ${user.email}: ${emailError.message}`;
            emailErrors.push(errMsg);
            console.error(errMsg);
          }
        }
      }
    }

    // Update blocked status if requested AND authorized (no level change for manual)
    if (actuallyMarkBlocked === true) {
      try {
        await supabase
          .from('units')
          .update({
            is_blocked: true,
            blocked_reason: reason,
            blocked_at: new Date().toISOString(),
            blocked_by: context!.user_id,
            computed_status: 'BLOCKED',
          })
          .eq('id', unitId);
      } catch (updateError: any) {
        console.warn('Block update failed:', updateError.message);
      }
    }

    return NextResponse.json({
      success: true,
      debug: {
        unitOrgId,
        sameOrgUsersCount: sameOrgUsers?.length || 0,
        platformAdminsCount: platformAdmins?.length || 0,
        totalUsersToNotify: usersToNotify?.length || 0,
        resendKeyExists: !!process.env.RESEND_API_KEY,
        resendKeyPrefix: process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.substring(0, 6) + '...' : 'NOT SET',
        userEmails: usersToNotify?.map(u => u.email) || [],
      },
      notifications_sent: usersToNotify?.length || 0,
      emails_sent: emailsSent,
      emails_failed: emailsFailed,
      email_errors: emailErrors.length > 0 ? emailErrors : undefined,
      resend_configured: !!process.env.RESEND_API_KEY,
      blocked: actuallyMarkBlocked === true,
      message: actuallyMarkBlocked
        ? 'Escalation sent to all users. Unit marked as BLOCKED.'
        : 'Escalation sent to all users.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
