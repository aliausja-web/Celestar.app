import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// GET /api/programs/[id] - Get a specific program
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

    const { data: program, error } = await supabase
      .from('programs')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    // TENANT SAFETY: Verify program belongs to user's organization
    if (context!.role !== 'PLATFORM_ADMIN' && program.organization_id !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    return NextResponse.json(program);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/programs/[id] - Update a program
export async function PATCH(
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

    // TENANT SAFETY: Verify program belongs to user's organization before updating
    const { data: programCheck } = await supabase
      .from('programs')
      .select('organization_id')
      .eq('id', params.id)
      .single();

    if (!programCheck) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    if (context!.role !== 'PLATFORM_ADMIN' && programCheck.organization_id !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    const body = await request.json();

    const { data: program, error } = await supabase
      .from('programs')
      .update(body)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(program);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/programs/[id] - Archive a program (soft delete for audit safety)
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

    // TENANT SAFETY: Verify program belongs to user's organization before archiving
    let { data: programCheck, error: checkError } = await supabase
      .from('programs')
      .select('organization_id, is_archived')
      .eq('id', params.id)
      .single();

    // Fallback if is_archived column doesn't exist yet
    if (checkError && checkError.message.includes('is_archived')) {
      const fallback = await supabase
        .from('programs')
        .select('organization_id')
        .eq('id', params.id)
        .single();
      programCheck = fallback.data ? { ...fallback.data, is_archived: false } : null;
    }

    if (!programCheck) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    if (programCheck.is_archived) {
      return NextResponse.json({ error: 'Program is already archived' }, { status: 400 });
    }

    if (context!.role !== 'PLATFORM_ADMIN' && programCheck.organization_id !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // GOVERNANCE: Soft delete (archive) instead of hard delete
    // Try archive first, fall back to hard delete if columns don't exist
    let { error: programError } = await supabase
      .from('programs')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by: context!.user_id,
      })
      .eq('id', params.id);

    // Fallback to hard delete if is_archived column doesn't exist
    if (programError && programError.message.includes('is_archived')) {
      // Delete child units first
      const { data: workstreams } = await supabase
        .from('workstreams')
        .select('id')
        .eq('program_id', params.id);

      if (workstreams && workstreams.length > 0) {
        const workstreamIds = workstreams.map(w => w.id);
        await supabase.from('units').delete().in('workstream_id', workstreamIds);
      }
      // Delete workstreams
      await supabase.from('workstreams').delete().eq('program_id', params.id);
      // Delete program
      const { error: deleteError } = await supabase.from('programs').delete().eq('id', params.id);
      if (deleteError) throw deleteError;

      return NextResponse.json({
        success: true,
        deleted: true,
        message: 'Program and all child workstreams/units deleted (migration not applied for archive).',
      });
    }

    if (programError) throw programError;

    // Cascade archive to child workstreams
    let { data: workstreams, error: wsQueryError } = await supabase
      .from('workstreams')
      .select('id')
      .eq('program_id', params.id)
      .eq('is_archived', false);

    // Fallback if is_archived column doesn't exist on workstreams
    if (wsQueryError && wsQueryError.message.includes('is_archived')) {
      const fallback = await supabase
        .from('workstreams')
        .select('id')
        .eq('program_id', params.id);
      workstreams = fallback.data;
    }

    if (workstreams && workstreams.length > 0) {
      await supabase
        .from('workstreams')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: context!.user_id,
        })
        .eq('program_id', params.id);

      // Cascade archive to child units
      const workstreamIds = workstreams.map(w => w.id);
      let { data: units, error: unitsQueryError } = await supabase
        .from('units')
        .select('id')
        .in('workstream_id', workstreamIds)
        .eq('is_archived', false);

      // Fallback if is_archived column doesn't exist on units
      if (unitsQueryError && unitsQueryError.message.includes('is_archived')) {
        const fallback = await supabase
          .from('units')
          .select('id')
          .in('workstream_id', workstreamIds);
        units = fallback.data;
      }

      if (units && units.length > 0) {
        await supabase
          .from('units')
          .update({
            is_archived: true,
            archived_at: new Date().toISOString(),
            archived_by: context!.user_id,
          })
          .in('workstream_id', workstreamIds);

        // Log audit events for archived units
        const unitEvents = units.map(u => ({
          unit_id: u.id,
          event_type: 'unit_archived',
          triggered_by: context!.user_id,
          triggered_by_role: context!.role,
          reason: 'Parent program archived',
          metadata: { program_id: params.id },
        }));

        await supabase.from('unit_status_events').insert(unitEvents);
      }
    }

    return NextResponse.json({
      success: true,
      archived: true,
      message: 'Program and all child workstreams/units archived. Proofs and audit trail preserved.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
