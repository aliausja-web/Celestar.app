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

    const includeArchived = searchParams.get('include_archived') === 'true';

    // Build query - exclude archived by default
    let query = supabase
      .from('workstreams')
      .select('*')
      .eq('program_id', programId);

    // Only include archived if explicitly requested and user is PLATFORM_ADMIN or PROGRAM_OWNER
    if (!includeArchived || !['PLATFORM_ADMIN', 'PROGRAM_OWNER'].includes(context!.role)) {
      query = query.eq('is_archived', false);
    }

    const { data: workstreams, error } = await query.order('ordering', { ascending: true });

    if (error) throw error;

    return NextResponse.json(workstreams);
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
