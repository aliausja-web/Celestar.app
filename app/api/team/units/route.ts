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

// GET /api/team/units - List all units in caller's org for assignment purposes
// Returns units grouped by program → workstream for use in the create-user dialog
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
      .from('units')
      .select(`
        id,
        title,
        workstreams!inner (
          id,
          name,
          programs!inner (
            id,
            name,
            org_id
          )
        )
      `)
      .order('title', { ascending: true });

    // Scope to caller's org unless platform admin
    if (context.role !== 'PLATFORM_ADMIN') {
      query = query.eq('workstreams.programs.org_id', context.org_id);
    }

    const { data: units, error } = await query;
    if (error) throw error;

    // Group by program → workstream for the UI
    const grouped: Record<string, {
      program_id: string;
      program_name: string;
      workstreams: Record<string, {
        workstream_id: string;
        workstream_name: string;
        units: { id: string; title: string }[];
      }>;
    }> = {};

    for (const u of units ?? []) {
      const ws = u.workstreams as any;
      const pr = ws?.programs;
      if (!pr || (context.role !== 'PLATFORM_ADMIN' && pr.org_id !== context.org_id)) continue;

      if (!grouped[pr.id]) {
        grouped[pr.id] = { program_id: pr.id, program_name: pr.name, workstreams: {} };
      }
      if (!grouped[pr.id].workstreams[ws.id]) {
        grouped[pr.id].workstreams[ws.id] = {
          workstream_id: ws.id,
          workstream_name: ws.name,
          units: [],
        };
      }
      grouped[pr.id].workstreams[ws.id].units.push({ id: u.id, title: u.title });
    }

    // Convert to array for JSON response
    const result = Object.values(grouped).map((prog) => ({
      ...prog,
      workstreams: Object.values(prog.workstreams),
    }));

    return NextResponse.json({ programs: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
