'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, ChevronLeft, Calendar, Building2 } from 'lucide-react';
import { supabase } from '@/lib/firebase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getWorkstreamTypeLabel } from '@/lib/workstream-types';
import { usePermissions } from '@/hooks/use-permissions';

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

  const { role } = usePermissions();
  const [program, setProgram] = useState<Program | null>(null);
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreateWorkstreamDialog, setShowCreateWorkstreamDialog] = useState(false);
  const [newWorkstreamName, setNewWorkstreamName] = useState('');
  const [newWorkstreamType, setNewWorkstreamType] = useState('');
  const [newWorkstreamDescription, setNewWorkstreamDescription] = useState('');
  const [creatingWorkstream, setCreatingWorkstream] = useState(false);

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

  async function handleCreateWorkstream(e: React.FormEvent) {
    e.preventDefault();
    if (!newWorkstreamName) return;
    setCreatingWorkstream(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const response = await fetch('/api/workstreams', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program_id: programId,
          name: newWorkstreamName,
          type: newWorkstreamType || null,
          description: newWorkstreamDescription || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create workstream');
      toast.success('Workstream created successfully');
      setShowCreateWorkstreamDialog(false);
      setNewWorkstreamName('');
      setNewWorkstreamType('');
      setNewWorkstreamDescription('');
      fetchWorkstreams();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create workstream');
    } finally {
      setCreatingWorkstream(false);
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
                {program.start_time && !isNaN(new Date(program.start_time).getTime()) && (
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
                {program.end_time && !isNaN(new Date(program.end_time).getTime()) && (
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
            {role !== 'FIELD_CONTRIBUTOR' && role !== 'CLIENT_VIEWER' && (
              <Button
                onClick={() => setShowCreateWorkstreamDialog(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Workstream
              </Button>
            )}
          </div>

          {workstreams.length === 0 ? (
            <Card className="bg-black/25 border-gray-800">
              <CardContent className="py-12 text-center">
                <p className="text-gray-500 mb-4">No workstreams found for this program</p>
                {role !== 'FIELD_CONTRIBUTOR' && role !== 'CLIENT_VIEWER' && (
                  <Button
                    onClick={() => setShowCreateWorkstreamDialog(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Workstream
                  </Button>
                )}
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

      {/* Create Workstream Dialog */}
      <Dialog open={showCreateWorkstreamDialog} onOpenChange={(open) => {
        setShowCreateWorkstreamDialog(open);
        if (!open) { setNewWorkstreamName(''); setNewWorkstreamType(''); setNewWorkstreamDescription(''); }
      }}>
        <DialogContent className="bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">Create Workstream</DialogTitle>
            <DialogDescription className="text-gray-400">Add a new workstream to this program</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateWorkstream} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ws-name" className="text-gray-300">Name <span className="text-red-400">*</span></Label>
              <Input id="ws-name" value={newWorkstreamName} onChange={(e) => setNewWorkstreamName(e.target.value)} placeholder="Workstream name" className="bg-black/40 border-gray-700 text-white" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-type" className="text-gray-300">Type</Label>
              <Select value={newWorkstreamType} onValueChange={setNewWorkstreamType}>
                <SelectTrigger className="bg-black/40 border-gray-700 text-white">
                  <SelectValue placeholder="Select type (optional)" />
                </SelectTrigger>
                <SelectContent className="bg-gray-950 border-gray-700">
                  <SelectItem value="site" className="text-white">Site</SelectItem>
                  <SelectItem value="build_fitout" className="text-white">Build / Fit-Out</SelectItem>
                  <SelectItem value="mep_utilities" className="text-white">MEP / Utilities</SelectItem>
                  <SelectItem value="install_logistics" className="text-white">Install & Logistics</SelectItem>
                  <SelectItem value="it_systems" className="text-white">IT / Systems</SelectItem>
                  <SelectItem value="test_commission" className="text-white">Test / Commission</SelectItem>
                  <SelectItem value="operations_live" className="text-white">Operations (Live)</SelectItem>
                  <SelectItem value="compliance_permits" className="text-white">Compliance / Permits</SelectItem>
                  <SelectItem value="branding_creative" className="text-white">Branding / Creative</SelectItem>
                  <SelectItem value="other" className="text-white">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-desc" className="text-gray-300">Description</Label>
              <Textarea id="ws-desc" value={newWorkstreamDescription} onChange={(e) => setNewWorkstreamDescription(e.target.value)} placeholder="Brief description..." className="bg-black/40 border-gray-700 text-white min-h-[80px]" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={creatingWorkstream} className="bg-blue-600 hover:bg-blue-700 text-white">
                {creatingWorkstream ? 'Creating...' : 'Create Workstream'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCreateWorkstreamDialog(false)} className="bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40">Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
