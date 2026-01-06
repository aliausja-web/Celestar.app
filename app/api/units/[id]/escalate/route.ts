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

    // Get current unit
    const { data: unit, error: fetchError } = await supabase
      .from('units')
      .select('current_escalation_level, escalation_policy')
      .eq('id', unitId)
      .single();

    if (fetchError) throw fetchError;

    // Calculate new escalation level
    const currentLevel = unit.current_escalation_level || 0;
    const maxLevel = unit.escalation_policy?.length || 3;
    const newLevel = Math.min(currentLevel + 1, maxLevel);

    // Update unit escalation level
    const { error: updateError } = await supabase
      .from('units')
      .update({
        current_escalation_level: newLevel,
        last_escalated_at: new Date().toISOString(),
      })
      .eq('id', unitId);

    if (updateError) throw updateError;

    // Create escalation record
    const { error: escalationError } = await supabase
      .from('unit_escalations')
      .insert([
        {
          unit_id: unitId,
          from_level: currentLevel,
          to_level: newLevel,
          triggered_by: 'manual',
          triggered_by_user_id: context!.user_id,
          reason: reason || 'Manual escalation',
          created_at: new Date().toISOString(),
        },
      ]);

    if (escalationError) {
      console.error('Failed to create escalation record:', escalationError);
      // Don't fail the request if escalation record creation fails
    }

    return NextResponse.json({
      success: true,
      new_level: newLevel,
      message: `Unit escalated to level ${newLevel}`,
    });
  } catch (error: any) {
    console.error('Escalation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
