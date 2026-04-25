import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-utils';
import { getSupabaseServer } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// POST /api/voice-notes/upload
// Accepts multipart/form-data: file (audio/webm) + workstream_id
// Uploads to private voice-notes bucket under {org_id}/{workstream_id}/{timestamp}.webm
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader);

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const workstreamId = formData.get('workstream_id') as string | null;

    if (!file || !workstreamId) {
      return NextResponse.json({ error: 'file and workstream_id are required' }, { status: 400 });
    }

    // Verify the workstream belongs to the caller's org
    const supabase = getSupabaseServer();
    const { data: wsCheck } = await supabase
      .from('workstreams')
      .select('programs!inner(org_id)')
      .eq('id', workstreamId)
      .single();

    if (!wsCheck) {
      return NextResponse.json({ error: 'Workstream not found' }, { status: 404 });
    }

    const wsOrgId = (wsCheck.programs as any)?.org_id;
    if (context!.role !== 'PLATFORM_ADMIN' && wsOrgId !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // Path is org-scoped so RLS policies can enforce isolation
    const path = `${context!.org_id}/${workstreamId}/${Date.now()}.webm`;

    const arrayBuffer = await file.arrayBuffer();
    const admin = getSupabaseAdmin();

    const { error: uploadError } = await admin.storage
      .from('voice-notes')
      .upload(path, arrayBuffer, { contentType: 'audio/webm' });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    return NextResponse.json({ path }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
