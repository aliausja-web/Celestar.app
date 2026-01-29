import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// GET /api/workstreams?program_id=xxx - List workstreams for a program
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader);

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const supabase = getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const programId = searchParams.get('program_id');

    if (!programId) {
      return NextResponse.json(
        { error: 'program_id is required' },
        { status: 400 }
      );
    }

    // TENANT SAFETY: Verify program belongs to user's organization
    const { data: progCheck } = await supabase
      .from('programs')
      .select('org_id')
      .eq('id', programId)
      .single();

    if (!progCheck) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    if (context!.role !== 'PLATFORM_ADMIN' && progCheck.org_id !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // Simple query without governance columns
    const { data: workstreams, error } = await supabase
      .from('workstreams')
      .select('*')
      .eq('program_id', programId)
      .order('ordering', { ascending: true });

    if (error) throw error;

    return NextResponse.json(workstreams || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/workstreams - Create a new workstream
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN', 'PROGRAM_OWNER', 'WORKSTREAM_LEAD'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();
    const body = await request.json();

    // TENANT SAFETY: Verify program belongs to user's organization
    const { data: progCheck } = await supabase
      .from('programs')
      .select('org_id')
      .eq('id', body.program_id)
      .single();

    if (!progCheck) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    if (context!.role !== 'PLATFORM_ADMIN' && progCheck.org_id !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    const { data: workstream, error } = await supabase
      .from('workstreams')
      .insert([
        {
          program_id: body.program_id,
          name: body.name,
          type: body.type,
          ordering: body.ordering ?? 0,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(workstream, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
