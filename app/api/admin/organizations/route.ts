import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// GET /api/admin/organizations - List all client organizations
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

    const { data: organizations, error } = await supabase
      .from('organizations')
      .select('*')
      .neq('name', 'Platform Admin Organization') // Exclude platform admin org
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ organizations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/admin/organizations - Create new client organization
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
    const { name, client_code, industry, contact_email } = body;

    if (!name || !client_code) {
      return NextResponse.json(
        { error: 'Name and client_code are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // Check if client_code already exists
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('client_code', client_code)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Client code already exists' },
        { status: 409 }
      );
    }

    const { data: organization, error } = await supabase
      .from('organizations')
      .insert([
        {
          name,
          client_code,
          industry,
          contact_email,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ organization }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
