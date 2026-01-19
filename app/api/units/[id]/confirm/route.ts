import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// POST /api/units/[id]/confirm - Confirm a FIELD_CONTRIBUTOR-created unit
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Only WORKSTREAM_LEAD, PROGRAM_OWNER, PLATFORM_ADMIN can confirm
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN', 'PROGRAM_OWNER', 'WORKSTREAM_LEAD'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();

    // TENANT SAFETY: Verify unit belongs to user's organization
    const { data: unitCheck } = await supabase
      .from('units')
      .select(`
        id,
        is_confirmed,
        is_archived,
        workstreams!inner(
          programs!inner(
            organization_id
          )
        )
      `)
      .eq('id', params.id)
      .single();

    if (!unitCheck) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    // Check tenant isolation (Supabase returns arrays for nested joins)
    const unitOrgId = (unitCheck.workstreams as any)[0]?.programs[0]?.organization_id;
    const userOrgId = context!.org_id;

    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== userOrgId) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // Check if already confirmed
    if (unitCheck.is_confirmed) {
      return NextResponse.json({
        error: 'Unit is already confirmed',
        is_confirmed: true
      }, { status: 400 });
    }

    // Check if archived
    if (unitCheck.is_archived) {
      return NextResponse.json({ error: 'Cannot confirm archived unit' }, { status: 400 });
    }

    // Confirm the unit
    const { data: unit, error } = await supabase
      .from('units')
      .update({
        is_confirmed: true,
        confirmed_at: new Date().toISOString(),
        confirmed_by: context!.user_id,
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    // Log audit event
    await supabase.from('unit_status_events').insert({
      unit_id: params.id,
      event_type: 'unit_confirmed',
      triggered_by: context!.user_id,
      triggered_by_role: context!.role,
      reason: 'Unit scope confirmed by authorized role',
      metadata: {
        confirmed_by_role: context!.role,
      },
    });

    return NextResponse.json({
      ...unit,
      message: 'Unit confirmed successfully. It will now count toward workstream metrics.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
