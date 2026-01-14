import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// GET /api/units/[id] - Get a specific unit with proofs
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // TENANT SAFETY: Authenticate user
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader);

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const supabase = getSupabaseServer();

    // TENANT SAFETY: Get unit with organization hierarchy
    const { data: unit, error } = await supabase
      .from('units')
      .select(`
        *,
        workstreams!inner(
          id,
          name,
          programs!inner(
            id,
            name,
            organization_id
          )
        )
      `)
      .eq('id', params.id)
      .single();

    if (error || !unit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    // TENANT SAFETY: Verify unit belongs to user's organization
    const unitOrgId = unit.workstreams.programs.organization_id;
    const userOrgId = context!.org_id;

    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== userOrgId) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // Get proofs
    const { data: proofs } = await supabase
      .from('unit_proofs')
      .select('*')
      .eq('unit_id', params.id)
      .order('uploaded_at', { ascending: false });

    return NextResponse.json({
      ...unit,
      proofs: proofs || [],
      proof_count: proofs?.length || 0,
      last_proof_time: proofs?.[0]?.uploaded_at || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/units/[id] - Update a unit
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // TENANT SAFETY: Authenticate user
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN', 'PROGRAM_OWNER', 'WORKSTREAM_LEAD'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();

    // TENANT SAFETY: Verify unit belongs to user's organization before updating
    const { data: unitCheck } = await supabase
      .from('units')
      .select('workstreams!inner(programs!inner(organization_id))')
      .eq('id', params.id)
      .single();

    if (!unitCheck) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    const unitOrgId = unitCheck.workstreams[0].programs[0].organization_id;
    const userOrgId = context!.org_id;

    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== userOrgId) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    const body = await request.json();

    const { data: unit, error } = await supabase
      .from('units')
      .update(body)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(unit);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/units/[id] - Delete a unit
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // TENANT SAFETY: Authenticate user
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN', 'PROGRAM_OWNER'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();

    // TENANT SAFETY: Verify unit belongs to user's organization before deleting
    const { data: unitCheck } = await supabase
      .from('units')
      .select('workstreams!inner(programs!inner(organization_id))')
      .eq('id', params.id)
      .single();

    if (!unitCheck) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    const unitOrgId = unitCheck.workstreams[0].programs[0].organization_id;
    const userOrgId = context!.org_id;

    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== userOrgId) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    const { error } = await supabase
      .from('units')
      .delete()
      .eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
