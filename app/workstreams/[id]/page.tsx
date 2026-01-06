'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UnitWithProofs, WorkstreamWithMetrics } from '@/lib/types';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Camera,
  Upload,
  ChevronLeft,
  FileText,
  Video,
  Image as ImageIcon,
  AlertOctagon,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { supabase } from '@/lib/firebase';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { getWorkstreamTypeLabel } from '@/lib/workstream-types';

export default function WorkstreamBoard() {
  const params = useParams();
  const router = useRouter();
  const workstreamId = params.id as string;
  const permissions = usePermissions();

  const [workstream, setWorkstream] = useState<WorkstreamWithMetrics | null>(null);
  const [units, setUnits] = useState<UnitWithProofs[]>([]);
  const [loading, setLoading] = useState(true);
  const [escalating, setEscalating] = useState<string | null>(null);

  useEffect(() => {
    if (workstreamId) {
      fetchWorkstream();
      fetchUnits();
    }
  }, [workstreamId]);

  async function fetchWorkstream() {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const token = session.access_token;

      const response = await fetch(`/api/workstreams/${workstreamId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch workstream');
      }

      const data = await response.json();
      setWorkstream(data);
    } catch (error) {
      console.error('Error fetching workstream:', error);
      toast.error('Failed to load workstream');
    }
  }

  async function fetchUnits() {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const token = session.access_token;

      const response = await fetch(`/api/units?workstream_id=${workstreamId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch units');
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        setUnits(data);
      } else {
        console.error('Expected array but got:', data);
        setUnits([]);
      }
    } catch (error) {
      console.error('Error fetching units:', error);
      toast.error('Failed to load units');
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleEscalate(unitId: string) {
    if (!confirm('Are you sure you want to manually escalate this unit? This will notify higher authorities immediately.')) {
      return;
    }

    setEscalating(unitId);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const token = session.access_token;

      const response = await fetch(`/api/units/${unitId}/escalate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Manual escalation by authorized user',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to escalate unit');
      }

      toast.success(`Unit escalated to level ${data.new_level}`);

      // Refresh units to show updated escalation level
      await fetchUnits();
    } catch (error: any) {
      console.error('Error escalating unit:', error);
      toast.error(error.message || 'Failed to escalate unit');
    } finally {
      setEscalating(null);
    }
  }

  function ProofTypeIcon({ type }: { type: string }) {
    switch (type) {
      case 'photo':
        return <ImageIcon className="w-3 h-3" />;
      case 'video':
        return <Video className="w-3 h-3" />;
      case 'document':
        return <FileText className="w-3 h-3" />;
      default:
        return <Camera className="w-3 h-3" />;
    }
  }

  function UnitRow({ unit }: { unit: UnitWithProofs }) {
    const isGreen = unit.computed_status === 'GREEN';
    const isPastDeadline =
      unit.required_green_by && new Date(unit.required_green_by) < new Date();
    const statusColor = isGreen
      ? 'border-green-500/40 bg-green-500/12 text-green-200'
      : 'border-red-500/40 bg-red-500/12 text-red-200';

    const requiredCount = unit.proof_requirements.required_count;
    const requiredTypes = unit.proof_requirements.required_types;

    return (
      <Card className="bg-black/25 border-gray-800 hover:border-gray-700 transition-all">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            {/* Left: Unit Info */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  className={`${statusColor} font-black text-xs px-3 py-1.5 flex items-center gap-1.5`}
                >
                  {isGreen ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  {unit.computed_status}
                </Badge>
                {unit.current_escalation_level > 0 && (
                  <Badge className="bg-orange-500/12 text-orange-400 border-orange-500/40 text-xs px-2 py-1">
                    L{unit.current_escalation_level}
                  </Badge>
                )}
              </div>

              <h3 className="text-white font-bold text-lg">{unit.title}</h3>

              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Owner: {unit.owner_party_name}</span>
                {unit.required_green_by && (
                  <span
                    className={`flex items-center gap-1 ${
                      isPastDeadline ? 'text-red-400 font-bold' : ''
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    {isPastDeadline ? '⚠️ ' : ''}
                    {format(new Date(unit.required_green_by), 'MMM d, HH:mm')} (
                    {formatDistanceToNow(new Date(unit.required_green_by), { addSuffix: true })})
                  </span>
                )}
              </div>

              {/* Proof Requirements */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">Required:</span>
                <div className="flex items-center gap-1">
                  <Camera className="w-3 h-3 text-gray-400" />
                  <span className="text-white font-medium">
                    {unit.proof_count}/{requiredCount}
                  </span>
                </div>
                <div className="flex gap-1">
                  {requiredTypes.map((type) => (
                    <Badge
                      key={type}
                      variant="outline"
                      className="text-xs px-2 py-0 border-gray-700 text-gray-400"
                    >
                      <ProofTypeIcon type={type} />
                      <span className="ml-1">{type}</span>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Proof Thumbnails */}
              {unit.proofs.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {unit.proofs.slice(0, 3).map((proof) => (
                    <div
                      key={proof.id}
                      className="w-16 h-16 bg-gray-900 border border-gray-700 rounded overflow-hidden flex items-center justify-center"
                    >
                      {proof.type === 'photo' ? (
                        <img
                          src={proof.url}
                          alt="Proof"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ProofTypeIcon type={proof.type} />
                      )}
                    </div>
                  ))}
                  {unit.proofs.length > 3 && (
                    <div className="w-16 h-16 bg-gray-900 border border-gray-700 rounded flex items-center justify-center text-xs text-gray-500">
                      +{unit.proofs.length - 3}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Actions */}
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                onClick={() => router.push(`/units/${unit.id}/upload`)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Proof
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/units/${unit.id}`)}
                className="border-gray-700 text-gray-300"
              >
                View Details
              </Button>
              {(permissions.isPlatformAdmin || permissions.role === 'PROGRAM_OWNER' || permissions.role === 'WORKSTREAM_LEAD') && !isGreen && (
                <Button
                  size="sm"
                  onClick={() => handleEscalate(unit.id)}
                  disabled={escalating === unit.id}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <AlertOctagon className="w-4 h-4 mr-2" />
                  {escalating === unit.id ? 'Escalating...' : 'Escalate'}
                </Button>
              )}
            </div>
          </div>

          {/* Last Proof Time */}
          {unit.last_proof_time && (
            <div className="mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">
              Last proof: {formatDistanceToNow(new Date(unit.last_proof_time), { addSuffix: true })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64 bg-gray-800" />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push('/programs')}
            className="text-gray-400 hover:text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-black text-white mb-1">
              {workstream?.name || 'Workstream'}
            </h1>
            {workstream?.type && (
              <p className="text-gray-500 text-sm">Type: {getWorkstreamTypeLabel(workstream.type)}</p>
            )}
          </div>
          {workstream && (
            <Badge
              className={`${
                workstream.overall_status === 'GREEN'
                  ? 'border-green-500/40 bg-green-500/12 text-green-200'
                  : 'border-red-500/40 bg-red-500/12 text-red-200'
              } font-black text-sm px-4 py-2 flex items-center gap-2`}
            >
              {workstream.overall_status === 'GREEN' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              {workstream.overall_status}
            </Badge>
          )}
        </div>

        {/* Workstream Metrics */}
        {workstream && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="bg-black/25 border-gray-800">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-white">{workstream.total_units}</div>
                <div className="text-xs text-gray-500">Total Units</div>
              </CardContent>
            </Card>
            <Card className="bg-green-500/5 border-green-500/20">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{workstream.green_units}</div>
                <div className="text-xs text-green-500">Green</div>
              </CardContent>
            </Card>
            <Card className="bg-red-500/5 border-red-500/20">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-400">{workstream.red_units}</div>
                <div className="text-xs text-red-500">Red</div>
              </CardContent>
            </Card>
            <Card className="bg-orange-500/5 border-orange-500/20">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-orange-400">{workstream.stale_units}</div>
                <div className="text-xs text-orange-500">Past Deadline</div>
              </CardContent>
            </Card>
            <Card className="bg-yellow-500/5 border-yellow-500/20">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-yellow-400">
                  {workstream.recent_escalations}
                </div>
                <div className="text-xs text-yellow-500">Escalations (24h)</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Units List */}
        <div>
          <h2 className="text-xl font-bold text-white mb-4">
            Units ({units.length})
          </h2>
          {units.length === 0 ? (
            <Card className="bg-black/25 border-gray-800">
              <CardContent className="py-12 text-center">
                <p className="text-gray-500 mb-4">No units found for this workstream</p>
                <Button
                  onClick={() => router.push(`/workstreams/${workstreamId}/units/new`)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Create Unit
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {units.map((unit) => (
                <UnitRow key={unit.id} unit={unit} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
