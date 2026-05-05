import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

/**
 * POST /api/units/[id]/unblock - Remove BLOCKED status from unit
 * Only PROGRAM_OWNER or PLATFORM_ADMIN can unblock
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN', 'PROGRAM_OWNER'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();
    const unitId = params.id;

    // Get current unit with tenant info
    const { data: unit, error: unitError } = await supabase
      .from('units')
      .select('*, workstreams!inner(programs!inner(org_id))')
      .eq('id', unitId)
      .single();

    if (unitError || !unit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    // TENANT SAFETY: Verify unit belongs to user's organization
    const unitOrgId = (unit.workstreams as any)?.programs?.org_id;
    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    if (!unit.is_blocked) {
      return NextResponse.json(
        { error: 'Unit is not currently blocked' },
        { status: 400 }
      );
    }

    // Require a resolution note so there is a human-readable record of what changed
    let body: { resolution_note?: string } = {};
    try { body = await request.json(); } catch { /* empty body is handled below */ }
    const resolutionNote = body.resolution_note?.trim();
    if (!resolutionNote) {
      return NextResponse.json(
        { error: 'resolution_note is required — explain what was done to resolve the blocker' },
        { status: 400 }
      );
    }

    // Snapshot the original block details before clearing them (for the audit record)
    const originalBlockedReason = unit.blocked_reason || 'No reason recorded';
    const originalBlockedAt = unit.blocked_at;
    const originalBlockedBy = unit.blocked_by;

    // Unblock unit
    const { error: updateError } = await supabase
      .from('units')
      .update({
        is_blocked: false,
        blocked_reason: null,
        blocked_at: null,
        blocked_by: null,
      })
      .eq('id', unitId);

    if (updateError) {
      console.warn('Unblock update failed:', updateError.message);
      return NextResponse.json({
        error: 'Unblock feature not available - database migration may be pending'
      }, { status: 503 });
    }

    // Trigger status recomputation (optional - may not exist)
    try {
      await supabase.rpc('compute_unit_status', { unit_id_param: unitId });
    } catch (rpcError) {
      console.warn('Status recomputation RPC not available:', rpcError);
    }

    // Resolve active escalations for this unit.
    // The DB trigger does this automatically when a unit turns GREEN, but if the unit
    // is unblocked while still RED (no approved proofs yet) the trigger never fires,
    // so active escalations would keep sending emails on every cron cycle.
    // We mirror the trigger here: the blocker is gone, so the current escalation
    // cycle is over. The cron will re-escalate naturally if the unit is still
    // overdue after the blocker is cleared.
    await supabase
      .from('unit_escalations')
      .update({ status: 'resolved' })
      .eq('unit_id', unitId)
      .eq('status', 'active');

    // Reset the level on the unit itself so the workstream badges and attention
    // queue show a clean state immediately.
    await supabase
      .from('units')
      .update({ current_escalation_level: 0 })
      .eq('id', unitId);

    // Immutable audit trail — record who resolved the block, why, and what the original block was
    await supabase.from('unit_status_events').insert({
      unit_id: unitId,
      event_type: 'unit_unblocked',
      triggered_by: context!.user_id,
      triggered_by_role: context!.role,
      reason: resolutionNote,
      metadata: {
        resolution_note: resolutionNote,
        original_blocked_reason: originalBlockedReason,
        original_blocked_at: originalBlockedAt,
        original_blocked_by: originalBlockedBy,
      },
    });

    // Look up resolver's display name for the notification
    const { data: resolverProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', context!.user_id)
      .single();
    const resolverName = resolverProfile?.full_name || resolverProfile?.email || 'A program owner';

    // Notify recipients — include who resolved it and the resolution note
    const { data: recipients } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('org_id', unitOrgId)
      .in('role', ['FIELD_CONTRIBUTOR', 'WORKSTREAM_LEAD', 'PROGRAM_OWNER']);

    if (recipients && recipients.length > 0) {
      await supabase.from('in_app_notifications').insert(
        recipients.map((r: any) => ({
          user_id: r.user_id,
          title: 'Unit Unblocked',
          message: `"${unit.title}" has been unblocked by ${resolverName}. Resolution: ${resolutionNote}`,
          type: 'unit_unblocked',
          priority: 'high',
          related_unit_id: unitId,
          action_url: `/units/${unitId}`,
          metadata: {
            unit_title: unit.title,
            resolved_by: resolverName,
            resolution_note: resolutionNote,
          },
        }))
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Unit unblocked successfully',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
