'use client';

import { useEffect, useState, useRef } from 'react';
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
  Pause,
  FileText,
  Hash,
  CalendarClock,
  BookCheck,
  AlertTriangle,
  History,
  AlertOctagon,
  MessageSquare,
  Mic,
  Square,
  Trash2,
  Pencil,
  Volume2,
} from 'lucide-react';
import { format, formatDistanceToNow, isPast, differenceInDays } from 'date-fns';
import { supabase } from '@/lib/firebase';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { NotificationBell } from '@/components/notification-bell';
import { useLocale } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/language-switcher';

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
  // New fields
  file_name?: string;
  file_hash?: string;
  document_category?: string;
  reference_number?: string;
  expiry_date?: string;
  notes?: string;
  is_expired?: boolean;
  mime_type?: string;
  file_size?: number;
  is_superseded?: boolean;
}

interface AuditEvent {
  id: string;
  event_type: string;
  old_status?: string;
  new_status?: string;
  triggered_by_role?: string;
  reason?: string;
  created_at: string;
  metadata?: Record<string, any>;
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
  // New config fields
  requires_reviewer_approval?: boolean;
  requires_reference_number?: boolean;
  requires_expiry_date?: boolean;
  // Management notes
  management_notes?: string;
  voice_note_signed_url?: string;
  last_voice_note_play?: { played_at: string; full_name: string } | null;
}

export default function UnitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const unitId = params.id as string;
  const permissions = usePermissions();
  const { t } = useLocale();

  const [unit, setUnit] = useState<Unit | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProof, setSelectedProof] = useState<Proof | null>(null);
  const [showZoomDialog, setShowZoomDialog] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showEscalationDialog, setShowEscalationDialog] = useState(false);
  const [escalationReason, setEscalationReason] = useState('');
  const [escalating, setEscalating] = useState(false);

  // Notes from Management — view/edit
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  // voice recorder (new recording while editing)
  const [isRecordingNote, setIsRecordingNote] = useState(false);
  const [audioBlobNote, setAudioBlobNote] = useState<Blob | null>(null);
  const [audioUrlNote, setAudioUrlNote] = useState<string | null>(null);
  const [recordingSecsNote, setRecordingSecsNote] = useState(0);
  const [isPlayingNewNote, setIsPlayingNewNote] = useState(false);
  const [playProgressNew, setPlayProgressNew] = useState(0);
  const mediaRecorderNoteRef = useRef<MediaRecorder | null>(null);
  const chunksNoteRef = useRef<BlobPart[]>([]);
  const timerNoteRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const newAudioRef = useRef<HTMLAudioElement | null>(null);
  // playback of existing saved voice note
  const [isPlayingExisting, setIsPlayingExisting] = useState(false);
  const [playProgressExisting, setPlayProgressExisting] = useState(0);
  const existingAudioRef = useRef<HTMLAudioElement | null>(null);
  // play-tracking: log once per page load, not on every tap
  const hasLoggedPlayRef = useRef(false);

  useEffect(() => {
    if (unitId) {
      fetchUnit();
      fetchAuditEvents();
    }
  }, [unitId]);

  async function fetchUnit() {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Not authenticated. Please log in again.');
      const token = session.access_token;

      const response = await fetch(`/api/units/${unitId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch unit');

      const data = await response.json();
      setUnit(data);
      setNotesText(data.management_notes ?? '');
    } catch (error) {
      console.error('Error fetching unit:', error);
      toast.error(t('units.unitNotFound'));
    } finally {
      setLoading(false);
    }
  }

  async function fetchAuditEvents() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('unit_status_events')
        .select('*')
        .eq('unit_id', unitId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setAuditEvents(data);
      }
    } catch {
      // Audit trail is non-critical — silently fail
    }
  }

  async function handleApprovalAction() {
    if (!selectedProof) return;
    if (approvalAction === 'reject' && !rejectionReason.trim()) {
      toast.error(t('workstream.errorNoReason'));
      return;
    }

    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/units/${unitId}/proofs/${selectedProof.id}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: approvalAction,
          rejection_reason: approvalAction === 'reject' ? rejectionReason : null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Failed to ${approvalAction} proof`);

      toast.success(approvalAction === 'approve' ? t('units.confirmApproval') : t('units.confirmRejection'));
      setShowApprovalDialog(false);
      setSelectedProof(null);
      setRejectionReason('');
      await fetchUnit();
      await fetchAuditEvents();
    } catch (error: any) {
      console.error(`Error ${approvalAction}ing proof:`, error);
      toast.error(error.message || t('units.cancelButton'));
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

  async function handleEscalate() {
    if (!escalationReason.trim()) {
      toast.error(t('workstream.errorNoReason'));
      return;
    }
    setEscalating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const response = await fetch(`/api/units/${unitId}/escalate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: escalationReason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to escalate unit');
      toast.success(t('workstream.successEscalation', { count: data.notifications_sent }));
      setShowEscalationDialog(false);
      setEscalationReason('');
      await fetchAuditEvents();
    } catch (error: any) {
      toast.error(error.message || 'Failed to escalate unit');
    } finally {
      setEscalating(false);
    }
  }

  // Voice recorder helpers for notes editing
  async function startRecordingNote() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksNoteRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksNoteRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksNoteRef.current, { type: 'audio/webm' });
        setAudioBlobNote(blob);
        setAudioUrlNote(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderNoteRef.current = recorder;
      setIsRecordingNote(true);
      setRecordingSecsNote(0);
      timerNoteRef.current = setInterval(() => setRecordingSecsNote((s) => s + 1), 1000);
    } catch {
      toast.error('Microphone access denied.');
    }
  }

  function stopRecordingNote() {
    mediaRecorderNoteRef.current?.stop();
    setIsRecordingNote(false);
    if (timerNoteRef.current) clearInterval(timerNoteRef.current);
  }

  function deleteNewRecording() {
    if (audioUrlNote) URL.revokeObjectURL(audioUrlNote);
    setAudioBlobNote(null);
    setAudioUrlNote(null);
    setRecordingSecsNote(0);
    setIsPlayingNewNote(false);
    setPlayProgressNew(0);
  }

  function formatSecs(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      let voiceNotePath: string | null = (unit as any).voice_note_url ?? null;

      // Upload new recording if one was made
      if (audioBlobNote) {
        try {
          const filename = `${unit!.workstream_id}/${Date.now()}.webm`;
          const { error: uploadErr } = await supabase.storage
            .from('voice-notes')
            .upload(filename, audioBlobNote, { contentType: 'audio/webm' });
          if (uploadErr) throw uploadErr;
          const { data: urlData } = supabase.storage.from('voice-notes').getPublicUrl(filename);
          voiceNotePath = urlData.publicUrl;
        } catch {
          toast.warning('Voice note upload failed — saving text notes only.');
        }
      }

      const patchRes = await fetch(`/api/units/${unitId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          management_notes: notesText || null,
          voice_note_url: voiceNotePath,
        }),
      });

      if (!patchRes.ok) throw new Error((await patchRes.json()).error || 'Save failed');

      toast.success('Notes saved');
      setEditingNotes(false);
      deleteNewRecording();
      await fetchUnit(); // reload to get fresh signed URLs
    } catch (err: any) {
      toast.error(err.message || 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  }

  const canApproveProofs =
    permissions.isPlatformAdmin ||
    permissions.role === 'PROGRAM_OWNER' ||
    permissions.role === 'WORKSTREAM_LEAD';

  const canEditNotes =
    permissions.isPlatformAdmin ||
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
          <p className="text-white">{t('units.unitNotFound')}</p>
        </div>
      </div>
    );
  }

  const isGreen = unit.computed_status === 'GREEN';
  const isPastDeadline = unit.required_green_by && new Date(unit.required_green_by) < new Date();
  const approvedCount = unit.proofs.filter(p => p.approval_status === 'approved' && !p.is_superseded).length;
  const pendingCount = unit.proofs.filter(p => p.approval_status === 'pending').length;

  function getExpiryBadge(proof: Proof) {
    if (!proof.expiry_date) return null;
    if (proof.is_expired) {
      return <Badge className="bg-red-600 text-white text-xs">EXPIRED</Badge>;
    }
    const daysLeft = differenceInDays(new Date(proof.expiry_date), new Date());
    if (daysLeft <= 30) {
      return (
        <Badge className="bg-orange-500/80 text-white text-xs">
          Expires in {daysLeft}d
        </Badge>
      );
    }
    return null;
  }

  function getAuditEventLabel(event: AuditEvent) {
    const labels: Record<string, string> = {
      proof_approved: 'Proof Approved',
      proof_rejected: 'Proof Rejected',
      proof_expired: 'Proof Expired',
      status_computed: 'Status Recomputed',
      blocked: 'Unit Blocked',
      unblocked: 'Unit Unblocked',
      manual_escalation: 'Manual Escalation',
      unit_confirmed: 'Unit Confirmed',
      unit_archived: 'Unit Archived',
    };
    return labels[event.event_type] || event.event_type;
  }

  function getAuditEventColor(event: AuditEvent) {
    if (event.event_type === 'proof_approved' || event.new_status === 'GREEN') return 'text-green-400';
    if (event.event_type === 'proof_rejected' || event.event_type === 'proof_expired') return 'text-red-400';
    if (event.event_type === 'manual_escalation') return 'text-orange-400';
    return 'text-gray-400';
  }

  function ProofCardMedia({ proof }: { proof: Proof }) {
    if (proof.type === 'photo') {
      return (
        <img
          src={proof.url}
          alt="Proof"
          className="w-full h-full object-contain"
        />
      );
    }
    if (proof.type === 'video') {
      return (
        <div className="relative w-full h-full">
          <video src={proof.url} className="w-full h-full object-contain" preload="metadata" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="bg-white/90 rounded-full p-4">
              <Play className="w-8 h-8 text-black fill-black" />
            </div>
          </div>
        </div>
      );
    }
    // Document type
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
        <FileText className="w-12 h-12 text-blue-400" />
        <span className="text-gray-400 text-xs text-center truncate w-full px-2">
          {proof.file_name || 'Document'}
        </span>
        <a
          href={proof.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-blue-400 hover:text-blue-300 text-xs underline"
        >
          {t('units.openDocument')}
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-3 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            onClick={() => router.back()}
            variant="outline"
            className="bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40 shrink-0"
          >
            <ArrowLeft className="w-4 h-4 me-2" />
            {t('units.back')}
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-3xl font-black text-white truncate">{unit.title}</h1>
            <p className="text-gray-500 text-sm">{t('units.owner')} {unit.owner_party_name}</p>
          </div>
          <LanguageSwitcher />
          <NotificationBell />
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
            <CardTitle className="text-white">{t('units.unitInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {unit.required_green_by && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className={isPastDeadline ? 'text-red-400 font-bold' : 'text-gray-300'}>
                  {t('units.requiredGreenBy')} {format(new Date(unit.required_green_by), 'MMM d, yyyy HH:mm')}
                  {isPastDeadline && ` ${t('units.overdue')}`}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm text-gray-400">{t('units.proofRequirements')}</p>
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <span className="text-white">
                  <strong>{approvedCount}</strong> / {unit.proof_requirements?.required_count || 1} {t('units.approvedProofs')}
                </span>
                {unit.proof_requirements?.required_types?.length > 0 && (
                  <span className="text-gray-400">
                    {t('units.requiredTypes')} {unit.proof_requirements.required_types.join(', ')}
                  </span>
                )}
              </div>

              {/* Enhanced proof configuration indicators */}
              <div className="flex flex-wrap gap-2 mt-2">
                {unit.requires_reviewer_approval !== false && (
                  <Badge className="bg-blue-900/40 text-blue-300 border border-blue-700/50 text-xs">
                    <BookCheck className="w-3 h-3 me-1" />
                    {t('units.reviewerApproval')}
                  </Badge>
                )}
                {unit.requires_reference_number && (
                  <Badge className="bg-purple-900/40 text-purple-300 border border-purple-700/50 text-xs">
                    <Hash className="w-3 h-3 me-1" />
                    {t('units.referenceRequired')}
                  </Badge>
                )}
                {unit.requires_expiry_date && (
                  <Badge className="bg-orange-900/40 text-orange-300 border border-orange-700/50 text-xs">
                    <CalendarClock className="w-3 h-3 me-1" />
                    {t('units.expiryRequired')}
                  </Badge>
                )}
              </div>

              {pendingCount > 0 && (
                <p className="text-sm text-yellow-400">
                  <AlertCircle className="w-4 h-4 inline me-1" />
                  {pendingCount} {pendingCount > 1 ? t('units.pendingApprovalPlural') : t('units.pendingApproval')}
                </p>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => router.push(`/units/${unitId}/upload?type=photo`)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Upload className="w-4 h-4 me-2" />
                {t('units.uploadPhoto')}
              </Button>
              <Button
                onClick={() => router.push(`/units/${unitId}/upload?type=document`)}
                variant="outline"
                className="bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40"
              >
                <FileText className="w-4 h-4 me-2" />
                {t('units.uploadDocument')}
              </Button>
              {canApproveProofs && !isGreen && (
                <Button
                  onClick={() => setShowEscalationDialog(true)}
                  variant="outline"
                  className="bg-[#db6d28]/10 border-[#db6d28]/40 text-[#db6d28] hover:bg-[#db6d28]/20"
                >
                  <AlertOctagon className="w-4 h-4 me-2" />
                  {t('units.escalate')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notes from Management */}
        {(unit.management_notes || unit.voice_note_signed_url || canEditNotes) && (
          <Card className="bg-black/25 border-gray-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                  Notes from Management
                </CardTitle>
                {canEditNotes && !editingNotes && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingNotes(true)}
                    className="bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                    {unit.management_notes || unit.voice_note_signed_url ? 'Edit' : 'Add Notes'}
                  </Button>
                )}
              </div>
              {!editingNotes && (
                <CardDescription className="text-gray-500">
                  Requirements, acceptance criteria and guidelines from your workstream lead.
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">

              {/* View mode */}
              {!editingNotes && (
                <div className="space-y-3">
                  {/* Prominent voice note bubble */}
                  {unit.voice_note_signed_url && (
                    <div>
                      <audio
                        ref={existingAudioRef}
                        src={unit.voice_note_signed_url}
                        onEnded={() => { setIsPlayingExisting(false); setPlayProgressExisting(0); }}
                        onTimeUpdate={() => {
                          const a = existingAudioRef.current;
                          if (a && a.duration) setPlayProgressExisting(a.currentTime / a.duration);
                        }}
                        className="hidden"
                      />
                      <button
                        onClick={async () => {
                          if (!existingAudioRef.current) return;
                          if (isPlayingExisting) {
                            existingAudioRef.current.pause();
                            setIsPlayingExisting(false);
                          } else {
                            existingAudioRef.current.play();
                            setIsPlayingExisting(true);
                            // Log play once per page load — fire & forget
                            if (!hasLoggedPlayRef.current) {
                              hasLoggedPlayRef.current = true;
                              try {
                                const { data: { session } } = await supabase.auth.getSession();
                                if (session) {
                                  fetch(`/api/units/${unitId}/voice-note-play`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${session.access_token}` },
                                  }).catch(() => {});
                                }
                              } catch {}
                            }
                          }
                        }}
                        className="w-full text-left bg-blue-600/20 hover:bg-blue-600/28 border border-blue-500/40 rounded-2xl rounded-tl-sm p-4 transition-colors group"
                      >
                        <div className="flex items-center gap-4">
                          {/* Large play button */}
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 shadow-lg transition-colors ${isPlayingExisting ? 'bg-blue-400' : 'bg-blue-500 group-hover:bg-blue-400'}`}>
                            {isPlayingExisting
                              ? <Pause className="w-6 h-6 text-white" />
                              : <Play className="w-6 h-6 text-white fill-white ml-1" />}
                          </div>
                          {/* Waveform bars */}
                          <div className="flex items-center gap-[2px] flex-1 h-10">
                            {[35,55,70,45,80,60,75,40,85,65,50,90,45,70,55,80,35,65,75,50,40,85,60,45,70,55,80,40].map((h, i, arr) => (
                              <div
                                key={i}
                                className="w-[2px] rounded-[1px] shrink-0 transition-colors duration-75"
                                style={{
                                  height: `${h}%`,
                                  backgroundColor: i / arr.length <= playProgressExisting
                                    ? 'rgb(147 197 253)'
                                    : isPlayingExisting ? 'rgba(147,197,253,0.45)' : 'rgba(147,197,253,0.5)',
                                }}
                              />
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-blue-300/80 mt-3 flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5" />
                          {isPlayingExisting ? 'Playing...' : 'Tap to listen — voice note from management'}
                        </p>
                      </button>
                    </div>
                  )}

                  {/* "Heard by" receipt — shown below the voice bubble */}
                  {unit.voice_note_signed_url && unit.last_voice_note_play && (
                    <p className="text-xs text-gray-600 flex items-center gap-1 px-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500/70 shrink-0" />
                      Last heard by <span className="text-gray-500 font-medium">{unit.last_voice_note_play.full_name}</span>
                      &nbsp;·&nbsp;{new Date(unit.last_voice_note_play.played_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}

                  {/* Text note bubble */}
                  {unit.management_notes && (
                    <div className="bg-gray-800/60 border border-gray-700/40 rounded-2xl rounded-tl-sm px-4 py-3">
                      <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">
                        {unit.management_notes}
                      </p>
                    </div>
                  )}

                  {/* No instructions — soft amber nudge visible to everyone */}
                  {!unit.voice_note_signed_url && !unit.management_notes && (
                    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20">
                      <span className="text-amber-400 mt-0.5 shrink-0 text-base leading-none">⚠</span>
                      <div>
                        <p className="text-amber-300/80 text-sm font-medium">No management instructions recorded</p>
                        <p className="text-amber-400/50 text-xs mt-0.5">Field team will proceed without a briefing on this unit.</p>
                      </div>
                    </div>
                  )}

                  {/* Edit prompt for leads only */}
                  {!unit.voice_note_signed_url && !unit.management_notes && canEditNotes && (
                    <p className="text-gray-600 text-xs italic px-1">Click Edit above to add a voice note or written instructions.</p>
                  )}
                </div>
              )}

              {/* Edit mode — chat-style composer */}
              {editingNotes && (
                <div className="space-y-4">
                  <div className="bg-black/30 border border-gray-700 rounded-xl overflow-hidden">

                    {/* Preview bubbles */}
                    {(audioUrlNote || unit.voice_note_signed_url || notesText) && (
                      <div className="px-4 pt-4 pb-1 space-y-2">
                        {/* New recording preview (replaces existing) */}
                        {audioUrlNote && (
                          <div className="flex items-center gap-3 bg-blue-600/20 border border-blue-500/30 rounded-2xl rounded-tl-sm px-4 py-3">
                            <audio
                              ref={newAudioRef}
                              src={audioUrlNote}
                              onEnded={() => { setIsPlayingNewNote(false); setPlayProgressNew(0); }}
                              onTimeUpdate={() => {
                                const a = newAudioRef.current;
                                if (a && a.duration) setPlayProgressNew(a.currentTime / a.duration);
                              }}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (!newAudioRef.current) return;
                                if (isPlayingNewNote) { newAudioRef.current.pause(); setIsPlayingNewNote(false); }
                                else { newAudioRef.current.play(); setIsPlayingNewNote(true); }
                              }}
                              className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center shrink-0 hover:bg-blue-400 transition-colors"
                            >
                              {isPlayingNewNote ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white fill-white ml-0.5" />}
                            </button>
                            <div className="flex items-center gap-[2px] flex-1 h-7">
                              {[35,55,70,45,80,60,75,40,85,65,50,90,45,70,55,80,35,65,75,50,40,85,60,45].map((h, i, arr) => (
                                <div
                                  key={i}
                                  className="w-[2px] rounded-[1px] shrink-0 transition-colors duration-75"
                                  style={{
                                    height: `${h}%`,
                                    backgroundColor: i / arr.length <= playProgressNew ? 'rgb(147 197 253)' : 'rgba(147,197,253,0.35)',
                                  }}
                                />
                              ))}
                            </div>
                            <button type="button" onClick={deleteNewRecording} className="text-gray-500 hover:text-red-400 transition-colors ml-1">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        {/* Existing voice note (when no new recording yet) */}
                        {!audioUrlNote && unit.voice_note_signed_url && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-600/10 border border-green-500/25">
                            <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                            <span className="text-green-400 text-sm">Existing voice note saved</span>
                          </div>
                        )}
                        {notesText && (
                          <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl rounded-tl-sm px-4 py-3">
                            <p className="text-gray-200 text-sm whitespace-pre-wrap">{notesText}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Input area */}
                    <div className="px-4 pb-4 pt-2 space-y-3">
                      {/* Idle mic */}
                      {!isRecordingNote && !audioUrlNote && (
                        <button
                          type="button"
                          onClick={startRecordingNote}
                          className="w-full flex flex-col items-center gap-2 py-5 rounded-xl bg-blue-600/10 border border-blue-500/25 border-dashed hover:bg-blue-600/18 hover:border-blue-500/45 transition-all group"
                        >
                          <div className="w-14 h-14 rounded-full bg-blue-600/20 border-2 border-blue-500/50 flex items-center justify-center group-hover:bg-blue-600/30 transition-colors">
                            <Mic className="w-6 h-6 text-blue-400" />
                          </div>
                          <span className="text-blue-400 text-sm font-medium">
                            {unit.voice_note_signed_url ? 'Tap to record new voice note' : 'Tap to record voice note'}
                          </span>
                        </button>
                      )}

                      {/* Active recording */}
                      {isRecordingNote && (
                        <div className="flex flex-col items-center gap-3 py-3">
                          <div className="relative flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full bg-red-500/20 animate-ping absolute" />
                            <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center relative z-10">
                              <Mic className="w-7 h-7 text-white" />
                            </div>
                          </div>
                          <span className="text-red-400 font-mono text-xl tabular-nums">{formatSecs(recordingSecsNote)}</span>
                          <button
                            type="button"
                            onClick={stopRecordingNote}
                            className="flex items-center gap-2 px-5 py-2 rounded-full bg-red-600/20 border border-red-500/40 text-red-400 hover:bg-red-600/30 transition-colors text-sm font-medium"
                          >
                            <Square className="w-3.5 h-3.5 fill-current" /> Stop recording
                          </button>
                        </div>
                      )}

                      {/* Re-record */}
                      {audioUrlNote && !isRecordingNote && (
                        <button type="button" onClick={deleteNewRecording} className="w-full flex items-center justify-center gap-1.5 py-1 text-gray-600 hover:text-gray-400 text-xs transition-colors">
                          <Mic className="w-3 h-3" /> Re-record
                        </button>
                      )}

                      {/* Divider */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-gray-700/60" />
                        <span className="text-xs text-gray-600">written note</span>
                        <div className="flex-1 h-px bg-gray-700/60" />
                      </div>

                      {/* Text input */}
                      <Textarea
                        value={notesText}
                        onChange={(e) => setNotesText(e.target.value)}
                        placeholder="Type a written note for the field team..."
                        className="bg-transparent border-0 border-b border-gray-700/60 rounded-none text-white text-sm resize-none focus-visible:ring-0 focus-visible:border-blue-500/50 px-0 min-h-[56px] placeholder:text-gray-600"
                      />
                    </div>
                  </div>

                  {/* Save / Cancel */}
                  <div className="flex gap-2">
                    <Button onClick={saveNotes} disabled={savingNotes} className="bg-blue-600 hover:bg-blue-700 text-white">
                      {savingNotes ? 'Saving...' : 'Save Notes'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => { setEditingNotes(false); setNotesText(unit.management_notes ?? ''); deleteNewRecording(); }}
                      disabled={savingNotes}
                      className="bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Proofs Grid */}
        <Card className="bg-black/25 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">{t('units.proofsCount', { count: unit.proofs.length })}</CardTitle>
            <CardDescription className="text-gray-400">
              {t('units.proofsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {unit.proofs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('units.noProofs')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {unit.proofs.map((proof) => (
                  <Card
                    key={proof.id}
                    className={`bg-black/40 border-gray-700 ${
                      proof.is_superseded
                        ? 'opacity-50 border-gray-600'
                        : proof.is_expired
                        ? 'border-red-800'
                        : proof.approval_status === 'approved'
                        ? 'border-green-500/50'
                        : proof.approval_status === 'rejected'
                        ? 'border-red-500/50'
                        : 'border-yellow-500/50'
                    }`}
                  >
                    <CardContent className="p-4 space-y-3">
                      {/* Proof Media / Document Preview */}
                      <div
                        onClick={() => proof.type !== 'document' && openZoomDialog(proof)}
                        className={`relative aspect-video bg-gray-900 rounded overflow-hidden ${
                          proof.type !== 'document' ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
                        }`}
                      >
                        <ProofCardMedia proof={proof} />

                        {/* Status Badge Overlay */}
                        <Badge
                          className={`absolute top-2 right-2 ${
                            proof.is_expired
                              ? 'bg-red-800 text-white'
                              : proof.approval_status === 'approved'
                              ? 'bg-green-600 text-white'
                              : proof.approval_status === 'rejected'
                              ? 'bg-red-600 text-white'
                              : 'bg-yellow-600 text-black'
                          }`}
                        >
                          {proof.is_expired ? 'EXPIRED' : proof.approval_status}
                        </Badge>

                        {/* Superseded overlay */}
                        {proof.is_superseded && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="text-gray-400 text-xs font-medium bg-black/70 px-2 py-1 rounded">
                              {t('units.superseded')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Proof Type Badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-gray-800 text-gray-300 border-gray-700 text-xs capitalize">
                          {proof.type === 'photo' && <ImageIcon className="w-3 h-3 mr-1" />}
                          {proof.type === 'video' && <Video className="w-3 h-3 mr-1" />}
                          {proof.type === 'document' && <FileText className="w-3 h-3 mr-1" />}
                          {proof.type}
                        </Badge>
                        {getExpiryBadge(proof)}
                      </div>

                      {/* Proof Metadata */}
                      <div className="space-y-1 text-xs text-gray-400">
                        <p>{t('units.uploaded')} {format(new Date(proof.uploaded_at), 'MMM d, yyyy HH:mm')}</p>
                        <p>{t('units.by')} {proof.uploaded_by_email || proof.uploaded_by}</p>

                        {proof.captured_at && proof.type !== 'document' && (
                          <p>{t('units.captured')} {format(new Date(proof.captured_at), 'MMM d, yyyy HH:mm:ss')}</p>
                        )}

                        {/* Document category badge */}
                        {proof.document_category && (
                          <p className="flex items-center gap-1">
                            <FileText className="w-3 h-3 text-blue-400" />
                            <span className="text-blue-300 font-medium capitalize">
                              {proof.document_category.replace(/_/g, ' ')}
                            </span>
                          </p>
                        )}

                        {/* Governance structured fields */}
                        {proof.reference_number && (
                          <p className="flex items-center gap-1">
                            <Hash className="w-3 h-3 text-purple-400" />
                            <span className="text-purple-300">{t('units.reference')} {proof.reference_number}</span>
                          </p>
                        )}

                        {proof.expiry_date && (
                          <p className={`flex items-center gap-1 ${proof.is_expired ? 'text-red-400' : differenceInDays(new Date(proof.expiry_date), new Date()) <= 30 ? 'text-orange-400' : 'text-gray-400'}`}>
                            <CalendarClock className="w-3 h-3" />
                            {t('units.expires')} {format(new Date(proof.expiry_date), 'MMM d, yyyy')}
                          </p>
                        )}

                        {/* File integrity hash */}
                        {proof.file_hash && (
                          <p className="flex items-center gap-1 font-mono">
                            <span className="text-gray-600">SHA:</span>
                            <span className="text-gray-500">{proof.file_hash.slice(0, 12)}…</span>
                          </p>
                        )}

                        {/* Approval info */}
                        {proof.approval_status === 'approved' && proof.approved_at && (
                          <p className="text-green-400">
                            {t('units.approvedLabel')} {format(new Date(proof.approved_at), 'MMM d, yyyy HH:mm')}
                            {proof.approved_by_email && ` by ${proof.approved_by_email}`}
                          </p>
                        )}
                        {proof.approval_status === 'rejected' && proof.approved_by_email && (
                          <p className="text-red-400">
                            {t('units.rejectedBy')} {proof.approved_by_email}
                            {proof.approved_at && ` on ${format(new Date(proof.approved_at), 'MMM d, yyyy HH:mm')}`}
                          </p>
                        )}
                        {proof.approval_status === 'rejected' && proof.rejection_reason && (
                          <p className="text-red-400">{t('units.reason')} {proof.rejection_reason}</p>
                        )}

                        {/* Notes */}
                        {proof.notes && (
                          <p className="text-gray-400 italic">"{proof.notes}"</p>
                        )}

                        {proof.validation_notes && (
                          <p className="text-gray-400">{t('units.notes')} {proof.validation_notes}</p>
                        )}
                      </div>

                      {/* Approval Actions */}
                      {canApproveProofs && proof.approval_status === 'pending' && !proof.is_expired && (
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            onClick={() => openApprovalDialog(proof, 'approve')}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="w-4 h-4 me-1" />
                            {t('units.approve')}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => openApprovalDialog(proof, 'reject')}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                          >
                            <XCircle className="w-4 h-4 me-1" />
                            {t('units.reject')}
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

        {/* Audit Trail */}
        {auditEvents.length > 0 && (
          <Card className="bg-black/25 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <History className="w-5 h-5 text-gray-400" />
                {t('units.auditTrail')}
              </CardTitle>
              <CardDescription className="text-gray-400">
                {t('units.auditDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {auditEvents.map((event) => (
                  <div key={event.id} className="flex gap-3 text-sm">
                    <div className="flex flex-col items-center">
                      <div className={`w-2 h-2 rounded-full mt-1.5 ${
                        event.event_type === 'proof_approved' || event.new_status === 'GREEN'
                          ? 'bg-green-500'
                          : event.event_type === 'proof_rejected' || event.event_type === 'proof_expired'
                          ? 'bg-red-500'
                          : event.event_type === 'manual_escalation'
                          ? 'bg-orange-500'
                          : 'bg-gray-500'
                      }`} />
                      <div className="w-px flex-1 bg-gray-800 mt-1" />
                    </div>
                    <div className="flex-1 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className={`font-medium ${getAuditEventColor(event)}`}>
                            {getAuditEventLabel(event)}
                          </span>
                          {event.old_status && event.new_status && event.old_status !== event.new_status && (
                            <span className="text-gray-500 ml-2">
                              {event.old_status} → {event.new_status}
                            </span>
                          )}
                          {event.triggered_by_role && (
                            <span className="text-gray-600 ml-2 text-xs">({event.triggered_by_role})</span>
                          )}
                        </div>
                        <span className="text-gray-600 text-xs whitespace-nowrap">
                          {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      {event.reason && (
                        <p className="text-gray-500 text-xs mt-0.5">{event.reason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Zoom Dialog (photo/video only) */}
      <Dialog open={showZoomDialog} onOpenChange={setShowZoomDialog}>
        <DialogContent className="max-w-4xl bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">{t('units.proofDetail')}</DialogTitle>
          </DialogHeader>
          {selectedProof && (
            <div className="space-y-4">
              {selectedProof.type === 'photo' ? (
                <img src={selectedProof.url} alt="Proof full size" className="w-full rounded-lg" />
              ) : selectedProof.type === 'video' ? (
                <video src={selectedProof.url} controls autoPlay className="w-full rounded-lg" preload="auto" />
              ) : null}
              <div className="text-sm text-gray-400 space-y-1">
                <p>{t('units.status')} <Badge className={
                  selectedProof.approval_status === 'approved' ? 'bg-green-600' :
                  selectedProof.approval_status === 'rejected' ? 'bg-red-600' :
                  'bg-yellow-600 text-black'
                }>{selectedProof.approval_status}</Badge></p>
                {selectedProof.captured_at && (
                  <p>{t('units.captured')} {format(new Date(selectedProof.captured_at), 'MMM d, yyyy HH:mm:ss')}</p>
                )}
                <p>{t('units.uploaded')} {format(new Date(selectedProof.uploaded_at), 'MMM d, yyyy HH:mm')}</p>
                <p>{t('units.by')} {selectedProof.uploaded_by_email || selectedProof.uploaded_by}</p>
                {selectedProof.reference_number && (
                  <p>{t('units.reference')} {selectedProof.reference_number}</p>
                )}
                {selectedProof.expiry_date && (
                  <p>{t('units.expires')} {format(new Date(selectedProof.expiry_date), 'MMM d, yyyy')}</p>
                )}
                {selectedProof.file_hash && (
                  <p className="font-mono text-xs">SHA-256: {selectedProof.file_hash.slice(0, 32)}…</p>
                )}
                {selectedProof.notes && <p>{t('units.notes')} {selectedProof.notes}</p>}
                {selectedProof.validation_notes && <p>{t('units.validation')} {selectedProof.validation_notes}</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Escalation Dialog */}
      <Dialog open={showEscalationDialog} onOpenChange={setShowEscalationDialog}>
        <DialogContent className="bg-gray-950 border-gray-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">{t('units.escalationTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-[#db6d28]/10 border border-[#db6d28]/30 rounded p-3">
              <div className="flex items-start gap-2">
                <AlertOctagon className="w-5 h-5 text-[#db6d28] mt-0.5 shrink-0" />
                <p className="text-sm text-[#db6d28] font-medium">
                  {t('units.escalationWarning')}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit_escalation_reason" className="text-gray-300">
                {t('units.escalationReasonLabel')} <span className="text-red-400">*</span>
              </Label>
              <Textarea
                id="unit_escalation_reason"
                value={escalationReason}
                onChange={(e) => setEscalationReason(e.target.value)}
                placeholder={t('units.escalationPlaceholder')}
                className="bg-black/40 border-gray-700 text-white min-h-[120px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => { setShowEscalationDialog(false); setEscalationReason(''); }}
              className="bg-black/25 border-gray-700 text-gray-300"
            >
              {t('units.cancelButton')}
            </Button>
            <Button
              onClick={handleEscalate}
              disabled={!escalationReason.trim() || escalating}
              className="bg-[#db6d28]/80 hover:bg-[#db6d28] text-white"
            >
              {escalating ? t('units.escalatingButton') : t('units.escalateButton')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">
              {approvalAction === 'approve' ? t('units.approveProof') : t('units.rejectProof')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-400">
              {approvalAction === 'approve' ? t('units.approveConfirm') : t('units.rejectConfirm')}
            </p>

            {/* Show governance fields for reviewer awareness */}
            {selectedProof?.reference_number && (
              <div className="bg-gray-900 rounded p-3 text-sm">
                <p className="text-gray-400">{t('units.reference')} <span className="text-white">{selectedProof.reference_number}</span></p>
                {selectedProof.expiry_date && (
                  <p className="text-gray-400">{t('units.expires')} <span className="text-white">{format(new Date(selectedProof.expiry_date), 'MMM d, yyyy')}</span></p>
                )}
              </div>
            )}

            {approvalAction === 'reject' && (
              <div className="space-y-2">
                <Label htmlFor="rejection_reason" className="text-gray-300">
                  {t('units.rejectionReason')} <span className="text-red-400">*</span>
                </Label>
                <Textarea
                  id="rejection_reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder={t('units.rejectionPlaceholder')}
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
                {processing ? t('units.processing') : approvalAction === 'approve' ? t('units.confirmApproval') : t('units.confirmRejection')}
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
                {t('units.cancelButton')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
