import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// GET /api/admin/organizations - List all client organizations
// Uses 'orgs' table which is what profiles.org_id references
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();

    const { data: orgs, error } = await supabase
      .from('orgs')
      .select('*')
      .neq('id', 'org_celestar') // Exclude platform admin org
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Format to match expected UI structure
    const organizations = orgs?.map((org: any) => ({
      id: org.id,
      name: org.name,
      client_code: org.id, // org.id is the client_code (e.g., 'org_test_alpha')
      created_at: org.created_at,
    }));

    return NextResponse.json({ organizations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/admin/organizations - Create new client organization
// Creates in 'orgs' table for RBAC consistency
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const body = await request.json();
    const { name, client_code } = body;

    if (!name || !client_code) {
      return NextResponse.json(
        { error: 'Name and client_code are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // Generate org_id from client_code (e.g., 'ACME' -> 'org_acme')
    const org_id = `org_${client_code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    // Check if org already exists
    const { data: existing } = await supabase
      .from('orgs')
      .select('id')
      .eq('id', org_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Organization with this code already exists' },
        { status: 409 }
      );
    }

    const { data: org, error } = await supabase
      .from('orgs')
      .insert([
        {
          id: org_id,
          name,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Format response to match expected UI structure
    const organization = {
      id: org.id,
      name: org.name,
      client_code: org.id,
      created_at: org.created_at,
    };

    return NextResponse.json({ organization }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
