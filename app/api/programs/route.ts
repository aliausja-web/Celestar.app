import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// GET /api/programs - List all programs for user's organization
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader);

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const supabase = getSupabaseServer();

    // TENANT SAFETY: Filter programs by user's organization
    let query = supabase
      .from('programs')
      .select('*')
      .order('created_at', { ascending: false });

    // Only PLATFORM_ADMIN can see all programs
    if (context!.role !== 'PLATFORM_ADMIN') {
      query = query.eq('org_id', context!.org_id);
    }

    const { data: programs, error } = await query;

    if (error) throw error;

    return NextResponse.json(programs || []);
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
