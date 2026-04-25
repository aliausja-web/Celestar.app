import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-utils';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/voice-notes/signed-url?path=<storage_path>
// Returns a 1-hour signed URL for a voice note, after verifying org ownership.
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader);

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    // Enforce org isolation: the first path segment must be the caller's org_id.
    // PLATFORM_ADMIN can access any org's files.
    const pathOrgId = path.split('/')[0];
    if (context!.role !== 'PLATFORM_ADMIN' && pathOrgId !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.storage
      .from('voice-notes')
      .createSignedUrl(path, 3600); // 1-hour expiry

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Failed to generate signed URL' }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
