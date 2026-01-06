'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Program, WorkstreamWithMetrics } from '@/lib/types';
import { AlertTriangle, CheckCircle2, Clock, TrendingUp, FolderOpen, Plus } from 'lucide-react';
import { format } from 'date-fns';

export default function ProgramDashboard() {
  const router = useRouter();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [workstreams, setWorkstreams] = useState<WorkstreamWithMetrics[]>([]);
  const [loadingWorkstreams, setLoadingWorkstreams] = useState(false);

  useEffect(() => {
    fetchPrograms();
  }, []);

  useEffect(() => {
    if (selectedProgram) {
      fetchWorkstreams(selectedProgram.id);
    }
  }, [selectedProgram]);

  async function fetchPrograms() {
    try {
      const response = await fetch('/api/programs');
      const data = await response.json();
      setPrograms(data);
      if (data.length > 0) {
        setSelectedProgram(data[0]);
      }
    } catch (error) {
      console.error('Error fetching programs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchWorkstreams(programId: string) {
    setLoadingWorkstreams(true);
    try {
      const response = await fetch(`/api/workstreams?program_id=${programId}`);
      const data = await response.json();

      // Fetch metrics for each workstream
      const withMetrics = await Promise.all(
        data.map(async (ws: any) => {
          const metricsResponse = await fetch(`/api/workstreams/${ws.id}`);
          return await metricsResponse.json();
        })
      );

      setWorkstreams(withMetrics);
    } catch (error) {
      console.error('Error fetching workstreams:', error);
    } finally {
      setLoadingWorkstreams(false);
    }
  }

  function WorkstreamCard({ workstream }: { workstream: WorkstreamWithMetrics }) {
    const isGreen = workstream.overall_status === 'GREEN';
    const statusColor = isGreen
      ? 'border-green-500/40 bg-green-500/5'
      : 'border-red-500/40 bg-red-500/5';

    const progress = workstream.total_units > 0
      ? Math.round((workstream.green_units / workstream.total_units) * 100)
      : 0;

    return (
      <Card
        className={`${statusColor} border cursor-pointer hover:border-opacity-60 transition-all`}
        onClick={() => router.push(`/workstreams/${workstream.id}`)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                {workstream.name}
              </CardTitle>
              {workstream.type && (
                <CardDescription className="text-xs text-gray-500">
                  Type: {workstream.type}
                </CardDescription>
              )}
            </div>
            <Badge
              className={`${
                isGreen
                  ? 'border-green-500/40 bg-green-500/12 text-green-200'
                  : 'border-red-500/40 bg-red-500/12 text-red-200'
              } font-black text-xs px-3 py-1.5 flex items-center gap-1.5`}
            >
              {isGreen ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              {workstream.overall_status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Completion</span>
              <span className="text-white font-bold">{progress}%</span>
            </div>
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isGreen ? 'bg-green-500' : 'bg-red-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Unit Counts */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 bg-black/20 rounded border border-gray-800">
              <div className="text-xs text-gray-500">Total</div>
              <div className="text-lg font-bold text-white">{workstream.total_units}</div>
            </div>
            <div className="text-center p-2 bg-green-500/5 rounded border border-green-500/20">
              <div className="text-xs text-green-500">Green</div>
              <div className="text-lg font-bold text-green-400">{workstream.green_units}</div>
            </div>
            <div className="text-center p-2 bg-red-500/5 rounded border border-red-500/20">
              <div className="text-xs text-red-500">Red</div>
              <div className="text-lg font-bold text-red-400">{workstream.red_units}</div>
            </div>
          </div>

          {/* Alerts */}
          {workstream.stale_units > 0 && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
              <Clock className="w-3 h-3" />
              <span>{workstream.stale_units} units past deadline</span>
            </div>
          )}

          {workstream.recent_escalations > 0 && (
            <div className="flex items-center gap-2 text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded px-2 py-1.5">
              <TrendingUp className="w-3 h-3" />
              <span>{workstream.recent_escalations} escalations (24h)</span>
            </div>
          )}

          {/* Last Update */}
          <div className="text-xs text-gray-500 pt-2 border-t border-gray-800">
            Last updated: {format(new Date(workstream.last_update_time), 'MMM d, HH:mm')}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64 bg-gray-800" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 bg-gray-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-white mb-2">
              Program Dashboard
            </h1>
            <p className="text-gray-500">
              Execution readiness across all programs
            </p>
          </div>
          <Button
            onClick={() => router.push('/programs/new')}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Program
          </Button>
        </div>

        {/* Program Selector */}
        {programs.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {programs.map((program) => (
              <Button
                key={program.id}
                onClick={() => setSelectedProgram(program)}
                variant={selectedProgram?.id === program.id ? 'default' : 'outline'}
                className={
                  selectedProgram?.id === program.id
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40'
                }
              >
                {program.name}
              </Button>
            ))}
          </div>
        )}

        {/* Selected Program Info */}
        {selectedProgram && (
          <Card className="bg-black/25 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">{selectedProgram.name}</CardTitle>
              {selectedProgram.description && (
                <CardDescription className="text-gray-400">
                  {selectedProgram.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex gap-6 text-sm">
              <div>
                <span className="text-gray-500">Owner Org:</span>
                <span className="text-white ml-2 font-medium">{selectedProgram.owner_org}</span>
              </div>
              {selectedProgram.start_time && (
                <div>
                  <span className="text-gray-500">Period:</span>
                  <span className="text-white ml-2 font-medium">
                    {format(new Date(selectedProgram.start_time), 'MMM d, yyyy')}
                    {selectedProgram.end_time &&
                      ` - ${format(new Date(selectedProgram.end_time), 'MMM d, yyyy')}`}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Workstreams Grid */}
        {selectedProgram && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                Workstreams ({workstreams.length})
              </h2>
            </div>

            {loadingWorkstreams ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-64 bg-gray-800" />
                ))}
              </div>
            ) : workstreams.length === 0 ? (
              <Card className="bg-black/25 border-gray-800">
                <CardContent className="py-12 text-center">
                  <FolderOpen className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                  <p className="text-gray-500 mb-4">No workstreams found for this program</p>
                  <Button
                    onClick={() => router.push(`/programs/${selectedProgram.id}/workstreams/new`)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Workstream
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workstreams.map((workstream) => (
                  <WorkstreamCard key={workstream.id} workstream={workstream} />
                ))}
              </div>
            )}
          </>
        )}

        {programs.length === 0 && (
          <Card className="bg-black/25 border-gray-800">
            <CardContent className="py-12 text-center">
              <FolderOpen className="w-12 h-12 mx-auto mb-4 text-gray-600" />
              <p className="text-gray-500 mb-4">No programs found</p>
              <Button
                onClick={() => router.push('/programs/new')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Program
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
