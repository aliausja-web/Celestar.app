import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// GET /api/workstreams/[id] - Get a specific workstream with metrics
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

    // Get workstream with program org check
    const { data: workstream, error } = await supabase
      .from('workstreams')
      .select('*, programs!inner(organization_id)')
      .eq('id', params.id)
      .eq('is_archived', false)
      .single();

    if (error || !workstream) {
      return NextResponse.json({ error: 'Workstream not found' }, { status: 404 });
    }

    // TENANT SAFETY: Verify workstream belongs to user's organization
    if (context!.role !== 'PLATFORM_ADMIN' && workstream.programs.organization_id !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // Get unit counts - only confirmed and non-archived units
    const { data: units } = await supabase
      .from('units')
      .select('id, computed_status, required_green_by, is_confirmed, is_blocked')
      .eq('workstream_id', params.id)
      .eq('is_archived', false);

    // GOVERNANCE: Only count confirmed units in metrics
    const confirmedUnits = units?.filter((u) => u.is_confirmed) || [];
    const unconfirmedUnits = units?.filter((u) => !u.is_confirmed) || [];

    const total_units = confirmedUnits.length;
    const red_units = confirmedUnits.filter((u) => u.computed_status === 'RED').length;
    const green_units = confirmedUnits.filter((u) => u.computed_status === 'GREEN').length;
    const blocked_units = confirmedUnits.filter((u) => u.is_blocked).length;
    const stale_units = confirmedUnits.filter(
      (u) => u.computed_status === 'RED' && u.required_green_by && new Date(u.required_green_by) < new Date()
    ).length;
    const unconfirmed_count = unconfirmedUnits.length;

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
      unconfirmed_count,
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
    // TENANT SAFETY: Authenticate user
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
      .select('programs!inner(organization_id)')
      .eq('id', params.id)
      .single();

    if (!wsCheck) {
      return NextResponse.json({ error: 'Workstream not found' }, { status: 404 });
    }

    if (context!.role !== 'PLATFORM_ADMIN' && (wsCheck.programs as any)[0]?.organization_id !== context!.org_id) {
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

// DELETE /api/workstreams/[id] - Archive a workstream (soft delete for audit safety)
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

    // TENANT SAFETY: Verify workstream belongs to user's organization
    const { data: wsCheck } = await supabase
      .from('workstreams')
      .select('programs!inner(organization_id), is_archived')
      .eq('id', params.id)
      .single();

    if (!wsCheck) {
      return NextResponse.json({ error: 'Workstream not found' }, { status: 404 });
    }

    if (wsCheck.is_archived) {
      return NextResponse.json({ error: 'Workstream is already archived' }, { status: 400 });
    }

    if (context!.role !== 'PLATFORM_ADMIN' && (wsCheck.programs as any)[0]?.organization_id !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // GOVERNANCE: Soft delete (archive) instead of hard delete
    // Archive the workstream
    const { error: wsError } = await supabase
      .from('workstreams')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by: context!.user_id,
      })
      .eq('id', params.id);

    if (wsError) throw wsError;

    // Cascade archive to child units
    const { data: units } = await supabase
      .from('units')
      .select('id')
      .eq('workstream_id', params.id)
      .eq('is_archived', false);

    if (units && units.length > 0) {
      await supabase
        .from('units')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: context!.user_id,
        })
        .eq('workstream_id', params.id);

      // Log audit events for archived units
      const unitEvents = units.map(u => ({
        unit_id: u.id,
        event_type: 'unit_archived',
        triggered_by: context!.user_id,
        triggered_by_role: context!.role,
        reason: 'Parent workstream archived',
        metadata: { workstream_id: params.id },
      }));

      await supabase.from('unit_status_events').insert(unitEvents);
    }

    return NextResponse.json({
      success: true,
      archived: true,
      message: 'Workstream and all child units archived. Proofs and audit trail preserved.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
