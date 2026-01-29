import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// POST /api/units/[id]/proofs - Upload proof for a unit
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

    // CLIENT_VIEWER cannot upload proofs, all other roles can
    if (context!.role === 'CLIENT_VIEWER') {
      return NextResponse.json(
        { error: 'Forbidden - CLIENT_VIEWER role cannot upload proofs' },
        { status: 403 }
      );
    }

    const supabase = getSupabaseServer();

    // TENANT SAFETY: Verify unit belongs to user's organization
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
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    const body = await request.json();

    // Get public URL from file path
    const filePath = body.file_path || body.url;
    const { data: urlData } = supabase.storage
      .from('proofs')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    // Create proof - use only columns that exist in unit_proofs table
    const { data: proof, error: proofError } = await supabase
      .from('unit_proofs')
      .insert([
        {
          unit_id: params.id,
          type: body.type || 'photo',
          url: publicUrl,
          uploaded_at: new Date().toISOString(),
          uploaded_by: context!.user_id,
          uploaded_by_email: context!.email,
          is_valid: true,
          approval_status: 'pending',
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
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader);

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const supabase = getSupabaseServer();

    // TENANT SAFETY: Verify unit belongs to user's organization
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
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    const { data: proofs, error } = await supabase
      .from('unit_proofs')
      .select('*')
      .eq('unit_id', params.id)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(proofs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
