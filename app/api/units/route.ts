import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// GET /api/units?workstream_id=xxx - List units for a workstream
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader);

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

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
          .from('unit_proofs')
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
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN', 'PROGRAM_OWNER', 'WORKSTREAM_LEAD', 'FIELD_CONTRIBUTOR'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();
    const body = await request.json();

    const { data: unit, error } = await supabase
      .from('units')
      .insert([
        {
          workstream_id: body.workstream_id,
          name: body.name,
          description: body.description,
          owner: body.owner,
          deadline: body.deadline,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(unit, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
