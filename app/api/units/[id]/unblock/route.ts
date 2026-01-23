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

    // Get current unit with tenant info
    const { data: unit, error: unitError } = await supabase
      .from('units')
      .select('*, workstreams!inner(programs!inner(org_id))')
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

    if (!unit.is_blocked) {
      return NextResponse.json(
        { error: 'Unit is not currently blocked' },
        { status: 400 }
      );
    }

    // Unblock unit and recompute status
    const { error: updateError } = await supabase
      .from('units')
      .update({
        is_blocked: false,
        blocked_reason: null,
        blocked_at: null,
        blocked_by: null,
      })
      .eq('id', unitId);

    if (updateError) {
      // If blocked columns don't exist, the unblock feature isn't available
      console.warn('Unblock update failed:', updateError.message);
      return NextResponse.json({
        error: 'Unblock feature not available - database migration may be pending'
      }, { status: 503 });
    }

    // Trigger status recomputation (optional - may not exist)
    try {
      await supabase.rpc('compute_unit_status', { unit_id_param: unitId });
    } catch (rpcError) {
      console.warn('Status recomputation RPC not available:', rpcError);
    }

    return NextResponse.json({
      success: true,
      message: 'Unit unblocked successfully',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
