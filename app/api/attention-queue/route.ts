import { getSupabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

/**
 * Attention Queue API - Single view for all items requiring immediate action
 */

export async function GET() {
  try {
    const supabase = getSupabaseServer();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile with role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const userRole = profile.role;
    const userOrgId = profile.organization_id;

    // 1. PENDING PROOFS
    let pendingProofsQuery = supabase
      .from('unit_proofs')
      .select(`
        id,
        unit_id,
        uploaded_at,
        uploaded_by_email,
        type,
        approval_status,
        units!inner(
          id,
          title,
          required_green_by,
          high_criticality,
          workstreams!inner(
            id,
            name,
            programs!inner(
              id,
              name,
              org_id
            )
          )
        )
      `)
      .eq('approval_status', 'pending')
      .eq('is_valid', true)
      .order('uploaded_at', { ascending: true });

    if (userRole === 'CLIENT' || userRole === 'WORKSTREAM_LEAD' || userRole === 'PROGRAM_OWNER') {
      pendingProofsQuery = pendingProofsQuery.eq('units.workstreams.programs.org_id', userOrgId);
    }

    const { data: pendingProofs } = await pendingProofsQuery;

    // 2. RED/BLOCKED UNITS
    let unitsAtRiskQuery = supabase
      .from('units')
      .select(`
        id,
        title,
        computed_status,
        required_green_by,
        current_escalation_level,
        is_blocked,
        blocked_reason,
        high_criticality,
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
      .in('computed_status', ['RED', 'BLOCKED'])
      .not('required_green_by', 'is', null)
      .order('required_green_by', { ascending: true })
      .limit(50);

    if (userRole === 'CLIENT' || userRole === 'WORKSTREAM_LEAD' || userRole === 'PROGRAM_OWNER') {
      unitsAtRiskQuery = unitsAtRiskQuery.eq('workstreams.programs.org_id', userOrgId);
    }

    const { data: unitsAtRisk } = await unitsAtRiskQuery;

    // 3. ACTIVE ESCALATIONS
    let activeEscalationsQuery = supabase
      .from('unit_escalations')
      .select(`
        id,
        unit_id,
        escalation_level,
        escalation_type,
        escalation_reason,
        triggered_at,
        status,
        units!inner(
          id,
          title,
          computed_status,
          workstreams!inner(
            id,
            name,
            programs!inner(
              id,
              name,
              org_id
            )
          )
        )
      `)
      .eq('status', 'active')
      .eq('escalation_type', 'manual')
      .order('triggered_at', { ascending: true });

    if (userRole === 'CLIENT' || userRole === 'WORKSTREAM_LEAD' || userRole === 'PROGRAM_OWNER') {
      activeEscalationsQuery = activeEscalationsQuery.eq('units.workstreams.programs.org_id', userOrgId);
    }

    const { data: activeEscalations } = await activeEscalationsQuery;

    // CALCULATE PRIORITIES
    const now = new Date();

    // Transform pending proofs
    const proofItems = (pendingProofs || []).map((proof: any) => {
      const unit = proof.units;
      const deadline = unit.required_green_by ? new Date(unit.required_green_by) : null;
      const hoursUntilDeadline = deadline
        ? (deadline.getTime() - now.getTime()) / (1000 * 60 * 60)
        : null;

      return {
        type: 'proof_pending',
        priority: calculatePriority('proof', hoursUntilDeadline, unit.high_criticality),
        id: proof.id,
        unit_id: proof.unit_id,
        unit_title: unit.title,
        program_name: unit.workstreams.programs.name,
        workstream_name: unit.workstreams.name,
        details: {
          uploaded_by: proof.uploaded_by_email,
          uploaded_at: proof.uploaded_at,
          proof_type: proof.type,
          high_criticality: unit.high_criticality,
        },
        deadline: unit.required_green_by,
        hours_until_deadline: hoursUntilDeadline,
        action_url: `/units/${proof.unit_id}`,
      };
    });

    // Transform units at risk
    const unitItems = (unitsAtRisk || []).map((unit: any) => {
      const deadline = new Date(unit.required_green_by);
      const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

      return {
        type: unit.is_blocked ? 'unit_blocked' : 'unit_at_risk',
        priority: calculatePriority(
          unit.is_blocked ? 'blocked' : 'unit',
          hoursUntilDeadline,
          unit.high_criticality,
          unit.current_escalation_level
        ),
        id: unit.id,
        unit_id: unit.id,
        unit_title: unit.title,
        program_name: unit.workstreams.programs.name,
        workstream_name: unit.workstreams.name,
        details: {
          status: unit.computed_status,
          escalation_level: unit.current_escalation_level,
          blocked_reason: unit.blocked_reason,
          high_criticality: unit.high_criticality,
        },
        deadline: unit.required_green_by,
        hours_until_deadline: hoursUntilDeadline,
        action_url: `/units/${unit.id}`,
      };
    });

    // Transform escalations
    const escalationItems = (activeEscalations || []).map((esc: any) => {
      const unit = esc.units;
      const ageHours = (now.getTime() - new Date(esc.triggered_at).getTime()) / (1000 * 60 * 60);

      return {
        type: 'manual_escalation',
        priority: calculatePriority('escalation', null, false, esc.escalation_level, ageHours),
        id: esc.id,
        unit_id: esc.unit_id,
        unit_title: unit.title,
        program_name: unit.workstreams.programs.name,
        workstream_name: unit.workstreams.name,
        details: {
          escalation_level: esc.escalation_level,
          reason: esc.escalation_reason,
          triggered_at: esc.triggered_at,
          age_hours: Math.round(ageHours * 10) / 10,
        },
        action_url: `/units/${esc.unit_id}`,
      };
    });

    // Combine and sort by priority
    const allItems = [...proofItems, ...unitItems, ...escalationItems].sort(
      (a, b) => b.priority - a.priority
    );

    return NextResponse.json({
      success: true,
      summary: {
        total_items: allItems.length,
        pending_proofs: proofItems.length,
        units_at_risk: unitItems.filter(u => u.type === 'unit_at_risk').length,
        units_blocked: unitItems.filter(u => u.type === 'unit_blocked').length,
        manual_escalations: escalationItems.length,
      },
      items: allItems,
      user_role: userRole,
    });
  } catch (error: any) {
    console.error('Error fetching attention queue:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch attention queue' },
      { status: 500 }
    );
  }
}

function calculatePriority(
  itemType: 'proof' | 'unit' | 'blocked' | 'escalation',
  hoursUntilDeadline: number | null,
  highCriticality: boolean,
  escalationLevel: number = 0,
  ageHours: number = 0
): number {
  let priority = 0;

  if (itemType === 'escalation') {
    priority = 1000;
  } else if (itemType === 'blocked') {
    priority = 900;
  } else if (itemType === 'proof') {
    priority = 700;
  } else {
    priority = 500;
  }

  priority += escalationLevel * 100;

  if (highCriticality) {
    priority += 200;
  }

  if (hoursUntilDeadline !== null) {
    if (hoursUntilDeadline < 0) {
      priority += 200 + Math.min(Math.abs(hoursUntilDeadline), 100);
    } else if (hoursUntilDeadline < 24) {
      priority += 150;
    } else if (hoursUntilDeadline < 48) {
      priority += 100;
    } else if (hoursUntilDeadline < 168) {
      priority += 50;
    }
  }

  if (itemType === 'escalation' && ageHours > 0) {
    priority += Math.min(ageHours, 100);
  }

  return priority;
}
