import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// GET /api/units/[id] - Get a specific unit with proofs
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

    const { data: unit, error } = await supabase
      .from('units')
      .select(`
        *,
        workstreams!inner(
          id,
          name,
          programs!inner(
            id,
            name,
            org_id
          )
        )
      `)
      .eq('id', params.id)
      .single();

    if (error || !unit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    // TENANT SAFETY: Verify unit belongs to user's organization
    const unitOrgId = (unit.workstreams as any)?.programs?.org_id;
    const userOrgId = context!.org_id;

    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== userOrgId) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // All roles (including FIELD_CONTRIBUTOR) can access any unit in their org.
    // Org-level tenant safety is already enforced above (unitOrgId === userOrgId).

    // Get proofs
    const { data: proofs } = await supabase
      .from('unit_proofs')
      .select('*')
      .eq('unit_id', params.id)
      .order('uploaded_at', { ascending: false });

    // Get last voice-note play event + player's name
    const { data: lastPlayEvent } = await supabase
      .from('unit_status_events')
      .select('created_at, triggered_by, metadata')
      .eq('unit_id', params.id)
      .eq('event_type', 'voice_note_played')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let lastVoiceNotePlay: { played_at: string; full_name: string } | null = null;
    if (lastPlayEvent) {
      const meta = (lastPlayEvent.metadata as any) || {};
      lastVoiceNotePlay = {
        played_at: lastPlayEvent.created_at,
        full_name: meta.full_name || meta.email || 'Unknown',
      };
    }

    return NextResponse.json({
      ...unit,
      // voice_note_url already stores the full public URL; expose as
      // voice_note_signed_url for the detail page to consume uniformly
      voice_note_signed_url: (unit as any).voice_note_url ?? null,
      proofs: proofs || [],
      proof_count: proofs?.length || 0,
      last_proof_time: proofs?.[0]?.uploaded_at || null,
      last_voice_note_play: lastVoiceNotePlay,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/units/[id] - Update a unit
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN', 'PROGRAM_OWNER', 'WORKSTREAM_LEAD', 'FIELD_CONTRIBUTOR'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();

    // TENANT SAFETY: Verify unit belongs to user's organization before updating
    const { data: unitCheck } = await supabase
      .from('units')
      .select('workstreams!inner(programs!inner(org_id))')
      .eq('id', params.id)
      .single();

    if (!unitCheck) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    const unitOrgId = (unitCheck.workstreams as any)?.programs?.org_id;
    const userOrgId = context!.org_id;

    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== userOrgId) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    const body = await request.json();

    // FIELD_CONTRIBUTOR can only edit title and owner
    if (context!.role === 'FIELD_CONTRIBUTOR') {
      const allowedFields = ['title', 'owner_party_name'];
      const filteredBody: Record<string, any> = {};
      for (const key of allowedFields) {
        if (body[key] !== undefined) {
          filteredBody[key] = body[key];
        }
      }

      if (Object.keys(filteredBody).length === 0) {
        return NextResponse.json({
          error: 'No allowed fields provided',
          allowed_fields: allowedFields,
        }, { status: 400 });
      }

      const { data: unit, error } = await supabase
        .from('units')
        .update(filteredBody)
        .eq('id', params.id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json(unit);
    }

    // Higher-privileged roles can update these fields only
    // computed_status, is_blocked, status_computed_at, current_escalation_level
    // are NEVER manually settable — they are driven by DB triggers and the escalation API
    const PRIVILEGED_ALLOWED_FIELDS = [
      'title',
      'owner_party_name',
      'required_green_by',
      'acceptance_criteria',
      'management_notes',
      'voice_note_url',
      'proof_requirements',
      'escalation_config',
      'requires_reviewer_approval',
      'requires_reference_number',
      'requires_expiry_date',
      'ordering',
      'description',
    ];
    const filteredBody: Record<string, any> = {};
    for (const key of PRIVILEGED_ALLOWED_FIELDS) {
      if (body[key] !== undefined) {
        filteredBody[key] = body[key];
      }
    }

    if (Object.keys(filteredBody).length === 0) {
      return NextResponse.json({
        error: 'No allowed fields provided',
        allowed_fields: PRIVILEGED_ALLOWED_FIELDS,
      }, { status: 400 });
    }

    const { data: unit, error } = await supabase
      .from('units')
      .update(filteredBody)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(unit);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/units/[id] - Delete a unit
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN', 'PROGRAM_OWNER', 'WORKSTREAM_LEAD'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
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
    const userOrgId = context!.org_id;

    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== userOrgId) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // Delete the unit
    const { error } = await supabase.from('units').delete().eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
