import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

/**
 * POST /api/units/[id]/unblock - Remove BLOCKED status from unit
 * Only PROGRAM_OWNER or PLATFORM_ADMIN can unblock
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN', 'PROGRAM_OWNER'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();
    const unitId = params.id;

    // Get current unit
    const { data: unit, error: unitError } = await supabase
      .from('units')
      .select('*')
      .eq('id', unitId)
      .single();

    if (unitError || !unit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    if (!unit.is_blocked) {
      return NextResponse.json(
        { error: 'Unit is not currently blocked' },
        { status: 400 }
      );
    }

    // Unblock unit and recompute status
    await supabase
      .from('units')
      .update({
        is_blocked: false,
        blocked_reason: null,
        blocked_at: null,
        blocked_by: null,
      })
      .eq('id', unitId);

    // Trigger status recomputation
    await supabase.rpc('compute_unit_status', { unit_id_param: unitId });

    return NextResponse.json({
      success: true,
      message: 'Unit unblocked successfully',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
