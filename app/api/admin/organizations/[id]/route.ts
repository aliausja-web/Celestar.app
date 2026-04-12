import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// DELETE /api/admin/organizations/[id] - Delete a client organization
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();
    const organizationId = params.id;

    // Don't allow deleting the Platform Admin org
    if (organizationId === 'org_celestar') {
      return NextResponse.json(
        { error: 'Cannot delete the Platform Admin organization' },
        { status: 403 }
      );
    }

    // Verify org exists before attempting delete
    const { data: org } = await supabase
      .from('orgs')
      .select('id')
      .eq('id', organizationId)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('orgs')
      .delete()
      .eq('id', organizationId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
