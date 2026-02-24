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

    // TENANT SAFETY: Verify unit belongs to user's organization
    const { data: unitCheck } = await supabase
      .from('units')
      .select('workstreams!inner(programs!inner(org_id))')
      .eq('id', params.id)
      .single();

    if (!unitCheck) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    const unitOrgId = (unitCheck.workstreams as any)?.programs?.org_id;
    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    // Get the proof with unit details for notification
    const { data: proof, error: proofFetchError } = await supabase
      .from('unit_proofs')
      .select('*, units(id, title)')
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
      approved_by_email: context!.email,
      approved_at: new Date().toISOString(),
    };

    // Only set approved_by if approving (it's a UUID foreign key)
    if (action === 'approve') {
      updateData.approved_by = context!.user_id;
    }

    if (action === 'reject') {
      updateData.rejection_reason = rejection_reason;
    }

    const { error: updateError } = await supabase
      .from('unit_proofs')
      .update(updateData)
      .eq('id', params.proofId);

    if (updateError) throw updateError;

    // The trigger will automatically recompute unit status and log to status_events

    // Send notifications to the uploader (both in-app and email)
    if (proof.uploaded_by_email) {
      const unitTitle = (proof.units as any)?.title || 'Unknown Unit';
      const isApproved = action === 'approve';

      try {
        // Create in-app notification for the uploader
        if (proof.uploaded_by) {
          await supabase.from('in_app_notifications').insert([{
            user_id: proof.uploaded_by,
            title: isApproved ? 'Proof Approved' : 'Proof Rejected',
            message: isApproved
              ? `Your proof for "${unitTitle}" has been approved by ${context!.email}.`
              : `Your proof for "${unitTitle}" was rejected. Reason: ${rejection_reason}`,
            type: isApproved ? 'proof_approved' : 'proof_rejected',
            priority: isApproved ? 'normal' : 'high',
            related_unit_id: params.id,
            action_url: `/units/${params.id}`,
            metadata: {
              proof_id: params.proofId,
              reviewed_by: context!.email,
              rejection_reason: rejection_reason || null,
            },
          }]);
        }

        // Create email notification record
        await supabase.from('escalation_notifications').insert([{
          escalation_id: null,
          recipient_email: proof.uploaded_by_email,
          recipient_name: proof.uploaded_by_email.split('@')[0],
          channel: 'email',
          subject: isApproved
            ? `Proof Approved - "${unitTitle}"`
            : `Proof Rejected - "${unitTitle}"`,
          message: isApproved
            ? `Great news! Your proof submission for "${unitTitle}" has been approved by ${context!.email}.`
            : `Your proof submission for "${unitTitle}" was rejected.\n\nReason: ${rejection_reason}\n\nPlease submit a new proof addressing the feedback.`,
          template_data: {
            unit_title: unitTitle,
            action: action,
            reviewed_by: context!.email,
            rejection_reason: rejection_reason || null,
          },
          status: 'pending',
        }]);

        // Trigger Edge Function to send email (use service role key for internal calls)
        await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-escalation-emails`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
      } catch (emailError) {
        console.warn('Failed to send proof notification email:', emailError);
      }
    }

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
