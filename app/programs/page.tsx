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
import { LanguageSwitcher } from '@/components/language-switcher';
import { useLocale } from '@/lib/i18n/context';

export default function ProgramDashboard() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const permissions = usePermissions();
  const { t } = useLocale();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [workstreams, setWorkstreams] = useState<WorkstreamWithMetrics[]>([]);
  const [loadingWorkstreams, setLoadingWorkstreams] = useState(false);

  const [showUserDialog, setShowUserDialog] = useState(false);
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

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
      if (!response.ok) throw new Error(data.error || 'Failed to create user');
      toast.success('User created successfully');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserFullName('');
      setNewUserRole('');
      setShowCreateUserForm(false);
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
      setUsers(users.map(u => u.user_id === userId ? { ...u, role: newRole } : u));
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error(error.message || 'Failed to update role');
    }
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(t('programs.deleteUser', { email }))) return;
    try {
      const { error } = await supabase.from('profiles').delete().eq('user_id', userId);
      if (error) throw error;
      toast.success('User removed from profiles');
      setUsers(users.filter(u => u.user_id !== userId));
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error(error.message || 'Failed to delete user');
    }
  }

  async function handleDeleteProgram(programId: string, programName: string) {
    if (!confirm(t('programs.deleteProgram', { name: programName }))) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const response = await fetch(`/api/programs/${programId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete program');
      }
      toast.success('Program deleted successfully');
      const updatedPrograms = programs.filter(p => p.id !== programId);
      setPrograms(updatedPrograms);
      if (selectedProgram?.id === programId) {
        setSelectedProgram(updatedPrograms[0] || null);
      }
    } catch (error: any) {
      console.error('Error deleting program:', error);
      toast.error(error.message || 'Failed to delete program');
    }
  }

  useEffect(() => { fetchPrograms(); }, []);
  useEffect(() => { if (selectedProgram) fetchWorkstreams(selectedProgram.id); }, [selectedProgram]);
  useEffect(() => { if (showUserDialog) fetchUsers(); }, [showUserDialog]);

  async function fetchPrograms() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const response = await fetch('/api/programs', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setPrograms(data);
      if (data.length > 0) setSelectedProgram(data[0]);
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
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (!Array.isArray(data)) { setWorkstreams([]); return; }
      const validWorkstreams = data.filter((ws: any) => ws && ws.id);
      const withMetrics = await Promise.all(
        validWorkstreams.map(async (ws: any) => {
          try {
            const metricsResponse = await fetch(`/api/workstreams/${ws.id}`, {
              headers: { 'Authorization': `Bearer ${token}` },
            });
            const metricsData = await metricsResponse.json();
            if (metricsData.error) return { ...ws, total_units: 0, red_units: 0, green_units: 0 };
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
    if (!workstream || !workstream.id) return null;
    const isGreen = workstream.overall_status === 'GREEN';
    const isPending = !workstream.overall_status || workstream.total_units === 0;
    const isRed = !isGreen && !isPending;
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
                  {t('workstream.type')} {getWorkstreamTypeLabel(workstream.type)}
                </CardDescription>
              )}
            </div>
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
          {isRed && workstream.stale_units > 0 && (
            <div className="space-y-1 pb-3 border-b border-[#30363d]">
              <div className="flex items-center gap-2 text-sm text-red-300">
                <Clock className="w-4 h-4" />
                <span className="font-medium">
                  {workstream.stale_units} {workstream.stale_units > 1 ? t('programs.pastDeadlinePlural') : t('programs.pastDeadline')}
                </span>
              </div>
              <div className="text-xs text-[#7d8590] ps-6">{t('programs.actionRequired')}</div>
            </div>
          )}
          {isRed && workstream.recent_escalations > 0 && (
            <div className="space-y-1 pb-3 border-b border-[#30363d]">
              <div className="flex items-center gap-2 text-sm text-orange-300">
                <TrendingUp className="w-4 h-4" />
                <span className="font-medium">
                  {workstream.recent_escalations} {workstream.recent_escalations > 1 ? t('programs.escalationPlural') : t('programs.escalationSingular')}
                </span>
              </div>
              <div className="text-xs text-[#7d8590] ps-6">{t('programs.pendingLeadership')}</div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 bg-[#161b22] rounded border border-[#30363d]">
              <div className="text-xs text-[#7d8590]">{t('programs.total')}</div>
              <div className="text-base font-medium text-[#e6edf3]">{workstream.total_units}</div>
            </div>
            <div className="text-center p-2 bg-[#238636]/5 rounded border border-[#238636]/20">
              <div className="text-xs text-[#3fb950]/80">{t('programs.verified')}</div>
              <div className="text-base font-medium text-[#3fb950]">{workstream.green_units}</div>
            </div>
            <div className="text-center p-2 bg-[#161b22] rounded border border-[#30363d]">
              <div className="text-xs text-[#7d8590]">{t('programs.pending')}</div>
              <div className="text-base font-medium text-[#e6edf3]">{workstream.red_units}</div>
            </div>
          </div>
          <div className="text-xs text-[#7d8590] pt-2 border-t border-[#30363d]">
            {t('programs.lastVerified')} {workstream.last_update_time ? format(new Date(workstream.last_update_time), 'MMM d, yyyy') : t('programs.never')}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0E1116] p-3 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64 bg-gray-800" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 bg-gray-800" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E1116] p-3 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
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
              <h1 className="text-2xl font-semibold text-[#e6edf3]">{t('programs.title')}</h1>
              <p className="text-[#7d8590] text-sm">{t('programs.subtitle')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LanguageSwitcher />
            <NotificationBell />
            {permissions.isPlatformAdmin && (
              <Button
                onClick={() => router.push('/admin')}
                className="bg-[#1f2937] hover:bg-[#374151] text-[#e6edf3] border border-[#374151]"
              >
                <Users className="w-4 h-4 me-2" />
                {t('programs.adminDashboard')}
              </Button>
            )}
            {(permissions.role === 'PROGRAM_OWNER' || permissions.role === 'WORKSTREAM_LEAD' || permissions.isPlatformAdmin) && (
              <Button
                onClick={() => router.push('/team')}
                className="bg-[#1f2937] hover:bg-[#374151] text-[#e6edf3] border border-[#374151]"
              >
                <Users className="w-4 h-4 me-2" />
                {t('programs.fieldTeam')}
              </Button>
            )}
            {permissions.canCreateProgram && (
              <Button
                onClick={() => router.push('/programs/new')}
                className="bg-[#1c5fc7]/90 hover:bg-[#1c5fc7] text-white border border-[#1c5fc7]/50"
              >
                <Plus className="w-4 h-4 me-2" />
                {t('programs.newProgram')}
              </Button>
            )}
            <Button
              onClick={handleLogout}
              variant="outline"
              className="bg-[#1a1f26] border-[#30363d] text-[#7d8590] hover:bg-[#21262d] hover:border-[#8b949e] hover:text-[#e6edf3]"
            >
              <LogOut className="w-4 h-4 me-2" />
              {t('common.logout')}
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
                    onClick={(e) => { e.stopPropagation(); handleDeleteProgram(program.id, program.name); }}
                    className="absolute end-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
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
                <CardDescription className="text-gray-400">{selectedProgram.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4 sm:gap-6 text-sm">
              <div>
                <span className="text-gray-500">{t('programs.ownerOrg')}</span>
                <span className="text-white ms-2 font-medium">{selectedProgram.owner_org}</span>
              </div>
              {selectedProgram.start_time && !isNaN(new Date(selectedProgram.start_time).getTime()) && (
                <div>
                  <span className="text-gray-500">{t('programs.period')}</span>
                  <span className="text-white ms-2 font-medium">
                    {format(new Date(selectedProgram.start_time), 'MMM d, yyyy')}
                    {selectedProgram.end_time && !isNaN(new Date(selectedProgram.end_time).getTime()) &&
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
                {t('programs.workstreamsCount', { count: workstreams.length })}
              </h2>
              {permissions.canCreateProgram && (
                <Button
                  onClick={() => router.push(`/programs/${selectedProgram.id}/workstreams/new`)}
                  className="bg-[#1c5fc7]/90 hover:bg-[#1c5fc7] text-white border border-[#1c5fc7]/50"
                >
                  <Plus className="w-4 h-4 me-2" />
                  {t('programs.addWorkstream')}
                </Button>
              )}
            </div>

            {loadingWorkstreams ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 bg-gray-800" />)}
              </div>
            ) : workstreams.length === 0 ? (
              <Card className="bg-black/25 border-gray-800">
                <CardContent className="py-12 text-center">
                  <FolderOpen className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                  <p className="text-gray-500 mb-4">{t('programs.noWorkstreams')}</p>
                  <Button
                    onClick={() => router.push(`/programs/${selectedProgram.id}/workstreams/new`)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Plus className="w-4 h-4 me-2" />
                    {t('programs.createWorkstream')}
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
              <p className="text-gray-500 mb-4">{t('programs.noPrograms')}</p>
              <Button
                onClick={() => router.push('/programs/new')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="w-4 h-4 me-2" />
                {t('programs.createFirstProgram')}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* User Management Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">{t('programs.manageUsers')}</DialogTitle>
            <DialogDescription className="text-gray-400">{t('programs.manageUsersDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {!showCreateUserForm && (
              <Button onClick={() => setShowCreateUserForm(true)} className="bg-green-600 hover:bg-green-700 text-white w-full">
                <Plus className="w-4 h-4 me-2" />
                {t('programs.createNewUser')}
              </Button>
            )}
            {showCreateUserForm && (
              <Card className="bg-black/25 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white text-lg">{t('programs.createNewUser')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-gray-300">{t('programs.emailLabel')}</Label>
                      <Input id="email" type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="user@celestar.com" className="bg-black/40 border-gray-700 text-white" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-gray-300">{t('programs.passwordLabel')}</Label>
                      <Input id="password" type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} placeholder={t('programs.minCharsPlaceholder')} className="bg-black/40 border-gray-700 text-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName" className="text-gray-300">{t('programs.fullNameLabel')}</Label>
                      <Input id="fullName" type="text" value={newUserFullName} onChange={(e) => setNewUserFullName(e.target.value)} placeholder={t('programs.namePlaceholder')} className="bg-black/40 border-gray-700 text-white" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role" className="text-gray-300">{t('programs.roleLabel')}</Label>
                      <Select value={newUserRole} onValueChange={setNewUserRole}>
                        <SelectTrigger className="bg-black/40 border-gray-700 text-white">
                          <SelectValue placeholder={t('programs.selectRole')} />
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
                    <Button onClick={handleCreateUser} disabled={creatingUser} className="bg-green-600 hover:bg-green-700 text-white">
                      {creatingUser ? t('programs.creatingUser') : t('programs.createUserButton')}
                    </Button>
                    <Button onClick={() => { setShowCreateUserForm(false); setNewUserEmail(''); setNewUserPassword(''); setNewUserFullName(''); setNewUserRole(''); }} variant="outline" className="bg-black/25 border-gray-700 text-gray-300">
                      {t('common.cancel')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {loadingUsers ? (
              <div className="space-y-2">
                <Skeleton className="h-12 bg-gray-800" />
                <Skeleton className="h-12 bg-gray-800" />
                <Skeleton className="h-12 bg-gray-800" />
              </div>
            ) : users.length === 0 ? (
              <p className="text-gray-500 text-center py-8">{t('programs.noUsers')}</p>
            ) : (
              <div className="border border-gray-800 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-black/40 border-b border-gray-800">
                    <tr>
                      <th className="text-start p-3 text-gray-400 text-sm font-medium">{t('programs.emailHeader')}</th>
                      <th className="text-start p-3 text-gray-400 text-sm font-medium">{t('programs.fullNameHeader')}</th>
                      <th className="text-start p-3 text-gray-400 text-sm font-medium">{t('programs.roleHeader')}</th>
                      <th className="text-start p-3 text-gray-400 text-sm font-medium">{t('programs.orgHeader')}</th>
                      <th className="text-center p-3 text-gray-400 text-sm font-medium">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.user_id} className="border-b border-gray-800 hover:bg-black/20">
                        <td className="p-3 text-white text-sm">{user.email}</td>
                        <td className="p-3 text-white text-sm">{user.full_name}</td>
                        <td className="p-3">
                          <Select value={user.role} onValueChange={(newRole) => handleUpdateUserRole(user.user_id, newRole)}>
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
                          <Button onClick={() => handleDeleteUser(user.user_id, user.email)} variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
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
