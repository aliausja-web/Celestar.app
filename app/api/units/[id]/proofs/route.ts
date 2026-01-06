import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

// POST /api/units/[id]/proofs - Upload proof for a unit
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseServer();
    const body = await request.json();

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create proof
    const { data: proof, error: proofError } = await supabase
      .from('proofs')
      .insert([
        {
          unit_id: params.id,
          type: body.type || 'photo',
          url: body.url,
          captured_at: body.captured_at || new Date().toISOString(),
          uploaded_by: user.user.id,
          uploaded_by_email: user.user.email,
          metadata_exif: body.metadata_exif || {},
          gps_latitude: body.gps_latitude || null,
          gps_longitude: body.gps_longitude || null,
        },
      ])
      .select()
      .single();

    if (proofError) throw proofError;

    // Status will be automatically updated by trigger
    // Fetch updated unit status
    const { data: unit } = await supabase
      .from('units')
      .select('computed_status, status_computed_at')
      .eq('id', params.id)
      .single();

    return NextResponse.json(
      {
        proof,
        unit_status: unit?.computed_status,
        status_updated: unit?.status_computed_at,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET /api/units/[id]/proofs - Get all proofs for a unit
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseServer();

    const { data: proofs, error } = await supabase
      .from('proofs')
      .select('*')
      .eq('unit_id', params.id)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(proofs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
