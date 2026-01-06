import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

// GET /api/programs/[id] - Get a specific program
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseServer();

    const { data: program, error } = await supabase
      .from('programs')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) throw error;

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
    const supabase = getSupabaseServer();
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
    const supabase = getSupabaseServer();

    const { error } = await supabase
      .from('programs')
      .delete()
      .eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
