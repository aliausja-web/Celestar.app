import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-utils';
import { createClient } from '@supabase/supabase-js';
import { authLimiter, applyRateLimit } from '@/lib/rate-limit';

const ALLOWED_ROLES = ['PLATFORM_ADMIN', 'PROGRAM_OWNER', 'WORKSTREAM_LEAD'] as const;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/team/users - List FIELD_CONTRIBUTOR users in caller's org with assignment counts
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: [...ALLOWED_ROLES],
    });

    if (!authorized || !context) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    let query = supabaseAdmin
      .from('profiles')
      .select('user_id, email, full_name, role, org_id, created_at, orgs(id, name)')
      .eq('role', 'FIELD_CONTRIBUTOR')
      .order('created_at', { ascending: false });

    if (context.role !== 'PLATFORM_ADMIN') {
      query = query.eq('org_id', context.org_id);
    }

    const { data: users, error } = await query;
    if (error) throw error;

    // Fetch assignment info for each user
    const userIds = (users ?? []).map((u: any) => u.user_id);
    let assignmentsByUser: Record<string, { unit_id: string; unit_title: string }[]> = {};

    if (userIds.length > 0) {
      const { data: assignments } = await supabaseAdmin
        .from('unit_assignments')
        .select('user_id, unit_id, units(id, title)')
        .in('user_id', userIds);

      for (const a of assignments ?? []) {
        const uid = (a as any).user_id;
        if (!assignmentsByUser[uid]) assignmentsByUser[uid] = [];
        assignmentsByUser[uid].push({
          unit_id: (a as any).unit_id,
          unit_title: (a as any).units?.title ?? 'Unknown unit',
        });
      }
    }

    const formatted = (users ?? []).map((u: any) => ({
      user_id: u.user_id,
      username: u.email.endsWith('@field.celestar.internal')
        ? u.email.replace('@field.celestar.internal', '')
        : null,
      display_name: u.full_name,
      role: u.role,
      organization_id: u.org_id,
      organization_name: u.orgs?.name,
      created_at: u.created_at,
      assigned_units: assignmentsByUser[u.user_id] ?? [],
    }));

    return NextResponse.json({ users: formatted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/team/users - Create a FIELD_CONTRIBUTOR in caller's org with optional unit assignments
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: [...ALLOWED_ROLES],
    });

    if (!authorized || !context) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { limited, headers: rlHeaders } = await applyRateLimit(authLimiter, context.user_id);
    if (limited) {
      return NextResponse.json(
        { error: 'Too many requests — please slow down and try again shortly.' },
        { status: 429, headers: rlHeaders }
      );
    }

    const body = await request.json();
    const { username, password, full_name, unit_ids } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
      return NextResponse.json(
        { error: 'Username must be 3–30 characters: lowercase letters, numbers, underscores, or hyphens only' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const assignedUnitIds: string[] = Array.isArray(unit_ids) ? unit_ids : [];

    const supabaseAdmin = getSupabaseAdmin();

    // Verify all specified unit_ids belong to the caller's org
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

    const syntheticEmail = `${username}@field.celestar.internal`;

    const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail,
      password,
      email_confirm: true,
    });

    if (createAuthError) {
      if (createAuthError.message.includes('already registered')) {
        return NextResponse.json({ error: 'Username already taken — choose a different one' }, { status: 409 });
      }
      throw createAuthError;
    }

    const newUserId = authData.user.id;

    const { error: profileError } = await supabaseAdmin.from('profiles').insert([{
      user_id: newUserId,
      email: syntheticEmail,
      full_name: full_name?.trim() || username,
      role: 'FIELD_CONTRIBUTOR',
      org_id: context.org_id,
    }]);

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw profileError;
    }

    // Create unit assignments if any were specified
    if (assignedUnitIds.length > 0) {
      const assignmentRows = assignedUnitIds.map((unit_id) => ({
        unit_id,
        user_id: newUserId,
        assigned_by: context.user_id,
      }));

      const { error: assignError } = await supabaseAdmin
        .from('unit_assignments')
        .insert(assignmentRows);

      if (assignError) {
        // Don't roll back the user — assignments can be added later; just report the issue
        console.error('[POST /api/team/users] Failed to create unit assignments:', assignError);
      }
    }

    return NextResponse.json(
      { user_id: newUserId, username, assigned_unit_count: assignedUnitIds.length },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
