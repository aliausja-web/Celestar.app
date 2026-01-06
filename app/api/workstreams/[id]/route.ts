import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

// GET /api/workstreams/[id] - Get a specific workstream with metrics
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseServer();

    // Get workstream
    const { data: workstream, error } = await supabase
      .from('workstreams')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) throw error;

    // Get unit counts
    const { data: units } = await supabase
      .from('units')
      .select('id, computed_status, required_green_by')
      .eq('workstream_id', params.id);

    const total_units = units?.length || 0;
    const red_units = units?.filter((u) => u.computed_status === 'RED').length || 0;
    const green_units = units?.filter((u) => u.computed_status === 'GREEN').length || 0;
    const stale_units = units?.filter(
      (u) => u.computed_status === 'RED' && u.required_green_by && new Date(u.required_green_by) < new Date()
    ).length || 0;

    // Get recent escalations
    const { data: escalations } = await supabase
      .from('unit_escalations')
      .select('id')
      .eq('workstream_id', params.id)
      .gte('triggered_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const recent_escalations = escalations?.length || 0;

    return NextResponse.json({
      ...workstream,
      total_units,
      red_units,
      green_units,
      stale_units,
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
    const supabase = getSupabaseServer();
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

// DELETE /api/workstreams/[id] - Delete a workstream
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseServer();

    const { error } = await supabase
      .from('workstreams')
      .delete()
      .eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
