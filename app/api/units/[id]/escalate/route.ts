import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// POST /api/units/[id]/escalate - Manually escalate a unit
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

    // Role-based BLOCKED authority check
    // Only WORKSTREAM_LEAD, PROGRAM_OWNER, or PLATFORM_ADMIN can confirm BLOCKED
    // CLIENT can propose blockage but cannot set it directly
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

    // Calculate next escalation level
    const currentLevel = unit.current_escalation_level || 0;
    const nextLevel = Math.min(currentLevel + 1, 3);

    // Determine target roles
    const targetRolesMap: { [key: number]: string[] } = {
      1: ['WORKSTREAM_LEAD'],
      2: ['PROGRAM_OWNER', 'WORKSTREAM_LEAD'],
      3: ['PLATFORM_ADMIN', 'PROGRAM_OWNER'],
    };

    const targetRoles = targetRolesMap[nextLevel] || ['PROGRAM_OWNER'];

    // Create escalation record - use actual database column names
    const { data: escalation, error: escalationError } = await supabase
      .from('unit_escalations')
      .insert([
        {
          unit_id: unitId,
          workstream_id: unit.workstream_id,
          program_id: (unit.workstreams as any)?.program_id,
          level: nextLevel, // Column is 'level' not 'escalation_level'
          triggered_at: new Date().toISOString(),
          threshold_minutes_past_deadline: 0, // Manual escalation = 0 threshold
          recipients: targetRoles.map(role => ({ role, reason })),
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

    // CRITICAL: Get users to notify - FILTER BY SAME ORGANIZATION
    // This prevents cross-tenant email leakage
    const { data: usersToNotify } = await supabase
      .from('profiles')
      .select('user_id, email, full_name, role')
      .eq('org_id', unitOrgId) // TENANT ISOLATION - only same org users
      .in('role', targetRoles);

    // Get escalator's name for the email
    const { data: escalatorProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', context!.user_id)
      .single();

    const escalatorName = escalatorProfile?.full_name || escalatorProfile?.email || 'A team member';

    // Create in-app notifications
    if (usersToNotify && usersToNotify.length > 0) {
      const notifications = usersToNotify.map((user) => ({
        user_id: user.user_id,
        title: `🚨 MANUAL ESCALATION - Level ${nextLevel}`,
        message: `Unit "${unit.title}" has been manually escalated by ${escalatorName}. Reason: ${reason}`,
        type: 'manual_escalation',
        priority: nextLevel === 3 ? 'critical' : nextLevel === 2 ? 'high' : 'normal',
        related_unit_id: unitId,
        related_escalation_id: escalation.id,
        action_url: `/units/${unitId}`,
        metadata: { unit_title: unit.title, escalation_level: nextLevel, reason },
      }));

      await supabase.from('in_app_notifications').insert(notifications);

      // Send emails directly via Resend (not through the automatic alert Edge Function)
      // This is a MANUAL escalation - completely different from automatic deadline alerts
      for (const user of usersToNotify) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Celestar Alerts <alerts@celestar.app>',
              to: user.email,
              subject: `🚨 MANUAL ESCALATION: "${unit.title}" - Action Required`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0;">⚠️ MANUAL ESCALATION</h1>
                    <p style="margin: 5px 0 0 0; font-size: 14px;">This is NOT an automatic alert - Someone has raised an issue</p>
                  </div>

                  <div style="padding: 20px; background: #f9fafb; border: 1px solid #e5e7eb;">
                    <p>Hi ${user.full_name || user.email},</p>

                    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 15px 0;">
                      <strong>ESCALATION REASON:</strong>
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
                        <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f3f4f6;"><strong>Escalation Level:</strong></td>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;">Level ${nextLevel}</td>
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
                    <p>© 2026 Celestar. All rights reserved.</p>
                  </div>
                </div>
              `,
            }),
          });
        } catch (emailError) {
          console.warn('Failed to send manual escalation email to', user.email, emailError);
        }
      }
    }

    // Update unit escalation level and blocked status if requested AND authorized
    // Use try-catch for optional columns that might not exist in older schemas
    try {
      const updateData: any = {
        current_escalation_level: nextLevel,
      };

      // If marking as blocked AND user has authority, set blocked fields
      if (actuallyMarkBlocked === true) {
        updateData.is_blocked = true;
        updateData.blocked_reason = reason;
        updateData.blocked_at = new Date().toISOString();
        updateData.blocked_by = context!.user_id;
        updateData.computed_status = 'BLOCKED';
      }

      await supabase
        .from('units')
        .update(updateData)
        .eq('id', unitId);
    } catch (updateError: any) {
      // If update fails due to missing columns, try minimal update
      console.warn('Full update failed, trying minimal update:', updateError.message);
      await supabase
        .from('units')
        .update({ current_escalation_level: nextLevel })
        .eq('id', unitId);
    }

    return NextResponse.json({
      success: true,
      new_level: nextLevel,
      notifications_sent: usersToNotify?.length || 0,
      blocked: actuallyMarkBlocked === true,
      blocked_proposed: mark_as_blocked && !canConfirmBlocked, // CLIENT proposed but lacks authority
      message: mark_as_blocked && !canConfirmBlocked
        ? 'Escalation created with proposed blockage. WORKSTREAM_LEAD or PROGRAM_OWNER must confirm.'
        : actuallyMarkBlocked
        ? 'Unit marked as BLOCKED.'
        : 'Escalation created.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
