'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Upload,
  Image as ImageIcon,
  AlertCircle,
  Video,
  Play,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { supabase } from '@/lib/firebase';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';

interface Proof {
  id: string;
  type: string;
  url: string;
  captured_at: string;
  uploaded_at: string;
  uploaded_by: string;
  uploaded_by_email: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  approved_by?: string;
  approved_by_email?: string;
  approved_at?: string;
  rejection_reason?: string;
  validation_notes?: string;
}

interface Unit {
  id: string;
  title: string;
  owner_party_name: string;
  required_green_by: string | null;
  proof_requirements: {
    required_count: number;
    required_types: string[];
  };
  computed_status: string;
  workstream_id: string;
  proofs: Proof[];
}

export default function UnitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const unitId = params.id as string;
  const permissions = usePermissions();

  const [unit, setUnit] = useState<Unit | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProof, setSelectedProof] = useState<Proof | null>(null);
  const [showZoomDialog, setShowZoomDialog] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (unitId) {
      fetchUnit();
    }
  }, [unitId]);

  async function fetchUnit() {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const token = session.access_token;

      const response = await fetch(`/api/units/${unitId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch unit');
      }

      const data = await response.json();
      setUnit(data);
    } catch (error) {
      console.error('Error fetching unit:', error);
      toast.error('Failed to load unit');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprovalAction() {
    if (!selectedProof) return;

    if (approvalAction === 'reject' && !rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/units/${unitId}/proofs/${selectedProof.id}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: approvalAction,
          rejection_reason: approvalAction === 'reject' ? rejectionReason : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${approvalAction} proof`);
      }

      toast.success(`Proof ${approvalAction}d successfully`);
      setShowApprovalDialog(false);
      setSelectedProof(null);
      setRejectionReason('');
      await fetchUnit(); // Refresh to show updated status
    } catch (error: any) {
      console.error(`Error ${approvalAction}ing proof:`, error);
      toast.error(error.message || `Failed to ${approvalAction} proof`);
    } finally {
      setProcessing(false);
    }
  }

  function openApprovalDialog(proof: Proof, action: 'approve' | 'reject') {
    setSelectedProof(proof);
    setApprovalAction(action);
    setShowApprovalDialog(true);
  }

  function openZoomDialog(proof: Proof) {
    setSelectedProof(proof);
    setShowZoomDialog(true);
  }

  const canApproveProofs = permissions.isPlatformAdmin ||
                           permissions.role === 'PROGRAM_OWNER' ||
                           permissions.role === 'WORKSTREAM_LEAD';

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64 bg-gray-800" />
          <Skeleton className="h-64 bg-gray-800" />
        </div>
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-white">Unit not found</p>
        </div>
      </div>
    );
  }

  const isGreen = unit.computed_status === 'GREEN';
  const isPastDeadline = unit.required_green_by && new Date(unit.required_green_by) < new Date();
  const approvedCount = unit.proofs.filter(p => p.approval_status === 'approved').length;
  const pendingCount = unit.proofs.filter(p => p.approval_status === 'pending').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            onClick={() => router.back()}
            variant="outline"
            className="bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-black text-white">{unit.title}</h1>
            <p className="text-gray-500">Owner: {unit.owner_party_name}</p>
          </div>
          <Badge
            className={`${
              isGreen
                ? 'bg-green-500/20 text-green-300 border-green-500/50'
                : 'bg-red-500/20 text-red-300 border-red-500/50'
            } border`}
          >
            {isGreen ? 'GREEN' : 'RED'}
          </Badge>
        </div>

        {/* Unit Info Card */}
        <Card className="bg-black/25 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Unit Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {unit.required_green_by && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className={isPastDeadline ? 'text-red-400 font-bold' : 'text-gray-300'}>
                  Required GREEN by: {format(new Date(unit.required_green_by), 'MMM d, yyyy HH:mm')}
                  {isPastDeadline && ' ⚠️ OVERDUE'}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm text-gray-400">Proof Requirements:</p>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-white">
                  <strong>{approvedCount}</strong> / {unit.proof_requirements.required_count} approved proofs
                </span>
                {unit.proof_requirements.required_types.length > 0 && (
                  <span className="text-gray-400">
                    Required types: {unit.proof_requirements.required_types.join(', ')}
                  </span>
                )}
              </div>
              {pendingCount > 0 && (
                <p className="text-sm text-yellow-400">
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  {pendingCount} proof{pendingCount > 1 ? 's' : ''} pending approval
                </p>
              )}
            </div>

            <Button
              onClick={() => router.push(`/units/${unitId}/upload`)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload New Proof
            </Button>
          </CardContent>
        </Card>

        {/* Proofs Grid */}
        <Card className="bg-black/25 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Proofs ({unit.proofs.length})</CardTitle>
            <CardDescription className="text-gray-400">
              Click on any proof to view full size
            </CardDescription>
          </CardHeader>
          <CardContent>
            {unit.proofs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No proofs uploaded yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {unit.proofs.map((proof) => (
                  <Card
                    key={proof.id}
                    className={`bg-black/40 border-gray-700 ${
                      proof.approval_status === 'approved'
                        ? 'border-green-500/50'
                        : proof.approval_status === 'rejected'
                        ? 'border-red-500/50'
                        : 'border-yellow-500/50'
                    }`}
                  >
                    <CardContent className="p-4 space-y-3">
                      {/* Proof Image/Video - Clickable */}
                      <div
                        onClick={() => openZoomDialog(proof)}
                        className="relative aspect-video bg-gray-900 rounded overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                      >
                        {proof.type === 'photo' ? (
                          <img
                            src={proof.url}
                            alt="Proof"
                            className="w-full h-full object-contain"
                          />
                        ) : proof.type === 'video' ? (
                          <div className="relative w-full h-full">
                            <video
                              src={proof.url}
                              className="w-full h-full object-contain"
                              preload="metadata"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <div className="bg-white/90 rounded-full p-4">
                                <Play className="w-8 h-8 text-black fill-black" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <ImageIcon className="w-12 h-12 text-gray-600" />
                          </div>
                        )}
                        {/* Status Badge Overlay */}
                        <Badge
                          className={`absolute top-2 right-2 ${
                            proof.approval_status === 'approved'
                              ? 'bg-green-600 text-white'
                              : proof.approval_status === 'rejected'
                              ? 'bg-red-600 text-white'
                              : 'bg-yellow-600 text-black'
                          }`}
                        >
                          {proof.approval_status}
                        </Badge>
                      </div>

                      {/* Proof Metadata */}
                      <div className="space-y-1 text-xs text-gray-400">
                        <p>
                          Uploaded: {format(new Date(proof.uploaded_at), 'MMM d, yyyy HH:mm')}
                        </p>
                        <p>By: {proof.uploaded_by_email || proof.uploaded_by}</p>
                        {proof.captured_at && (
                          <p>Captured: {format(new Date(proof.captured_at), 'MMM d, yyyy HH:mm:ss')}</p>
                        )}
                        {proof.approved_at && (
                          <p className="text-green-400">
                            Approved: {format(new Date(proof.approved_at), 'MMM d, yyyy HH:mm')}
                            {proof.approved_by_email && ` by ${proof.approved_by_email}`}
                          </p>
                        )}
                        {proof.rejection_reason && (
                          <p className="text-red-400">
                            Rejection reason: {proof.rejection_reason}
                          </p>
                        )}
                        {proof.validation_notes && (
                          <p className="text-gray-400">
                            Notes: {proof.validation_notes}
                          </p>
                        )}
                      </div>

                      {/* Approval Actions */}
                      {canApproveProofs && proof.approval_status === 'pending' && (
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            onClick={() => openApprovalDialog(proof, 'approve')}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => openApprovalDialog(proof, 'reject')}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Zoom Dialog */}
      <Dialog open={showZoomDialog} onOpenChange={setShowZoomDialog}>
        <DialogContent className="max-w-4xl bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">Proof Detail</DialogTitle>
          </DialogHeader>
          {selectedProof && (
            <div className="space-y-4">
              {selectedProof.type === 'photo' ? (
                <img
                  src={selectedProof.url}
                  alt="Proof full size"
                  className="w-full rounded-lg"
                />
              ) : selectedProof.type === 'video' ? (
                <video
                  src={selectedProof.url}
                  controls
                  autoPlay
                  className="w-full rounded-lg"
                  preload="auto"
                />
              ) : (
                <div className="flex items-center justify-center h-64 bg-gray-900 rounded-lg">
                  <ImageIcon className="w-16 h-16 text-gray-600" />
                </div>
              )}
              <div className="text-sm text-gray-400 space-y-1">
                <p>Status: <Badge className={
                  selectedProof.approval_status === 'approved' ? 'bg-green-600' :
                  selectedProof.approval_status === 'rejected' ? 'bg-red-600' :
                  'bg-yellow-600 text-black'
                }>{selectedProof.approval_status}</Badge></p>
                <p>Captured: {selectedProof.captured_at ? format(new Date(selectedProof.captured_at), 'MMM d, yyyy HH:mm:ss') : 'N/A'}</p>
                <p>Uploaded: {format(new Date(selectedProof.uploaded_at), 'MMM d, yyyy HH:mm')}</p>
                <p>By: {selectedProof.uploaded_by_email || selectedProof.uploaded_by}</p>
                {selectedProof.validation_notes && (
                  <p>Notes: {selectedProof.validation_notes}</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">
              {approvalAction === 'approve' ? 'Approve Proof' : 'Reject Proof'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-400">
              {approvalAction === 'approve'
                ? 'Are you sure you want to approve this proof? This will count toward the unit\'s GREEN status.'
                : 'Are you sure you want to reject this proof? Please provide a reason.'}
            </p>

            {approvalAction === 'reject' && (
              <div className="space-y-2">
                <Label htmlFor="rejection_reason" className="text-gray-300">
                  Rejection Reason <span className="text-red-400">*</span>
                </Label>
                <Textarea
                  id="rejection_reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this proof is being rejected..."
                  className="bg-black/40 border-gray-700 text-white"
                  rows={3}
                />
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleApprovalAction}
                disabled={processing}
                className={`flex-1 ${
                  approvalAction === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                } text-white`}
              >
                {processing ? 'Processing...' : `Confirm ${approvalAction === 'approve' ? 'Approval' : 'Rejection'}`}
              </Button>
              <Button
                onClick={() => {
                  setShowApprovalDialog(false);
                  setRejectionReason('');
                }}
                variant="outline"
                className="flex-1 bg-black/25 border-gray-700 text-gray-300"
                disabled={processing}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
