import { getSupabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

/**
 * Attention Queue API - Single view for all items requiring immediate action
 *
 * Returns:
 * - Proofs pending approval
 * - Units RED/BLOCKED and nearing deadline
 * - Active manual escalations
 *
 * Sorted by priority: deadline urgency, escalation severity, age
 * Respects role-based visibility (no cross-client leakage)
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

    // ========================================================================
    // 1. PENDING PROOFS (Awaiting Approval)
    // ========================================================================

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
              organization_id
            )
          )
        )
      `)
      .eq('approval_status', 'pending')
      .eq('is_valid', true)
      .order('uploaded_at', { ascending: true });

    // Role-based filtering
    if (userRole === 'CLIENT') {
      // Clients see nothing in attention queue
      pendingProofsQuery = pendingProofsQuery.eq('units.workstreams.programs.organization_id', userOrgId);
    } else if (userRole === 'WORKSTREAM_LEAD' || userRole === 'PROGRAM_OWNER') {
      // Leads and Owners see only their org's proofs
      pendingProofsQuery = pendingProofsQuery.eq('units.workstreams.programs.organization_id', userOrgId);
    }
    // PLATFORM_ADMIN sees all

    const { data: pendingProofs } = await pendingProofsQuery;

    // ========================================================================
    // 2. RED/BLOCKED UNITS NEARING DEADLINE
    // ========================================================================

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
            organization_id
          )
        )
      `)
      .in('computed_status', ['RED', 'BLOCKED'])
      .not('required_green_by', 'is', null)
      .order('required_green_by', { ascending: true })
      .limit(50);

    // Role-based filtering
    if (userRole === 'CLIENT') {
      unitsAtRiskQuery = unitsAtRiskQuery.eq('workstreams.programs.organization_id', userOrgId);
    } else if (userRole === 'WORKSTREAM_LEAD' || userRole === 'PROGRAM_OWNER') {
      unitsAtRiskQuery = unitsAtRiskQuery.eq('workstreams.programs.organization_id', userOrgId);
    }

    const { data: unitsAtRisk } = await unitsAtRiskQuery;

    // ========================================================================
    // 3. ACTIVE MANUAL ESCALATIONS (Site Issues/Blockers)
    // ========================================================================

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
              organization_id
            )
          )
        )
      `)
      .eq('status', 'active')
      .eq('escalation_type', 'manual')
      .order('triggered_at', { ascending: true });

    // Role-based filtering
    if (userRole === 'CLIENT') {
      activeEscalationsQuery = activeEscalationsQuery.eq('units.workstreams.programs.organization_id', userOrgId);
    } else if (userRole === 'WORKSTREAM_LEAD' || userRole === 'PROGRAM_OWNER') {
      activeEscalationsQuery = activeEscalationsQuery.eq('units.workstreams.programs.organization_id', userOrgId);
    }

    const { data: activeEscalations } = await activeEscalationsQuery;

    // ========================================================================
    // 4. UNCONFIRMED UNITS (FIELD_CONTRIBUTOR-created, awaiting confirmation)
    // ========================================================================

    let unconfirmedUnitsQuery = supabase
      .from('units')
      .select(`
        id,
        title,
        created_at,
        created_by,
        required_green_by,
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
      .eq('is_confirmed', false)
      .eq('is_archived', false)
      .order('created_at', { ascending: true });

    // Role-based filtering - only WORKSTREAM_LEAD, PROGRAM_OWNER, PLATFORM_ADMIN see unconfirmed
    if (userRole === 'CLIENT_VIEWER' || userRole === 'FIELD_CONTRIBUTOR') {
      // These roles don't see unconfirmed units in attention queue
      unconfirmedUnitsQuery = unconfirmedUnitsQuery.eq('id', '00000000-0000-0000-0000-000000000000'); // No results
    } else if (userRole === 'WORKSTREAM_LEAD' || userRole === 'PROGRAM_OWNER') {
      unconfirmedUnitsQuery = unconfirmedUnitsQuery.eq('workstreams.programs.organization_id', userOrgId);
    }
    // PLATFORM_ADMIN sees all

    const { data: unconfirmedUnits } = await unconfirmedUnitsQuery;

    // ========================================================================
    // 5. CALCULATE PRIORITIES AND SORT
    // ========================================================================

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

    // Transform unconfirmed units
    const unconfirmedItems = (unconfirmedUnits || []).map((unit: any) => {
      const ageHours = (now.getTime() - new Date(unit.created_at).getTime()) / (1000 * 60 * 60);

      return {
        type: 'unit_unconfirmed',
        priority: calculatePriority('unconfirmed', null, false, 0, ageHours),
        id: unit.id,
        unit_id: unit.id,
        unit_title: unit.title,
        program_name: unit.workstreams.programs.name,
        workstream_name: unit.workstreams.name,
        details: {
          created_at: unit.created_at,
          age_hours: Math.round(ageHours * 10) / 10,
          deadline: unit.required_green_by,
        },
        action_url: `/units/${unit.id}`,
      };
    });

    // Combine and sort by priority (higher = more urgent)
    const allItems = [...proofItems, ...unitItems, ...escalationItems, ...unconfirmedItems].sort(
      (a, b) => b.priority - a.priority
    );

    // ========================================================================
    // 5. RETURN RESPONSE
    // ========================================================================

    return NextResponse.json({
      success: true,
      summary: {
        total_items: allItems.length,
        pending_proofs: proofItems.length,
        units_at_risk: unitItems.filter(u => u.type === 'unit_at_risk').length,
        units_blocked: unitItems.filter(u => u.type === 'unit_blocked').length,
        manual_escalations: escalationItems.length,
        units_unconfirmed: unconfirmedItems.length,
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

/**
 * Calculate priority score for sorting attention queue
 * Higher score = more urgent
 */
function calculatePriority(
  itemType: 'proof' | 'unit' | 'blocked' | 'escalation' | 'unconfirmed',
  hoursUntilDeadline: number | null,
  highCriticality: boolean,
  escalationLevel: number = 0,
  ageHours: number = 0
): number {
  let priority = 0;

  // Base priority by type
  if (itemType === 'escalation') {
    priority = 1000; // Manual escalations are highest priority
  } else if (itemType === 'blocked') {
    priority = 900; // Blocked units are very high priority
  } else if (itemType === 'unconfirmed') {
    priority = 800; // Unconfirmed units are high priority (scope governance)
  } else if (itemType === 'proof') {
    priority = 700; // Pending proofs are high priority
  } else {
    priority = 500; // Units at risk are medium-high priority
  }

  // Escalation level bonus (0-300)
  priority += escalationLevel * 100;

  // High criticality bonus
  if (highCriticality) {
    priority += 200;
  }

  // Deadline urgency (0-200 based on hours remaining)
  if (hoursUntilDeadline !== null) {
    if (hoursUntilDeadline < 0) {
      // Past deadline
      priority += 200 + Math.min(Math.abs(hoursUntilDeadline), 100);
    } else if (hoursUntilDeadline < 24) {
      // Less than 24 hours
      priority += 150;
    } else if (hoursUntilDeadline < 48) {
      // Less than 48 hours
      priority += 100;
    } else if (hoursUntilDeadline < 168) {
      // Less than 1 week
      priority += 50;
    }
  }

  // Age bonus for escalations and unconfirmed units (older = more urgent)
  if ((itemType === 'escalation' || itemType === 'unconfirmed') && ageHours > 0) {
    priority += Math.min(ageHours, 100);
  }

  return priority;
}
