import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-utils';
import { getSupabaseServer } from '@/lib/supabase-server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; proofId: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');

    // Authorize: Only PLATFORM_ADMIN, PROGRAM_OWNER, or WORKSTREAM_LEAD can approve proofs
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN', 'PROGRAM_OWNER', 'WORKSTREAM_LEAD'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const body = await request.json();
    const { action, rejection_reason } = body; // action: 'approve' | 'reject'

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    if (action === 'reject' && !rejection_reason) {
      return NextResponse.json(
        { error: 'Rejection reason is required when rejecting a proof' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // Get the proof to check uploader
    const { data: proof, error: proofFetchError } = await supabase
      .from('unit_proofs')
      .select('*')
      .eq('id', params.proofId)
      .single();

    if (proofFetchError || !proof) {
      return NextResponse.json({ error: 'Proof not found' }, { status: 404 });
    }

    // Enforce separation of duties: approver cannot be the uploader
    // Compare using both user_id (as string) and email for safety
    const uploaderMatches =
      proof.uploaded_by === context!.user_id ||
      proof.uploaded_by === context!.user_id.toString() ||
      proof.uploaded_by_email === context!.email;

    if (uploaderMatches) {
      return NextResponse.json(
        { error: 'Separation of duties violation: You cannot approve your own proof' },
        { status: 403 }
      );
    }

    // Update proof approval status
    const updateData: any = {
      approval_status: action === 'approve' ? 'approved' : 'rejected',
      approved_by: context!.user_id,
      approved_by_email: context!.email,
      approved_at: new Date().toISOString(),
    };

    if (action === 'reject') {
      updateData.rejection_reason = rejection_reason;
    }

    const { error: updateError } = await supabase
      .from('unit_proofs')
      .update(updateData)
      .eq('id', params.proofId);

    if (updateError) throw updateError;

    // The trigger will automatically recompute unit status and log to status_events

    return NextResponse.json({
      success: true,
      message: `Proof ${action}d successfully`,
      approval_status: updateData.approval_status,
    });
  } catch (error: any) {
    console.error('Error approving proof:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to approve proof' },
      { status: 500 }
    );
  }
}
