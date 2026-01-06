'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, ChevronLeft, Calendar, Building2 } from 'lucide-react';
import { supabase } from '@/lib/firebase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getWorkstreamTypeLabel } from '@/lib/workstream-types';

interface Program {
  id: string;
  name: string;
  description: string | null;
  owner_org: string;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
}

interface Workstream {
  id: string;
  name: string;
  type: string;
  ordering: number;
  created_at: string;
}

export default function ProgramDetailPage() {
  const params = useParams();
  const router = useRouter();
  const programId = params.id as string;

  const [program, setProgram] = useState<Program | null>(null);
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (programId) {
      fetchProgram();
      fetchWorkstreams();
    }
  }, [programId]);

  async function fetchProgram() {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const token = session.access_token;

      const response = await fetch(`/api/programs/${programId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch program');
      }

      const data = await response.json();
      setProgram(data);
    } catch (error) {
      console.error('Error fetching program:', error);
      toast.error('Failed to load program');
    }
  }

  async function fetchWorkstreams() {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const token = session.access_token;

      const response = await fetch(`/api/workstreams?program_id=${programId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch workstreams');
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        setWorkstreams(data);
      } else {
        console.error('Expected array but got:', data);
        setWorkstreams([]);
      }
    } catch (error) {
      console.error('Error fetching workstreams:', error);
      toast.error('Failed to load workstreams');
      setWorkstreams([]);
    } finally {
      setLoading(false);
    }
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
              {program?.name || 'Program'}
            </h1>
            {program?.description && (
              <p className="text-gray-400 text-sm">{program.description}</p>
            )}
          </div>
        </div>

        {/* Program Info Card */}
        {program && (
          <Card className="bg-black/25 border-gray-800">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="text-xs text-gray-500">Owner Organization</div>
                    <div className="text-white font-medium">{program.owner_org}</div>
                  </div>
                </div>
                {program.start_time && (
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">Start Time</div>
                      <div className="text-white font-medium">
                        {format(new Date(program.start_time), 'MMM d, yyyy HH:mm')}
                      </div>
                    </div>
                  </div>
                )}
                {program.end_time && (
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">End Time</div>
                      <div className="text-white font-medium">
                        {format(new Date(program.end_time), 'MMM d, yyyy HH:mm')}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Workstreams Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">
              Workstreams ({workstreams.length})
            </h2>
            <Button
              onClick={() => router.push(`/programs/${programId}/workstreams/new`)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Workstream
            </Button>
          </div>

          {workstreams.length === 0 ? (
            <Card className="bg-black/25 border-gray-800">
              <CardContent className="py-12 text-center">
                <p className="text-gray-500 mb-4">No workstreams found for this program</p>
                <Button
                  onClick={() => router.push(`/programs/${programId}/workstreams/new`)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Workstream
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workstreams.map((workstream) => (
                <Card
                  key={workstream.id}
                  className="bg-black/25 border-gray-800 hover:border-gray-700 transition-all cursor-pointer"
                  onClick={() => router.push(`/workstreams/${workstream.id}`)}
                >
                  <CardHeader>
                    <CardTitle className="text-white text-lg">{workstream.name}</CardTitle>
                    {workstream.type && (
                      <CardDescription className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs border-gray-700 text-gray-400">
                          {getWorkstreamTypeLabel(workstream.type)}
                        </Badge>
                      </CardDescription>
                    )}
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
