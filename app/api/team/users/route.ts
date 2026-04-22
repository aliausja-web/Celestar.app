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

// GET /api/team/users - List FIELD_CONTRIBUTOR users in caller's org
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

    // PLATFORM_ADMIN sees all field contributors; others see only their org
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
    }));

    return NextResponse.json({ users: formatted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/team/users - Create a FIELD_CONTRIBUTOR in caller's org
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
    const { username, password, full_name } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    // Username: lowercase letters, numbers, underscores, hyphens; 3–30 chars
    if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
      return NextResponse.json(
        { error: 'Username must be 3–30 characters and contain only lowercase letters, numbers, underscores, or hyphens' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Synthetic email — Supabase auth requires one but labourers don't have email
    const syntheticEmail = `${username}@field.celestar.internal`;

    const supabaseAdmin = getSupabaseAdmin();

    // Always create as FIELD_CONTRIBUTOR in caller's own org
    const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail,
      password,
      email_confirm: true,
    });

    if (createAuthError) {
      // Surface a friendlier duplicate-username error
      if (createAuthError.message.includes('already registered')) {
        return NextResponse.json({ error: 'Username already taken — choose a different one' }, { status: 409 });
      }
      throw createAuthError;
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').insert([{
      user_id: authData.user.id,
      email: syntheticEmail,
      full_name: full_name?.trim() || username,
      role: 'FIELD_CONTRIBUTOR',
      org_id: context.org_id,
    }]);

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    return NextResponse.json(
      { user_id: authData.user.id, username },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
