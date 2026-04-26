import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// POST /api/units/[id]/voice-note-play
// Logs an immutable record that the authenticated user played the management
// voice note on this unit. Called once per play session from the client.
export async function POST(
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

    // TENANT SAFETY: verify unit belongs to user's org
    const { data: unitCheck } = await supabase
      .from('units')
      .select('workstreams!inner(programs!inner(org_id))')
      .eq('id', params.id)
      .single();

    if (!unitCheck) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    const unitOrgId = (unitCheck.workstreams as any)?.programs?.org_id;
    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch the user's full name to store alongside the event
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', context!.user_id)
      .maybeSingle();

    const { data, error } = await supabase
      .from('unit_status_events')
      .insert({
        unit_id: params.id,
        event_type: 'voice_note_played',
        triggered_by: context!.user_id,
        metadata: {
          full_name: profile?.full_name || context!.email,
          email: context!.email,
        },
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
