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
