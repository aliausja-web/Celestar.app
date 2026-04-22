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
      email: u.email,
      full_name: u.full_name,
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
    const { email, password, full_name } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Email basic validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Always create as FIELD_CONTRIBUTOR in caller's own org
    const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createAuthError) throw createAuthError;

    const { error: profileError } = await supabaseAdmin.from('profiles').insert([{
      user_id: authData.user.id,
      email,
      full_name: full_name?.trim() || 'Field Contributor',
      role: 'FIELD_CONTRIBUTOR',
      org_id: context.org_id,
    }]);

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    return NextResponse.json(
      { user_id: authData.user.id, email: authData.user.email },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
