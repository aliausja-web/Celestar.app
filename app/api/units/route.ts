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
    const includeArchived = searchParams.get('include_archived') === 'true';

    if (!workstreamId) {
      return NextResponse.json(
        { error: 'workstream_id is required' },
        { status: 400 }
      );
    }

    // Build query - exclude archived by default
    let query = supabase
      .from('units')
      .select('*')
      .eq('workstream_id', workstreamId);

    // Only include archived if explicitly requested and user is PLATFORM_ADMIN or PROGRAM_OWNER
    if (!includeArchived || !['PLATFORM_ADMIN', 'PROGRAM_OWNER'].includes(context!.role)) {
      query = query.eq('is_archived', false);
    }

    const { data: units, error } = await query.order('created_at', { ascending: true });

    if (error) throw error;

    // Get proofs for each unit
    const unitsWithProofs = await Promise.all(
      units.map(async (unit) => {
        const { data: proofs } = await supabase
          .from('proofs')
          .select('*')
          .eq('unit_id', unit.id)
          .eq('is_valid', true)
          .order('uploaded_at', { ascending: false});

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

    // Build proof requirements object
    const proofRequirements = {
      required_count: body.required_proof_count || 1,
      required_types: body.required_proof_types || ['photo'],
    };

    // Use provided escalation_config or set default
    const escalationConfig = body.escalation_config || {
      enabled: true,
      thresholds: [
        { level: 1, percentage_elapsed: 50, target_roles: ['WORKSTREAM_LEAD'] },
        { level: 2, percentage_elapsed: 75, target_roles: ['PROGRAM_OWNER', 'WORKSTREAM_LEAD'] },
        { level: 3, percentage_elapsed: 90, target_roles: ['PLATFORM_ADMIN', 'PROGRAM_OWNER'] }
      ]
    };

    // GOVERNANCE: FIELD_CONTRIBUTOR-created units require confirmation
    const userRole = context!.role;
    const isFieldContributor = userRole === 'FIELD_CONTRIBUTOR';
    const isConfirmed = !isFieldContributor; // Auto-confirm if not FIELD_CONTRIBUTOR

    const { data: unit, error } = await supabase
      .from('units')
      .insert([
        {
          workstream_id: body.workstream_id,
          title: body.name,
          owner_party_name: body.owner || 'Unassigned',
          required_green_by: body.deadline || null,
          acceptance_criteria: body.acceptance_criteria || null,
          proof_requirements: proofRequirements,
          escalation_config: escalationConfig,
          // Confirmation tracking
          is_confirmed: isConfirmed,
          confirmed_at: isConfirmed ? new Date().toISOString() : null,
          confirmed_by: isConfirmed ? context!.user_id : null,
          created_by: context!.user_id,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      ...unit,
      _governance: {
        requires_confirmation: !isConfirmed,
        message: isFieldContributor
          ? 'Unit created but requires confirmation from WORKSTREAM_LEAD or PROGRAM_OWNER before counting toward metrics.'
          : null,
      }
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
