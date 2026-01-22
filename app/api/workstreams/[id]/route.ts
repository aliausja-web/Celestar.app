import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// GET /api/workstreams/[id] - Get a specific workstream with metrics
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader);

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const supabase = getSupabaseServer();

    // Get workstream with program info
    const { data: workstream, error } = await supabase
      .from('workstreams')
      .select('*, programs!inner(org_id)')
      .eq('id', params.id)
      .single();

    if (error || !workstream) {
      console.error('Workstream fetch error:', error);
      return NextResponse.json({ error: 'Workstream not found' }, { status: 404 });
    }

    // TENANT SAFETY: Verify workstream belongs to user's organization
    const programOrgId = workstream.programs?.org_id;
    if (context!.role !== 'PLATFORM_ADMIN' && programOrgId !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // Get unit counts (without is_blocked which may not exist)
    const { data: units } = await supabase
      .from('units')
      .select('id, computed_status, required_green_by')
      .eq('workstream_id', params.id);

    const allUnits = units || [];
    const total_units = allUnits.length;
    const red_units = allUnits.filter((u) => u.computed_status === 'RED').length;
    const green_units = allUnits.filter((u) => u.computed_status === 'GREEN').length;
    const blocked_units = 0; // is_blocked column may not exist
    const stale_units = allUnits.filter(
      (u) => u.computed_status === 'RED' && u.required_green_by && new Date(u.required_green_by) < new Date()
    ).length;

    // Get recent escalations
    const { data: escalations } = await supabase
      .from('unit_escalations')
      .select('id')
      .eq('workstream_id', params.id)
      .gte('triggered_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const recent_escalations = escalations?.length || 0;

    // Remove the nested programs object from response
    const { programs, ...workstreamData } = workstream;

    return NextResponse.json({
      ...workstreamData,
      total_units,
      red_units,
      green_units,
      blocked_units,
      stale_units,
      recent_escalations,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/workstreams/[id] - Update a workstream
export async function PATCH(
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

    // TENANT SAFETY: Verify workstream belongs to user's organization
    const { data: wsCheck } = await supabase
      .from('workstreams')
      .select('programs!inner(org_id)')
      .eq('id', params.id)
      .single();

    if (!wsCheck) {
      return NextResponse.json({ error: 'Workstream not found' }, { status: 404 });
    }

    const wsOrgId = (wsCheck.programs as any)?.org_id;
    if (context!.role !== 'PLATFORM_ADMIN' && wsOrgId !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    const body = await request.json();

    const { data: workstream, error } = await supabase
      .from('workstreams')
      .update(body)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(workstream);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/workstreams/[id] - Delete a workstream
export async function DELETE(
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

    // TENANT SAFETY: Verify workstream belongs to user's organization
    const { data: wsCheck } = await supabase
      .from('workstreams')
      .select('programs!inner(org_id)')
      .eq('id', params.id)
      .single();

    if (!wsCheck) {
      return NextResponse.json({ error: 'Workstream not found' }, { status: 404 });
    }

    const wsOrgId = (wsCheck.programs as any)?.org_id;
    if (context!.role !== 'PLATFORM_ADMIN' && wsOrgId !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // Delete child units first
    await supabase.from('units').delete().eq('workstream_id', params.id);

    // Delete workstream
    const { error } = await supabase.from('workstreams').delete().eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
