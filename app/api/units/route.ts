import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

// GET /api/units?workstream_id=xxx - List units for a workstream
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const workstreamId = searchParams.get('workstream_id');

    if (!workstreamId) {
      return NextResponse.json(
        { error: 'workstream_id is required' },
        { status: 400 }
      );
    }

    const { data: units, error } = await supabase
      .from('units')
      .select('*')
      .eq('workstream_id', workstreamId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Get proofs for each unit
    const unitsWithProofs = await Promise.all(
      units.map(async (unit) => {
        const { data: proofs } = await supabase
          .from('proofs')
          .select('*')
          .eq('unit_id', unit.id)
          .eq('is_valid', true)
          .order('uploaded_at', { ascending: false });

        return {
          ...unit,
          proofs: proofs || [],
          proof_count: proofs?.length || 0,
          last_proof_time: proofs?.[0]?.uploaded_at || null,
        };
      })
    );

    return NextResponse.json(unitsWithProofs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/units - Create a new unit
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const body = await request.json();

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: unit, error } = await supabase
      .from('units')
      .insert([
        {
          workstream_id: body.workstream_id,
          title: body.title,
          owner_party_name: body.owner_party_name,
          required_green_by: body.required_green_by,
          proof_requirements: body.proof_requirements || {
            required_count: 1,
            required_types: ['photo'],
          },
          escalation_policy: body.escalation_policy || [
            {
              level: 1,
              threshold_minutes_past_deadline: 0,
              recipients_role: ['site_coordinator'],
              new_deadline_minutes_from_now: 1440,
            },
            {
              level: 2,
              threshold_minutes_past_deadline: 480,
              recipients_role: ['project_manager'],
              new_deadline_minutes_from_now: 960,
            },
            {
              level: 3,
              threshold_minutes_past_deadline: 960,
              recipients_role: ['org_admin'],
              new_deadline_minutes_from_now: 480,
            },
          ],
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Log status event
    await supabase.from('status_events').insert([
      {
        unit_id: unit.id,
        old_status: null,
        new_status: 'RED',
        changed_by: user.user.id,
        changed_by_email: user.user.email,
        reason: 'system_init',
        notes: 'Unit created',
      },
    ]);

    return NextResponse.json(unit, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
