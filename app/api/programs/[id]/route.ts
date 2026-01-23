import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// GET /api/programs/[id] - Get a specific program
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

    const { data: program, error } = await supabase
      .from('programs')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    // TENANT SAFETY: Verify program belongs to user's organization
    if (context!.role !== 'PLATFORM_ADMIN' && program.org_id !== context!.org_id) {
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
      .select('org_id')
      .eq('id', params.id)
      .single();

    if (!programCheck) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    if (context!.role !== 'PLATFORM_ADMIN' && programCheck.org_id !== context!.org_id) {
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

// DELETE /api/programs/[id] - Delete a program
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

    // TENANT SAFETY: Verify program belongs to user's organization
    const { data: programCheck } = await supabase
      .from('programs')
      .select('org_id')
      .eq('id', params.id)
      .single();

    if (!programCheck) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    if (context!.role !== 'PLATFORM_ADMIN' && programCheck.org_id !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

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
    const { error } = await supabase.from('programs').delete().eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
