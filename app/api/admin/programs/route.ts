import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// GET /api/admin/programs - List all programs with organization info
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

    const { data: programs, error } = await supabase
      .from('programs')
      .select(`
        id,
        name,
        description,
        client_organization_id,
        created_at,
        organizations (
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Format response
    const formattedPrograms = programs?.map((program: any) => ({
      id: program.id,
      name: program.name,
      description: program.description,
      client_organization_id: program.client_organization_id,
      organization_name: program.organizations?.name,
      created_at: program.created_at,
    }));

    return NextResponse.json({ programs: formattedPrograms });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
