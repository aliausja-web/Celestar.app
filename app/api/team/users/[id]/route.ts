import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-utils';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_ROLES = ['PLATFORM_ADMIN', 'PROGRAM_OWNER', 'WORKSTREAM_LEAD'] as const;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// PATCH /api/team/users/[id] - Update display name and/or unit assignments for a FIELD_CONTRIBUTOR
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: [...ALLOWED_ROLES],
    });

    if (!authorized || !context) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const targetUserId = params.id;
    const supabaseAdmin = getSupabaseAdmin();

    // Verify target user exists and belongs to the caller's org
    const { data: targetProfile, error: profileFetchError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, role, org_id')
      .eq('user_id', targetUserId)
      .single();

    if (profileFetchError || !targetProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (context.role !== 'PLATFORM_ADMIN' && targetProfile.org_id !== context.org_id) {
      return NextResponse.json({ error: 'Forbidden — user is not in your organization' }, { status: 403 });
    }

    if (context.role !== 'PLATFORM_ADMIN' && targetProfile.role !== 'FIELD_CONTRIBUTOR') {
      return NextResponse.json(
        { error: 'Forbidden — you can only edit Field Contributor accounts' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { full_name, unit_ids } = body;

    // Update display name if provided
    if (full_name !== undefined) {
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ full_name: String(full_name).trim() || targetProfile.user_id })
        .eq('user_id', targetUserId);
      if (updateError) throw updateError;
    }

    // Replace unit assignments if provided
    if (Array.isArray(unit_ids)) {
      const assignedUnitIds: string[] = unit_ids.filter((id) => typeof id === 'string');

      // Verify all units belong to caller's org
      if (assignedUnitIds.length > 0) {
        const { data: unitCheck } = await supabaseAdmin
          .from('units')
          .select('id, workstreams!inner(programs!inner(org_id))')
          .in('id', assignedUnitIds);

        const badUnit = (unitCheck ?? []).find(
          (u: any) => u.workstreams?.programs?.org_id !== context.org_id
        );
        if (badUnit || (unitCheck ?? []).length !== assignedUnitIds.length) {
          return NextResponse.json(
            { error: 'One or more selected units do not belong to your organisation' },
            { status: 400 }
          );
        }
      }

      // Delete existing assignments and insert new ones atomically
      const { error: deleteError } = await supabaseAdmin
        .from('unit_assignments')
        .delete()
        .eq('user_id', targetUserId);
      if (deleteError) throw deleteError;

      if (assignedUnitIds.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from('unit_assignments')
          .insert(assignedUnitIds.map((unit_id) => ({
            unit_id,
            user_id: targetUserId,
            assigned_by: context.user_id,
          })));
        if (insertError) throw insertError;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/team/users/[id] - Remove a FIELD_CONTRIBUTOR login
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: [...ALLOWED_ROLES],
    });

    if (!authorized || !context) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const targetUserId = params.id;

    if (targetUserId === context.user_id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 403 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Fetch the target user's profile to verify org and role
    const { data: targetProfile, error: profileFetchError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, email, role, org_id')
      .eq('user_id', targetUserId)
      .single();

    if (profileFetchError || !targetProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Non-platform-admins can only delete users in their own org
    if (context.role !== 'PLATFORM_ADMIN' && targetProfile.org_id !== context.org_id) {
      return NextResponse.json({ error: 'Forbidden — user is not in your organization' }, { status: 403 });
    }

    // Non-platform-admins can only remove FIELD_CONTRIBUTOR accounts
    if (context.role !== 'PLATFORM_ADMIN' && targetProfile.role !== 'FIELD_CONTRIBUTOR') {
      return NextResponse.json(
        { error: 'Forbidden — you can only remove Field Contributor accounts' },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (deleteError) throw deleteError;

    // Explicit profile cleanup as a safety net
    await supabaseAdmin.from('profiles').delete().eq('user_id', targetUserId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
