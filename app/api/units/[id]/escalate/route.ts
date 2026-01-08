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
      requireRole: ['PLATFORM_ADMIN', 'PROGRAM_OWNER', 'WORKSTREAM_LEAD'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();
    const unitId = params.id;
    const body = await request.json();
    const { reason } = body;

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { error: 'Escalation reason is required' },
        { status: 400 }
      );
    }

    // Get current unit details
    const { data: unit, error: unitError } = await supabase
      .from('units')
      .select('*, workstreams(program_id)')
      .eq('id', unitId)
      .single();

    if (unitError || !unit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
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

    // Create escalation record
    const { data: escalation, error: escalationError } = await supabase
      .from('unit_escalations')
      .insert([
        {
          unit_id: unitId,
          escalation_level: nextLevel,
          triggered_at: new Date().toISOString(),
          escalation_type: 'manual',
          escalation_reason: reason,
          escalated_by: context!.user_id,
          visible_to_roles: targetRoles,
          message: \`Manual escalation (Level \${nextLevel}): \${reason}\`,
          status: 'active',
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
        title: \`Level \${nextLevel} Manual Escalation\`,
        message: \`Unit "\${unit.title}" has been manually escalated. Reason: \${reason}\`,
        type: 'manual_escalation',
        priority: nextLevel === 3 ? 'critical' : nextLevel === 2 ? 'high' : 'normal',
        related_unit_id: unitId,
        related_escalation_id: escalation.id,
        action_url: \`/units/\${unitId}\`,
        metadata: { unit_title: unit.title, escalation_level: nextLevel, reason },
      }));

      await supabase.from('in_app_notifications').insert(notifications);
    }

    // Update unit escalation level
    await supabase
      .from('units')
      .update({
        current_escalation_level: nextLevel,
        last_escalated_at: new Date().toISOString(),
      })
      .eq('id', unitId);

    return NextResponse.json({
      success: true,
      new_level: nextLevel,
      notifications_sent: usersToNotify?.length || 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
