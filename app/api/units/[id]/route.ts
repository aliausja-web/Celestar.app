import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// GET /api/units/[id] - Get a specific unit with proofs
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // TENANT SAFETY: Authenticate user
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader);

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const supabase = getSupabaseServer();

    // TENANT SAFETY: Get unit with organization hierarchy
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
            organization_id
          )
        )
      `)
      .eq('id', params.id)
      .single();

    if (error || !unit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    // TENANT SAFETY: Verify unit belongs to user's organization
    const unitOrgId = unit.workstreams.programs.organization_id;
    const userOrgId = context!.org_id;

    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== userOrgId) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // Get proofs
    const { data: proofs } = await supabase
      .from('unit_proofs')
      .select('*')
      .eq('unit_id', params.id)
      .order('uploaded_at', { ascending: false });

    return NextResponse.json({
      ...unit,
      proofs: proofs || [],
      proof_count: proofs?.length || 0,
      last_proof_time: proofs?.[0]?.uploaded_at || null,
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
    // TENANT SAFETY: Authenticate user
    // GOVERNANCE: FIELD_CONTRIBUTOR can only edit title/description
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
      .select('workstreams!inner(programs!inner(organization_id)), created_by')
      .eq('id', params.id)
      .single();

    if (!unitCheck) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    const unitOrgId = unitCheck.workstreams[0].programs[0].organization_id;
    const userOrgId = context!.org_id;

    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== userOrgId) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    const body = await request.json();

    // GOVERNANCE: FIELD_CONTRIBUTOR restrictions
    // Can only edit title and description (low-risk fields)
    // Cannot modify: deadline, acceptance_criteria, proof requirements, escalation config, etc.
    if (context!.role === 'FIELD_CONTRIBUTOR') {
      const restrictedFields = [
        'required_green_by',
        'acceptance_criteria',
        'proof_requirements',
        'required_proof_count',
        'required_proof_types',
        'alert_profile',
        'escalation_config',
        'high_criticality',
        'workstream_id',
        'is_blocked',
        'blocked_reason',
        'is_confirmed',
        'is_archived',
      ];

      const attemptedRestrictedFields = Object.keys(body).filter(key =>
        restrictedFields.includes(key)
      );

      if (attemptedRestrictedFields.length > 0) {
        return NextResponse.json({
          error: 'FIELD_CONTRIBUTOR cannot modify restricted fields',
          restricted_fields: attemptedRestrictedFields,
          allowed_fields: ['title', 'owner_party_name'],
        }, { status: 403 });
      }

      // Only allow specific fields for FIELD_CONTRIBUTOR
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

    // Non-FIELD roles can update any field
    const { data: unit, error } = await supabase
      .from('units')
      .update(body)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(unit);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/units/[id] - Archive a unit (soft delete for audit safety)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // TENANT SAFETY: Authenticate user
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN', 'PROGRAM_OWNER'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();

    // TENANT SAFETY: Verify unit belongs to user's organization before archiving
    const { data: unitCheck } = await supabase
      .from('units')
      .select('workstreams!inner(programs!inner(organization_id)), is_archived')
      .eq('id', params.id)
      .single();

    if (!unitCheck) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    if (unitCheck.is_archived) {
      return NextResponse.json({ error: 'Unit is already archived' }, { status: 400 });
    }

    const unitOrgId = unitCheck.workstreams[0].programs[0].organization_id;
    const userOrgId = context!.org_id;

    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== userOrgId) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // GOVERNANCE: Soft delete (archive) instead of hard delete
    // Proofs, escalations, and status_events are preserved
    const { error } = await supabase
      .from('units')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by: context!.user_id,
      })
      .eq('id', params.id);

    if (error) throw error;

    // Log audit event
    await supabase.from('unit_status_events').insert({
      unit_id: params.id,
      event_type: 'unit_archived',
      triggered_by: context!.user_id,
      triggered_by_role: context!.role,
      reason: 'Unit archived by user action',
      metadata: {
        archived_by_role: context!.role,
      },
    });

    return NextResponse.json({
      success: true,
      archived: true,
      message: 'Unit archived. Proofs and audit trail preserved.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
