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

    // FIELD_CONTRIBUTOR: only programs that contain at least one of their assigned units
    if (context!.role === 'FIELD_CONTRIBUTOR') {
      const { data: assignments } = await supabase
        .from('unit_assignments')
        .select('unit_id')
        .eq('user_id', context!.user_id);

      const assignedIds = (assignments ?? []).map((a: any) => a.unit_id);
      if (assignedIds.length === 0) {
        return NextResponse.json([]);
      }

      const { data: unitRows } = await supabase
        .from('units')
        .select('workstream_id')
        .in('id', assignedIds);

      const workstreamIds = Array.from(new Set((unitRows ?? []).map((u: any) => u.workstream_id)));

      const { data: workstreamRows } = await supabase
        .from('workstreams')
        .select('program_id')
        .in('id', workstreamIds);

      const programIds = Array.from(new Set((workstreamRows ?? []).map((w: any) => w.program_id)));
      query = query.in('id', programIds);
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

    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'Program name is required' }, { status: 400 });
    }
    if (body.name.trim().length > 255) {
      return NextResponse.json({ error: 'Program name must be 255 characters or fewer' }, { status: 400 });
    }
    body.name = body.name.trim();

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
