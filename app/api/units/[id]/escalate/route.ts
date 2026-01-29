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

    // Create escalation record with proposed_blocked tracking
    const { data: escalation, error: escalationError } = await supabase
      .from('unit_escalations')
      .insert([
        {
          unit_id: unitId,
          workstream_id: unit.workstream_id, // Required field
          escalation_level: nextLevel,
          triggered_at: new Date().toISOString(),
          escalation_type: 'manual',
          escalation_reason: reason,
          escalated_by: context!.user_id,
          visible_to_roles: targetRoles,
          message: `Manual escalation (Level ${nextLevel}): ${reason}`,
          status: 'active',
          proposed_blocked: mark_as_blocked && !canConfirmBlocked, // Track if CLIENT proposed blockage
          proposed_by_role: userRole,
        },
      ])
      .select()
      .single();

    if (escalationError) throw escalationError;

    // Get users to notify
    const { data: usersToNotify } = await supabase
      .from('profiles')
      .select('user_id, email, full_name, role')
      .in('role', targetRoles);

    // Create in-app notifications
    if (usersToNotify && usersToNotify.length > 0) {
      const notifications = usersToNotify.map((user) => ({
        user_id: user.user_id,
        title: `Level ${nextLevel} Manual Escalation`,
        message: `Unit "${unit.title}" has been manually escalated. Reason: ${reason}`,
        type: 'manual_escalation',
        priority: nextLevel === 3 ? 'critical' : nextLevel === 2 ? 'high' : 'normal',
        related_unit_id: unitId,
        related_escalation_id: escalation.id,
        action_url: `/units/${unitId}`,
        metadata: { unit_title: unit.title, escalation_level: nextLevel, reason },
      }));

      await supabase.from('in_app_notifications').insert(notifications);

      // Create email notifications (queue for Edge Function to process)
      const emailNotifications = usersToNotify.map((user) => ({
        escalation_id: escalation.id,
        recipient_user_id: user.user_id,
        recipient_email: user.email,
        recipient_name: user.full_name,
        channel: 'email',
        subject: `🚨 URGENT: Manual Escalation - "${unit.title}"`,
        message: `Critical issue reported by ${context?.user_id}:\n\n"${reason}"\n\nUnit: ${unit.title}\nEscalation Level: ${nextLevel}\n\nImmediate action required.`,
        template_data: {
          unit_title: unit.title,
          escalation_level: nextLevel,
          reason: reason,
          escalated_by: context?.user_id,
          priority: nextLevel === 3 ? 'critical' : 'high',
        },
        status: 'pending',
      }));

      await supabase.from('escalation_notifications').insert(emailNotifications);

      // Trigger the Edge Function to send emails immediately
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
        // Don't fail the escalation if email sending fails
        console.warn('Failed to trigger email function:', emailError);
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
