'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UnitWithProofs, WorkstreamWithMetrics } from '@/lib/types';
import {
  AlertTriangle, CheckCircle2, Clock, Camera, ChevronLeft,
  FileText, Video, Image as ImageIcon, Plus, Mic, Paperclip, AlertOctagon,
} from 'lucide-react';
import { format, formatDistanceToNow, isValid } from 'date-fns';
import { supabase } from '@/lib/firebase';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { getWorkstreamTypeLabel } from '@/lib/workstream-types';
import { NotificationBell } from '@/components/notification-bell';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useLocale } from '@/lib/i18n/context';

function leadUrgencyScore(u: UnitWithProofs): number {
  const isRed = u.computed_status === 'RED' || u.computed_status === 'BLOCKED';
  const isEscalated = (u.current_escalation_level ?? 0) > 0;
  const hasPendingProofs = (u.proofs ?? []).some(p => p.approval_status === 'pending');
  if (isRed && isEscalated) return 4;
  if (isRed && hasPendingProofs) return 3;
  if (isRed) return 2;
  return 1;
}

function fieldUrgencyScore(u: UnitWithProofs): number {
  const uploaded = u.proof_count || 0;
  const isEscalated = (u.current_escalation_level ?? 0) > 0;
  const isGreen = u.computed_status === 'GREEN';
  if (uploaded === 0 && isEscalated) return 4;
  if (uploaded === 0) return 3;
  if (!isGreen) return 2;
  return 1;
}

export default function WorkstreamBoard() {
  const params = useParams();
  const router = useRouter();
  const permissions = usePermissions();
  const { t } = useLocale();

  const workstreamId = params?.id as string | undefined;

  const [workstream, setWorkstream] = useState<WorkstreamWithMetrics | null>(null);
  const [units, setUnits] = useState<UnitWithProofs[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (workstreamId) {
      fetchWorkstream(workstreamId);
      fetchUnits(workstreamId);
    }
  }, [workstreamId]);

  async function fetchWorkstream(id: string) {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Not authenticated. Please log in again.');
      const token = session.access_token;
      const response = await fetch(`/api/workstreams/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) throw new Error('Failed to fetch workstream');
      const data = await response.json();
      setWorkstream(data);
    } catch (error) {
      console.error('Error fetching workstream:', error);
      toast.error('Failed to load workstream');
    }
  }

  async function fetchUnits(id: string) {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Not authenticated. Please log in again.');
      const token = session.access_token;
      const response = await fetch(`/api/units?workstream_id=${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) throw new Error('Failed to fetch units');
      const data = await response.json();
      if (Array.isArray(data)) setUnits(data);
      else { console.error('Expected array but got:', data); setUnits([]); }
    } catch (error) {
      console.error('Error fetching units:', error);
      toast.error('Failed to load units');
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }

  function ProofTypeIcon({ type }: { type: string }) {
    switch (type) {
      case 'photo': return <ImageIcon className="w-3 h-3" />;
      case 'video': return <Video className="w-3 h-3" />;
      case 'document': return <FileText className="w-3 h-3" />;
      default: return <Camera className="w-3 h-3" />;
    }
  }

  function UnitRow({ unit, isFieldView }: { unit: UnitWithProofs; isFieldView: boolean }) {
    const isGreen = unit.computed_status === 'GREEN';
    const isBlocked = unit.computed_status === 'BLOCKED';
    const isUnconfirmed = unit.is_confirmed === false;
    const isEscalated = (unit.current_escalation_level ?? 0) > 0;
    const deadlineDate = unit.required_green_by ? new Date(unit.required_green_by) : null;
    const validDeadline = deadlineDate && isValid(deadlineDate) ? deadlineDate : null;
    const isPastDeadline = validDeadline && validDeadline < new Date();
    const requiredCount = unit.proof_requirements?.required_count || 1;
    const requiredTypes = unit.proof_requirements?.required_types || ['photo'];
    const allProofsUploaded = unit.proof_count >= requiredCount;
    const briefingAttachments = ((unit as any).briefing_attachments || []) as Array<{ id: string; url: string; name: string; mime_type: string }>;
    const managementNotes = (unit as any).management_notes as string | null;
    const voiceNoteUrl = (unit as any).voice_note_url as string | null;

    const leftBorderColor = isBlocked
      ? 'border-l-yellow-500'
      : isEscalated
      ? 'border-l-orange-500'
      : isGreen
      ? 'border-l-[#238636]'
      : 'border-l-red-500';

    const statusBadgeStyle = isBlocked
      ? 'border-yellow-600 bg-yellow-900/40 text-yellow-400'
      : isGreen
      ? 'border-[#238636]/50 bg-[#238636]/15 text-[#3fb950]'
      : 'border-red-600 bg-red-900/50 text-red-300';

    return (
      <Card
        className={`border-[#30363d] border-l-4 ${leftBorderColor} ${isEscalated ? 'bg-orange-950/20' : 'bg-[#161b22]'} transition-all cursor-pointer hover:bg-[#1c2128] ${isUnconfirmed ? 'opacity-75' : ''}`}
        onClick={() => router.push(`/units/${unit.id}`)}
      >
        <CardContent className="p-4 space-y-3">
          {/* Status + Escalation + Title row */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col gap-1 shrink-0">
              <Badge className={`${statusBadgeStyle} font-bold text-sm px-3 py-1.5 flex items-center gap-1.5`}>
                {isGreen ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {unit.computed_status}
              </Badge>
              {isEscalated && (
                <Badge className="border-[#db6d28]/60 bg-[#db6d28]/15 text-[#db6d28] text-xs px-2 py-1 flex items-center gap-1">
                  <AlertOctagon className="w-3 h-3" />
                  L{unit.current_escalation_level} {t('workstream.escalated')}
                </Badge>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[#e6edf3] font-semibold text-base leading-snug">{unit.title}</h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-[#7d8590]">
                {unit.owner_party_name && <span>{t('workstream.owner')} {unit.owner_party_name}</span>}
                {validDeadline && (
                  <span className={`flex items-center gap-1 ${isPastDeadline ? 'text-red-400 font-medium' : ''}`}>
                    <Clock className="w-3 h-3" />
                    {isPastDeadline ? '⚠️ ' : ''}{format(validDeadline, 'MMM d, HH:mm')} ({formatDistanceToNow(validDeadline, { addSuffix: true })})
                  </span>
                )}
                {isUnconfirmed && <span className="text-gray-500 italic">{t('workstream.unconfirmedBadge')}</span>}
              </div>
            </div>

            {/* Right: proof progress */}
            <div className="shrink-0 flex flex-col items-center gap-1.5 pl-3 border-l border-[#30363d] min-w-[52px]">
              <span className="leading-none">
                <span className={`text-xl font-bold ${allProofsUploaded ? 'text-[#3fb950]' : 'text-[#e6edf3]'}`}>
                  {unit.proof_count}
                </span>
                <span className="text-[#484f58] text-sm font-normal">/{requiredCount}</span>
              </span>
              <div className="w-full h-1 bg-[#21262d] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${allProofsUploaded ? 'bg-[#238636]' : unit.proof_count > 0 ? 'bg-blue-500' : 'bg-transparent'}`}
                  style={{ width: `${Math.min((unit.proof_count / requiredCount) * 100, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-[#484f58] uppercase tracking-wide">{t('workstream.proofsUploaded').split(' ')[0]}</span>
            </div>
          </div>

          {/* Workstream Lead+: proof thumbnails */}
          {!isFieldView && unit.proofs.length > 0 && (
            <div className="space-y-2">
              {unit.last_proof_time && isValid(new Date(unit.last_proof_time)) && (
                <p className="text-xs text-[#484f58]">{t('workstream.lastProof')} {formatDistanceToNow(new Date(unit.last_proof_time), { addSuffix: true })}</p>
              )}
              <div className="flex gap-2 flex-wrap">
                {unit.proofs.slice(0, 5).map((proof) => (
                  <div
                    key={proof.id}
                    onClick={(e) => { e.stopPropagation(); router.push(`/units/${unit.id}`); }}
                    className={`w-14 h-14 rounded border overflow-hidden flex items-center justify-center cursor-pointer transition-all hover:scale-105 hover:border-[#58a6ff] ${
                      proof.approval_status === 'approved' ? 'border-[#238636]/60 bg-[#0d1117]' :
                      proof.approval_status === 'rejected' ? 'border-red-700/60 bg-[#0d1117]' :
                      'border-[#30363d] bg-[#0d1117]'
                    }`}
                  >
                    {proof.type === 'photo' ? (
                      <img src={proof.url} alt="Proof" className="w-full h-full object-cover" />
                    ) : (
                      <ProofTypeIcon type={proof.type} />
                    )}
                  </div>
                ))}
                {unit.proofs.length > 5 && (
                  <div className="w-14 h-14 bg-[#0d1117] border border-[#30363d] rounded flex items-center justify-center text-xs text-[#7d8590] font-medium">
                    +{unit.proofs.length - 5}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Field Contributor: required types + briefing + notes */}
          {isFieldView && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-[#7d8590]">
                <Camera className="w-3 h-3" />
                <div className="flex gap-1">
                  {requiredTypes.map((type) => (
                    <Badge key={type} variant="outline" className="text-xs px-1.5 py-0 border-[#30363d] text-[#7d8590]">
                      <ProofTypeIcon type={type} />
                      <span className="ms-1">{type}</span>
                    </Badge>
                  ))}
                </div>
              </div>
              {managementNotes && (
                <p className="text-xs text-[#7d8590] line-clamp-2 italic border-l-2 border-[#30363d] pl-2">
                  {managementNotes}
                </p>
              )}
              {(voiceNoteUrl || briefingAttachments.length > 0) && (
                <div className="flex items-center gap-3 text-xs text-[#7d8590]">
                  {voiceNoteUrl && (
                    <span className="flex items-center gap-1">
                      <Mic className="w-3 h-3 text-blue-400" />
                      <span className="text-blue-400">Voice note</span>
                    </span>
                  )}
                  {briefingAttachments.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Paperclip className="w-3 h-3 text-[#7d8590]" />
                      {briefingAttachments.length} briefing file{briefingAttachments.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}
              {unit.last_proof_time && isValid(new Date(unit.last_proof_time)) && (
                <p className="text-xs text-[#484f58]">{t('workstream.lastProof')} {formatDistanceToNow(new Date(unit.last_proof_time), { addSuffix: true })}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const isFieldView = permissions.role === 'FIELD_CONTRIBUTOR';
  const sortedUnits = [...units].sort((a, b) =>
    isFieldView
      ? fieldUrgencyScore(b) - fieldUrgencyScore(a)
      : leadUrgencyScore(b) - leadUrgencyScore(a)
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0E1116] p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64 bg-gray-800" />
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 bg-gray-800" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E1116] p-3 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.push('/programs')} className="text-[#7d8590] hover:text-[#e6edf3] shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-2xl font-semibold text-[#e6edf3] mb-1 truncate">
              {workstream?.name || 'Workstream'}
            </h1>
            {workstream?.type && (
              <p className="text-[#7d8590] text-sm">{t('workstream.type')} {getWorkstreamTypeLabel(workstream.type)}</p>
            )}
          </div>
          <LanguageSwitcher />
          <NotificationBell />
          {workstream && (
            <Badge
              className={`${
                workstream.overall_status === 'GREEN'
                  ? 'border-[#238636]/50 bg-[#238636]/10 text-[#3fb950]'
                  : 'border-red-600 bg-red-900/40 text-red-400 font-semibold'
              } text-sm px-4 py-2 flex items-center gap-2`}
            >
              {workstream.overall_status === 'GREEN' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {workstream.overall_status}
            </Badge>
          )}
        </div>

        {/* Workstream Metrics */}
        {workstream && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="bg-[#161b22] border-[#30363d]">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-medium text-[#e6edf3]">{workstream.total_units}</div>
                <div className="text-xs text-[#7d8590]">{t('workstream.totalUnits')}</div>
              </CardContent>
            </Card>
            <Card className="bg-[#238636]/5 border-[#238636]/20">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-medium text-[#3fb950]">{workstream.green_units}</div>
                <div className="text-xs text-[#3fb950]/70">{t('workstream.green')}</div>
              </CardContent>
            </Card>
            <Card className="bg-red-900/20 border-red-600/30">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-semibold text-red-300">{workstream.red_units}</div>
                <div className="text-xs text-red-400 font-medium">{t('workstream.red')}</div>
              </CardContent>
            </Card>
            <Card className="bg-[#db6d28]/10 border-[#db6d28]/30">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-medium text-[#db6d28]">{workstream.stale_units}</div>
                <div className="text-xs text-[#db6d28]/70">{t('workstream.pastDeadline')}</div>
              </CardContent>
            </Card>
            <Card className="bg-[#d29922]/10 border-[#d29922]/30">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-medium text-[#d29922]">{workstream.recent_escalations}</div>
                <div className="text-xs text-[#d29922]/70">{t('workstream.escalations24h')}</div>
              </CardContent>
            </Card>
            {workstream.unconfirmed_count > 0 && (
              <Card className="bg-gray-500/10 border-gray-500/30">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-medium text-gray-400">{workstream.unconfirmed_count}</div>
                  <div className="text-xs text-gray-500">{t('workstream.unconfirmed')}</div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Units List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-[#e6edf3]">
              {t('workstream.unitsCount', { count: units.length })}
            </h2>
            {permissions.role && !['FIELD_CONTRIBUTOR', 'CLIENT_VIEWER'].includes(permissions.role) && (
              <Button onClick={() => router.push(`/workstreams/${workstreamId}/units/new`)} className="bg-[#1f6feb]/90 hover:bg-[#1f6feb] text-[#e6edf3]" size="sm">
                <Plus className="w-4 h-4 me-2" />
                {t('workstream.addUnit')}
              </Button>
            )}
          </div>
          {units.length === 0 ? (
            <Card className="bg-[#161b22] border-[#30363d]">
              <CardContent className="py-12 text-center">
                <p className="text-[#7d8590] mb-4">{t('workstream.noUnits')}</p>
                {permissions.role && !['FIELD_CONTRIBUTOR', 'CLIENT_VIEWER'].includes(permissions.role) && (
                  <Button onClick={() => router.push(`/workstreams/${workstreamId}/units/new`)} className="bg-[#1f6feb]/90 hover:bg-[#1f6feb] text-[#e6edf3]">
                    {t('workstream.createUnit')}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sortedUnits.map((unit) => <UnitRow key={unit.id} unit={unit} isFieldView={isFieldView} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
