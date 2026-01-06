import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

// GET /api/programs - List all programs
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();

    const { data: programs, error } = await supabase
      .from('programs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(programs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/programs - Create a new program
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const body = await request.json();

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: program, error } = await supabase
      .from('programs')
      .insert([
        {
          name: body.name,
          description: body.description,
          owner_org: body.owner_org,
          start_time: body.start_time,
          end_time: body.end_time,
          created_by: user.user.id,
          created_by_email: user.user.email,
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
