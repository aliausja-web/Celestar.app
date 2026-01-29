import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { AppRole } from '@/lib/types';

// Create Supabase admin client
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    // Check if environment variables are available
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing environment variables');
      return NextResponse.json(
        { error: 'Server configuration error - missing environment variables' },
        { status: 500 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Get the authorization header to verify the requesting user
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized - No authorization header' },
        { status: 401 }
      );
    }

    // Verify the requesting user is a platform admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth verification failed:', authError);
      return NextResponse.json(
        { error: 'Unauthorized - Invalid token' },
        { status: 401 }
      );
    }

    // Check if user is platform admin
    const { data: profileData, error: profileFetchError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profileFetchError || !profileData || profileData.role !== 'PLATFORM_ADMIN') {
      console.error('User is not platform admin:', { profileData });
      return NextResponse.json(
        { error: 'Forbidden - Platform admin access required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { email, password, full_name, org_id, role, program_id, workstream_id, role_override } = body;

    console.log('Creating RBAC user:', { email, role, org_id });

    // Validate input
    if (!email || !password || !full_name || !org_id || !role) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, full_name, org_id, role' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles: AppRole[] = [
      'PLATFORM_ADMIN',
      'PROGRAM_OWNER',
      'WORKSTREAM_LEAD',
      'FIELD_CONTRIBUTOR',
      'CLIENT_VIEWER',
    ];

    if (!validRoles.includes(role as AppRole)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    // Create auth user using admin API
    const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createAuthError) {
      console.error('Error creating auth user:', createAuthError);
      return NextResponse.json(
        { error: createAuthError.message },
        { status: 400 }
      );
    }

    // Insert profile record
    const { error: profileError } = await supabaseAdmin.from('profiles').insert([
      {
        user_id: authData.user.id,
        email,
        full_name,
        organization_id: org_id, // API accepts org_id but column is organization_id
        role: role as AppRole,
      },
    ]);

    if (profileError) {
      console.error('Error inserting profile record:', profileError);
      // Try to clean up the auth user if profile insert fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: profileError.message },
        { status: 400 }
      );
    }

    // Optionally assign to program with role override
    if (program_id && role_override) {
      const { error: programMemberError } = await supabaseAdmin.from('program_members').insert([
        {
          program_id,
          user_id: authData.user.id,
          role_override: role_override as AppRole,
          added_by: user.id,
        },
      ]);

      if (programMemberError) {
        console.error('Error assigning to program:', programMemberError);
        // Continue anyway - user is created
      }
    }

    // Optionally assign to workstream with role override
    if (workstream_id && role_override) {
      const { error: workstreamMemberError } = await supabaseAdmin.from('workstream_members').insert([
        {
          workstream_id,
          user_id: authData.user.id,
          role_override: role_override as AppRole,
          added_by: user.id,
        },
      ]);

      if (workstreamMemberError) {
        console.error('Error assigning to workstream:', workstreamMemberError);
        // Continue anyway - user is created
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        full_name,
        role,
        org_id,
      },
    });
  } catch (error: any) {
    console.error('Error in create-rbac-user API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
