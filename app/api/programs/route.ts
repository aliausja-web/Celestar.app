import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// GET /api/programs - List all programs (filtered by RLS)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader);

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const supabase = getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get('include_archived') === 'true';

    // Build query - exclude archived by default
    let query = supabase
      .from('programs')
      .select('*');

    // Only include archived if explicitly requested and user is PLATFORM_ADMIN or PROGRAM_OWNER
    if (!includeArchived || !['PLATFORM_ADMIN', 'PROGRAM_OWNER'].includes(context!.role)) {
      query = query.eq('is_archived', false);
    }

    const { data: programs, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(programs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/programs - Create a new program
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN', 'PROGRAM_OWNER'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();
    const body = await request.json();

    // Program owners can only create programs in their own org
    const org_id = context!.role === 'PLATFORM_ADMIN'
      ? (body.org_id || context!.org_id)
      : context!.org_id;

    const { data: program, error } = await supabase
      .from('programs')
      .insert([
        {
          name: body.name,
          description: body.description,
          owner_org: body.owner_org,
          org_id: org_id,
          start_time: body.start_time,
          end_time: body.end_time,
          created_by: context!.user_id,
          created_by_email: context!.email,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(program, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
