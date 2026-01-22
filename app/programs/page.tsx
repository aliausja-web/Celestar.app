'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Program, WorkstreamWithMetrics } from '@/lib/types';
import { AlertTriangle, CheckCircle2, Clock, TrendingUp, FolderOpen, Plus, LogOut, Users, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/firebase';
import { getWorkstreamTypeLabel } from '@/lib/workstream-types';
import { NotificationBell } from '@/components/notification-bell';

export default function ProgramDashboard() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const permissions = usePermissions();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [workstreams, setWorkstreams] = useState<WorkstreamWithMetrics[]>([]);
  const [loadingWorkstreams, setLoadingWorkstreams] = useState(false);

  // User management state
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

  // Create user form state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState<string>('');

  async function handleLogout() {
    await signOut();
    router.push('/login');
  }

  async function fetchUsers() {
    if (!permissions.isPlatformAdmin) return;

    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  }

  async function handleCreateUser() {
    // Validation
    if (!newUserEmail || !newUserPassword || !newUserFullName || !newUserRole) {
      toast.error('All fields are required');
      return;
    }

    if (newUserPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (!newUserEmail.includes('@')) {
      toast.error('Invalid email format');
      return;
    }

    setCreatingUser(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/admin/create-rbac-user', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          full_name: newUserFullName,
          org_id: 'org_celestar',
          role: newUserRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      toast.success('User created successfully');

      // Reset form
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserFullName('');
      setNewUserRole('');
      setShowCreateUserForm(false);

      // Refresh user list
      await fetchUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error(error.message || 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleUpdateUserRole(userId: string, newRole: string) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('user_id', userId);

      if (error) throw error;

      toast.success('Role updated successfully');
      setUsers(users.map(u =>
        u.user_id === userId ? { ...u, role: newRole } : u
      ));
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error(error.message || 'Failed to update role');
    }
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      toast.success('User removed from profiles');
      setUsers(users.filter(u => u.user_id !== userId));
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error(error.message || 'Failed to delete user');
    }
  }

  async function handleDeleteProgram(programId: string, programName: string) {
    if (!confirm(`Delete program "${programName}"? This will also delete all workstreams and units. This cannot be undone.`)) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/programs/${programId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete program');
      }

      toast.success('Program deleted successfully');

      // Update local state
      const updatedPrograms = programs.filter(p => p.id !== programId);
      setPrograms(updatedPrograms);

      // If the deleted program was selected, select the first remaining program
      if (selectedProgram?.id === programId) {
        setSelectedProgram(updatedPrograms[0] || null);
      }
    } catch (error: any) {
      console.error('Error deleting program:', error);
      toast.error(error.message || 'Failed to delete program');
    }
  }

  useEffect(() => {
    fetchPrograms();
  }, []);

  useEffect(() => {
    if (selectedProgram) {
      fetchWorkstreams(selectedProgram.id);
    }
  }, [selectedProgram]);

  useEffect(() => {
    if (showUserDialog) {
      fetchUsers();
    }
  }, [showUserDialog]);

  async function fetchPrograms() {
    try {
      // Get auth token for API calls
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/programs', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/workstreams?program_id=${programId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();

      // Check if response is an error or not an array
      if (!Array.isArray(data)) {
        console.error('Workstreams API returned non-array:', data);
        setWorkstreams([]);
        return;
      }

      // Filter out any items without valid IDs
      const validWorkstreams = data.filter((ws: any) => ws && ws.id);

      // Fetch metrics for each workstream
      const withMetrics = await Promise.all(
        validWorkstreams.map(async (ws: any) => {
          try {
            const metricsResponse = await fetch(`/api/workstreams/${ws.id}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            });
            const metricsData = await metricsResponse.json();
            // If metrics fetch fails, return workstream with basic data
            if (metricsData.error) {
              return { ...ws, total_units: 0, red_units: 0, green_units: 0 };
            }
            return metricsData;
          } catch {
            return { ...ws, total_units: 0, red_units: 0, green_units: 0 };
          }
        })
      );

      setWorkstreams(withMetrics);
    } catch (error) {
      console.error('Error fetching workstreams:', error);
      setWorkstreams([]);
    } finally {
      setLoadingWorkstreams(false);
    }
  }

  function WorkstreamCard({ workstream }: { workstream: WorkstreamWithMetrics }) {
    // Guard against invalid workstream data
    if (!workstream || !workstream.id) {
      return null;
    }

    const isGreen = workstream.overall_status === 'GREEN';
    const isPending = !workstream.overall_status || workstream.total_units === 0;
    const isRed = !isGreen && !isPending;

    // All cards neutral - urgency comes from information, not visuals
    const cardStyle = 'border-[#30363d] bg-[#161b22]';

    return (
      <Card
        className={`${cardStyle} border cursor-pointer hover:border-[#3d444d] transition-colors`}
        onClick={() => workstream.id && router.push(`/workstreams/${workstream.id}`)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base font-medium text-[#e6edf3] flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-[#7d8590]" />
                {workstream.name}
              </CardTitle>
              {workstream.type && (
                <CardDescription className="text-xs text-[#7d8590]">
                  Type: {getWorkstreamTypeLabel(workstream.type)}
                </CardDescription>
              )}
            </div>
            {/* Status badge - only visual indicator */}
            {isPending ? (
              <Badge className="border-[#7d8590]/30 bg-[#7d8590]/10 text-[#7d8590] text-xs px-2.5 py-1 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                PENDING
              </Badge>
            ) : (
              <Badge
                className={`${
                  isGreen
                    ? 'border-[#238636]/50 bg-[#238636]/10 text-[#3fb950]'
                    : 'border-red-600/40 bg-red-900/20 text-red-400'
                } text-xs px-2.5 py-1 flex items-center gap-1.5`}
              >
                {isGreen ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {workstream.overall_status}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* URGENCY THROUGH INFORMATION - Top priority: time pressure */}
          {isRed && workstream.stale_units > 0 && (
            <div className="space-y-1 pb-3 border-b border-[#30363d]">
              <div className="flex items-center gap-2 text-sm text-red-300">
                <Clock className="w-4 h-4" />
                <span className="font-medium">{workstream.stale_units} unit{workstream.stale_units > 1 ? 's' : ''} past deadline</span>
              </div>
              <div className="text-xs text-[#7d8590] pl-6">
                Action required to meet program timeline
              </div>
            </div>
          )}

          {/* Escalation state - creates urgency through visibility */}
          {isRed && workstream.recent_escalations > 0 && (
            <div className="space-y-1 pb-3 border-b border-[#30363d]">
              <div className="flex items-center gap-2 text-sm text-orange-300">
                <TrendingUp className="w-4 h-4" />
                <span className="font-medium">{workstream.recent_escalations} escalation{workstream.recent_escalations > 1 ? 's' : ''} in last 24h</span>
              </div>
              <div className="text-xs text-[#7d8590] pl-6">
                Pending leadership review
              </div>
            </div>
          )}

          {/* Unit counts - informational, not urgent */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 bg-[#161b22] rounded border border-[#30363d]">
              <div className="text-xs text-[#7d8590]">Total</div>
              <div className="text-base font-medium text-[#e6edf3]">{workstream.total_units}</div>
            </div>
            <div className="text-center p-2 bg-[#238636]/5 rounded border border-[#238636]/20">
              <div className="text-xs text-[#3fb950]/80">Verified</div>
              <div className="text-base font-medium text-[#3fb950]">{workstream.green_units}</div>
            </div>
            <div className="text-center p-2 bg-[#161b22] rounded border border-[#30363d]">
              <div className="text-xs text-[#7d8590]">Pending</div>
              <div className="text-base font-medium text-[#e6edf3]">{workstream.red_units}</div>
            </div>
          </div>

          {/* Accountability: Last verified timestamp */}
          <div className="text-xs text-[#7d8590] pt-2 border-t border-[#30363d]">
            Last verified: {workstream.last_update_time ? format(new Date(workstream.last_update_time), 'MMM d, HH:mm') : 'Never'}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0E1116] p-6">
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
    <div className="min-h-screen bg-[#0E1116] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Celestar Logo - muted */}
            <div className="relative">
              <div className="w-12 h-12 rounded bg-[#1a1f26] flex items-center justify-center border border-[#21262d]">
                <div className="grid grid-cols-2 gap-0.5 w-7 h-7">
                  <div className="bg-red-500/70 rounded-tl"></div>
                  <div className="bg-orange-500/70 rounded-tr"></div>
                  <div className="bg-green-500/70 rounded-bl"></div>
                  <div className="bg-blue-500/70 rounded-br"></div>
                </div>
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-[#e6edf3]">
                Program Dashboard
              </h1>
              <p className="text-[#7d8590] text-sm">
                Execution readiness across all programs {permissions.role && `(${permissions.role})`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            {permissions.isPlatformAdmin && (
              <Button
                onClick={() => router.push('/admin')}
                className="bg-[#1f2937] hover:bg-[#374151] text-[#e6edf3] border border-[#374151]"
              >
                <Users className="w-4 h-4 mr-2" />
                Admin Dashboard
              </Button>
            )}
            {permissions.canCreateProgram && (
              <Button
                onClick={() => router.push('/programs/new')}
                className="bg-[#1c5fc7]/90 hover:bg-[#1c5fc7] text-white border border-[#1c5fc7]/50"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Program
              </Button>
            )}
            <Button
              onClick={handleLogout}
              variant="outline"
              className="bg-[#1a1f26] border-[#30363d] text-[#7d8590] hover:bg-[#21262d] hover:border-[#8b949e] hover:text-[#e6edf3]"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Program Selector */}
        {programs.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {programs.map((program) => (
              <div key={program.id} className="relative group">
                <Button
                  onClick={() => setSelectedProgram(program)}
                  variant={selectedProgram?.id === program.id ? 'default' : 'outline'}
                  className={`pr-8 ${
                    selectedProgram?.id === program.id
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40'
                  }`}
                >
                  {program.name}
                </Button>
                {permissions.isPlatformAdmin && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProgram(program.id, program.name);
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete program"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
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
              <h2 className="text-xl font-medium text-[#e6edf3]">
                Workstreams ({workstreams.length})
              </h2>
              {permissions.canCreateProgram && (
                <Button
                  onClick={() => router.push(`/programs/${selectedProgram.id}/workstreams/new`)}
                  className="bg-[#1c5fc7]/90 hover:bg-[#1c5fc7] text-white border border-[#1c5fc7]/50"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Workstream
                </Button>
              )}
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

      {/* User Management Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">Manage Users</DialogTitle>
            <DialogDescription className="text-gray-400">
              Create, edit, and manage user accounts and roles
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Create User Button */}
            {!showCreateUserForm && (
              <Button
                onClick={() => setShowCreateUserForm(true)}
                className="bg-green-600 hover:bg-green-700 text-white w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create New User
              </Button>
            )}

            {/* Create User Form */}
            {showCreateUserForm && (
              <Card className="bg-black/25 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Create New User</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-gray-300">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="user@celestar.com"
                        className="bg-black/40 border-gray-700 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-gray-300">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        className="bg-black/40 border-gray-700 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName" className="text-gray-300">Full Name</Label>
                      <Input
                        id="fullName"
                        type="text"
                        value={newUserFullName}
                        onChange={(e) => setNewUserFullName(e.target.value)}
                        placeholder="John Doe"
                        className="bg-black/40 border-gray-700 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role" className="text-gray-300">Role</Label>
                      <Select value={newUserRole} onValueChange={setNewUserRole}>
                        <SelectTrigger className="bg-black/40 border-gray-700 text-white">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-950 border-gray-700">
                          <SelectItem value="PLATFORM_ADMIN" className="text-white">PLATFORM_ADMIN</SelectItem>
                          <SelectItem value="PROGRAM_OWNER" className="text-white">PROGRAM_OWNER</SelectItem>
                          <SelectItem value="WORKSTREAM_LEAD" className="text-white">WORKSTREAM_LEAD</SelectItem>
                          <SelectItem value="FIELD_CONTRIBUTOR" className="text-white">FIELD_CONTRIBUTOR</SelectItem>
                          <SelectItem value="CLIENT_VIEWER" className="text-white">CLIENT_VIEWER</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleCreateUser}
                      disabled={creatingUser}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {creatingUser ? 'Creating...' : 'Create User'}
                    </Button>
                    <Button
                      onClick={() => {
                        setShowCreateUserForm(false);
                        setNewUserEmail('');
                        setNewUserPassword('');
                        setNewUserFullName('');
                        setNewUserRole('');
                      }}
                      variant="outline"
                      className="bg-black/25 border-gray-700 text-gray-300"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Users Table */}
            {loadingUsers ? (
              <div className="space-y-2">
                <Skeleton className="h-12 bg-gray-800" />
                <Skeleton className="h-12 bg-gray-800" />
                <Skeleton className="h-12 bg-gray-800" />
              </div>
            ) : users.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No users found</p>
            ) : (
              <div className="border border-gray-800 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-black/40 border-b border-gray-800">
                    <tr>
                      <th className="text-left p-3 text-gray-400 text-sm font-medium">Email</th>
                      <th className="text-left p-3 text-gray-400 text-sm font-medium">Full Name</th>
                      <th className="text-left p-3 text-gray-400 text-sm font-medium">Role</th>
                      <th className="text-left p-3 text-gray-400 text-sm font-medium">Organization</th>
                      <th className="text-center p-3 text-gray-400 text-sm font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.user_id} className="border-b border-gray-800 hover:bg-black/20">
                        <td className="p-3 text-white text-sm">{user.email}</td>
                        <td className="p-3 text-white text-sm">{user.full_name}</td>
                        <td className="p-3">
                          <Select
                            value={user.role}
                            onValueChange={(newRole) => handleUpdateUserRole(user.user_id, newRole)}
                          >
                            <SelectTrigger className="bg-black/40 border-gray-700 text-white text-sm h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-950 border-gray-700">
                              <SelectItem value="PLATFORM_ADMIN" className="text-white">PLATFORM_ADMIN</SelectItem>
                              <SelectItem value="PROGRAM_OWNER" className="text-white">PROGRAM_OWNER</SelectItem>
                              <SelectItem value="WORKSTREAM_LEAD" className="text-white">WORKSTREAM_LEAD</SelectItem>
                              <SelectItem value="FIELD_CONTRIBUTOR" className="text-white">FIELD_CONTRIBUTOR</SelectItem>
                              <SelectItem value="CLIENT_VIEWER" className="text-white">CLIENT_VIEWER</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3 text-white text-sm">{user.org_id}</td>
                        <td className="p-3 text-center">
                          <Button
                            onClick={() => handleDeleteUser(user.user_id, user.email)}
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
