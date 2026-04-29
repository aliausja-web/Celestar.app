'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { UnitWithProofs, WorkstreamWithMetrics } from '@/lib/types';
import {
  AlertTriangle, CheckCircle2, Clock, Camera, Upload, ChevronLeft,
  FileText, Video, Image as ImageIcon, AlertOctagon, Plus, History,
} from 'lucide-react';
import { format, formatDistanceToNow, isValid } from 'date-fns';
import { supabase } from '@/lib/firebase';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { getWorkstreamTypeLabel } from '@/lib/workstream-types';
import { NotificationBell } from '@/components/notification-bell';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useLocale } from '@/lib/i18n/context';

export default function WorkstreamBoard() {
  const params = useParams();
  const router = useRouter();
  const permissions = usePermissions();
  const { t } = useLocale();

  const workstreamId = params?.id as string | undefined;

  const [workstream, setWorkstream] = useState<WorkstreamWithMetrics | null>(null);
  const [units, setUnits] = useState<UnitWithProofs[]>([]);
  const [loading, setLoading] = useState(true);
  const [escalating, setEscalating] = useState<string | null>(null);
  const [showEscalationDialog, setShowEscalationDialog] = useState(false);
  const [selectedUnitForEscalation, setSelectedUnitForEscalation] = useState<UnitWithProofs | null>(null);
  const [escalationReason, setEscalationReason] = useState('');

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

  function openEscalationDialog(unit: UnitWithProofs) {
    setSelectedUnitForEscalation(unit);
    setEscalationReason('');
    setShowEscalationDialog(true);
  }

  async function handleEscalate() {
    if (!selectedUnitForEscalation) return;
    if (!escalationReason.trim()) {
      toast.error(t('workstream.errorNoReason'));
      return;
    }
    setEscalating(selectedUnitForEscalation.id);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Not authenticated. Please log in again.');
      const token = session.access_token;
      const response = await fetch(`/api/units/${selectedUnitForEscalation.id}/escalate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: escalationReason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to escalate unit');
      if (data.notifications_sent) {
        toast.success(t('workstream.successEscalation', { count: data.notifications_sent }));
      } else {
        toast.success(t('workstream.noRecipients'));
      }
      if (data.email_errors) console.error('Email errors:', data.email_errors);
      setShowEscalationDialog(false);
      if (workstreamId) await fetchUnits(workstreamId);
    } catch (error: any) {
      console.error('Error escalating unit:', error);
      toast.error(error.message || 'Failed to escalate unit');
    } finally {
      setEscalating(null);
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

  function UnitRow({ unit }: { unit: UnitWithProofs }) {
    const isGreen = unit.computed_status === 'GREEN';
    const isBlocked = unit.computed_status === 'BLOCKED';
    const isUnconfirmed = unit.is_confirmed === false;
    const deadlineDate = unit.required_green_by ? new Date(unit.required_green_by) : null;
    const validDeadline = deadlineDate && isValid(deadlineDate) ? deadlineDate : null;
    const isPastDeadline = validDeadline && validDeadline < new Date();
    const statusColor = isBlocked
      ? 'border-yellow-600 bg-yellow-900/40 text-yellow-400 font-semibold'
      : isGreen
      ? 'border-[#238636]/50 bg-[#238636]/10 text-[#3fb950]'
      : 'border-red-600 bg-red-900/40 text-red-400 font-semibold';

    const requiredCount = unit.proof_requirements?.required_count || 1;
    const requiredTypes = unit.proof_requirements?.required_types || ['photo'];

    return (
      <Card
        className={`border-[#30363d] bg-[#161b22] transition-all cursor-pointer hover:border-[#484f58] ${isUnconfirmed ? 'opacity-75 border-dashed' : ''}`}
        onClick={() => router.push(`/units/${unit.id}`)}
      >
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`${statusColor} font-black text-xs px-3 py-1.5 flex items-center gap-1.5`}>
                  {isGreen ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  {unit.computed_status}
                </Badge>
                {isUnconfirmed && (
                  <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/40 text-xs px-2 py-1">
                    {t('workstream.unconfirmedBadge')}
                  </Badge>
                )}
              </div>
              <h3 className="text-[#e6edf3] font-medium text-lg">{unit.title}</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#7d8590]">
                <span>{t('workstream.owner')} {unit.owner_party_name}</span>
                {validDeadline && (
                  <span className={`flex items-center gap-1 ${isPastDeadline ? 'text-red-300 font-medium' : ''}`}>
                    <Clock className="w-3 h-3" />
                    {isPastDeadline ? '⚠️ ' : ''}
                    {format(validDeadline, 'MMM d, HH:mm')} (
                    {formatDistanceToNow(validDeadline, { addSuffix: true })})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#7d8590]">{t('workstream.required')}</span>
                <div className="flex items-center gap-1">
                  <Camera className="w-3 h-3 text-[#7d8590]" />
                  <span className="text-[#e6edf3] font-medium">{unit.proof_count}/{requiredCount}</span>
                </div>
                <div className="flex gap-1">
                  {requiredTypes.map((type) => (
                    <Badge key={type} variant="outline" className="text-xs px-2 py-0 border-[#30363d] text-[#7d8590]">
                      <ProofTypeIcon type={type} />
                      <span className="ms-1">{type}</span>
                    </Badge>
                  ))}
                </div>
              </div>
              {unit.proofs.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {unit.proofs.slice(0, 3).map((proof) => (
                    <div key={proof.id} className="w-16 h-16 bg-[#0d1117] border border-[#30363d] rounded overflow-hidden flex items-center justify-center">
                      {proof.type === 'photo' ? (
                        <img src={proof.url} alt="Proof" className="w-full h-full object-cover" />
                      ) : (
                        <ProofTypeIcon type={proof.type} />
                      )}
                    </div>
                  ))}
                  {unit.proofs.length > 3 && (
                    <div className="w-16 h-16 bg-[#0d1117] border border-[#30363d] rounded flex items-center justify-center text-xs text-[#7d8590]">
                      +{unit.proofs.length - 3}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2 sm:flex-col sm:shrink-0">
              {permissions.role === 'FIELD_CONTRIBUTOR' ? (
                <Button size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/units/${unit.id}/upload`); }} className="flex-1 sm:flex-none bg-[#1f6feb]/90 hover:bg-[#1f6feb] text-[#e6edf3]">
                  <Upload className="w-4 h-4 me-2" />
                  {t('workstream.submitProof')}
                </Button>
              ) : (
                <Button size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/units/${unit.id}`); }} className="flex-1 sm:flex-none bg-[#1f6feb]/90 hover:bg-[#1f6feb] text-[#e6edf3]">
                  <History className="w-4 h-4 me-2" />
                  {t('workstream.viewAuditTrail')}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); router.push(`/units/${unit.id}`); }} className="flex-1 sm:flex-none border-[#30363d] text-[#e6edf3] hover:bg-[#161b22]">
                {t('workstream.viewDetails')}
              </Button>
            </div>
          </div>
          {unit.last_proof_time && isValid(new Date(unit.last_proof_time)) && (
            <div className="mt-3 pt-3 border-t border-[#30363d] text-xs text-[#7d8590]">
              {t('workstream.lastProof')} {formatDistanceToNow(new Date(unit.last_proof_time), { addSuffix: true })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

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
            <Button onClick={() => router.push(`/workstreams/${workstreamId}/units/new`)} className="bg-[#1f6feb]/90 hover:bg-[#1f6feb] text-[#e6edf3]" size="sm">
              <Plus className="w-4 h-4 me-2" />
              {t('workstream.addUnit')}
            </Button>
          </div>
          {units.length === 0 ? (
            <Card className="bg-[#161b22] border-[#30363d]">
              <CardContent className="py-12 text-center">
                <p className="text-[#7d8590] mb-4">{t('workstream.noUnits')}</p>
                <Button onClick={() => router.push(`/workstreams/${workstreamId}/units/new`)} className="bg-[#1f6feb]/90 hover:bg-[#1f6feb] text-[#e6edf3]">
                  {t('workstream.createUnit')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {units.map((unit) => <UnitRow key={unit.id} unit={unit} />)}
            </div>
          )}
        </div>
      </div>

      {/* Escalation Dialog */}
      <Dialog open={showEscalationDialog} onOpenChange={setShowEscalationDialog}>
        <DialogContent className="bg-[#161b22] border-[#30363d] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#e6edf3]">{t('workstream.escalationTitle')}</DialogTitle>
            <DialogDescription className="text-[#7d8590]">
              {t('workstream.escalationDesc', { name: selectedUnitForEscalation?.title || '' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-[#db6d28]/10 border border-[#db6d28]/30 rounded p-3">
              <div className="flex items-start gap-2">
                <AlertOctagon className="w-5 h-5 text-[#db6d28] mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-[#db6d28] font-medium mb-1">{t('workstream.escalationWarning')}</p>
                  <p className="text-xs text-[#7d8590]">{t('workstream.escalationCaution')}</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="escalation_reason" className="text-[#e6edf3]">
                {t('workstream.escalationReasonLabel')} <span className="text-red-400">*</span>
              </Label>
              <Textarea
                id="escalation_reason"
                value={escalationReason}
                onChange={(e) => setEscalationReason(e.target.value)}
                placeholder={t('workstream.escalationPlaceholder')}
                className="bg-[#0d1117] border-[#30363d] text-[#e6edf3] min-h-[120px]"
                required
              />
              <p className="text-xs text-[#7d8590]">{t('workstream.escalationHint')}</p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowEscalationDialog(false)} className="bg-[#0d1117] border-[#30363d] text-[#e6edf3]">
              {t('workstream.cancelButton')}
            </Button>
            <Button
              onClick={handleEscalate}
              disabled={!escalationReason.trim() || escalating === selectedUnitForEscalation?.id}
              className="bg-[#db6d28]/80 hover:bg-[#db6d28] text-[#e6edf3]"
            >
              {escalating === selectedUnitForEscalation?.id ? t('workstream.escalatingButton') : t('workstream.escalateButton')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
