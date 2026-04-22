'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Plus, Trash2, ArrowLeft, User, Shield, AlertCircle, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { supabase } from '@/lib/firebase';
import { usePermissions } from '@/hooks/use-permissions';
import { NotificationBell } from '@/components/notification-bell';

interface AssignedUnit {
  unit_id: string;
  unit_title: string;
}

interface FieldUser {
  user_id: string;
  username: string | null;
  display_name: string;
  role: string;
  organization_id: string;
  organization_name?: string;
  created_at: string;
  assigned_units: AssignedUnit[];
}

interface UnitOption {
  id: string;
  title: string;
}

interface WorkstreamOption {
  workstream_id: string;
  workstream_name: string;
  units: UnitOption[];
}

interface ProgramOption {
  program_id: string;
  program_name: string;
  workstreams: WorkstreamOption[];
}

export default function TeamManagementPage() {
  const router = useRouter();
  const permissions = usePermissions();

  const [users, setUsers] = useState<FieldUser[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [expandedPrograms, setExpandedPrograms] = useState<Record<string, boolean>>({});

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
  });
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());

  const canManage =
    permissions.role === 'PLATFORM_ADMIN' ||
    permissions.role === 'PROGRAM_OWNER' ||
    permissions.role === 'WORKSTREAM_LEAD';

  useEffect(() => {
    if (permissions.role === null) return;
    if (!canManage) {
      router.replace('/programs');
      return;
    }
    fetchUsers();
    fetchAvailableUnits();
  }, [permissions.role]);

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    return headers;
  }

  async function fetchUsers() {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/team/users', { headers });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load team');
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAvailableUnits() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/team/units', { headers });
      if (res.ok) {
        const data = await res.json();
        setPrograms(data.programs || []);
        // Auto-expand first program
        if (data.programs?.length > 0) {
          setExpandedPrograms({ [data.programs[0].program_id]: true });
        }
      }
    } catch {
      // Non-fatal — unit assignment is optional
    }
  }

  async function handleCreate() {
    const username = formData.username.trim().toLowerCase();
    if (!username || !formData.password) {
      setError('Username and password are required');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
      setError('Username must be 3–30 characters: lowercase letters, numbers, underscores, or hyphens only');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/team/users', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...formData,
          username,
          unit_ids: Array.from(selectedUnitIds),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create login');
      }

      await fetchUsers();
      closeDialog();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(userId: string, username: string | null) {
    const label = username ?? userId;
    if (!confirm(`Remove login for "${label}"? This cannot be undone.`)) return;

    setDeletingId(userId);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/team/users/${userId}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to remove login');
      }
      setUsers((prev) => prev.filter((u) => u.user_id !== userId));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  function toggleUnit(unitId: string) {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  function toggleProgram(programId: string) {
    setExpandedPrograms((prev) => ({ ...prev, [programId]: !prev[programId] }));
  }

  function closeDialog() {
    setShowCreateDialog(false);
    setFormData({ username: '', password: '', full_name: '' });
    setSelectedUnitIds(new Set());
    setError('');
  }

  const totalUnits = programs.reduce(
    (sum, p) => sum + p.workstreams.reduce((s, ws) => s + ws.units.length, 0),
    0
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading team...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <div className="border-b border-gray-700 bg-gray-800/50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/programs')}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-400" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white">Field Team Logins</h1>
                <p className="text-gray-400 text-sm mt-0.5">
                  Manage field contributor accounts and unit assignments
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <button
                onClick={() => { setError(''); setShowCreateDialog(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Login
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {error && !showCreateDialog && (
          <div className="flex items-center gap-2 mb-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {users.length === 0 ? (
          <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-12 text-center">
            <Users className="w-14 h-14 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-1">No field team logins yet</h3>
            <p className="text-gray-400 text-sm mb-6">
              Create logins for field contributors and assign them to their specific units.
            </p>
            <button
              onClick={() => { setError(''); setShowCreateDialog(true); }}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Create First Login
            </button>
          </div>
        ) : (
          <div className="bg-gray-800/60 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700">
              <span className="text-gray-300 text-sm font-medium">
                {users.length} field contributor{users.length !== 1 ? 's' : ''}
              </span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800/40">
                  <th className="text-left py-3 px-6 text-gray-400 font-medium text-xs uppercase tracking-wider">Username</th>
                  <th className="text-left py-3 px-6 text-gray-400 font-medium text-xs uppercase tracking-wider">Display Name</th>
                  <th className="text-left py-3 px-6 text-gray-400 font-medium text-xs uppercase tracking-wider">Assigned Units</th>
                  <th className="text-left py-3 px-6 text-gray-400 font-medium text-xs uppercase tracking-wider">Added</th>
                  <th className="text-right py-3 px-6 text-gray-400 font-medium text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.user_id}
                    className="border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors"
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-yellow-600/20">
                          <User className="w-4 h-4 text-yellow-400" />
                        </div>
                        <span className="text-white font-mono text-sm font-medium">
                          {user.username ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-gray-300 text-sm">
                      {user.display_name}
                    </td>
                    <td className="py-4 px-6">
                      {user.assigned_units.length === 0 ? (
                        <span className="text-gray-500 text-sm italic">No units assigned</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {user.assigned_units.slice(0, 2).map((u) => (
                            <span
                              key={u.unit_id}
                              className="inline-block px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-blue-300 text-xs"
                              title={u.unit_title}
                            >
                              {u.unit_title.length > 22 ? u.unit_title.slice(0, 20) + '…' : u.unit_title}
                            </span>
                          ))}
                          {user.assigned_units.length > 2 && (
                            <span className="inline-block px-2 py-0.5 bg-gray-700 rounded text-gray-400 text-xs">
                              +{user.assigned_units.length - 2} more
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6 text-gray-400 text-sm">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => handleDelete(user.user_id, user.username)}
                        disabled={deletingId === user.user_id}
                        className="p-2 hover:bg-red-500/10 rounded-lg text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                        title="Remove login"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-6 py-5 border-b border-gray-700">
              <h2 className="text-xl font-bold text-white">Create Field Team Login</h2>
              <p className="text-gray-400 text-sm mt-1">
                The new account will be a Field Contributor in your organisation.
              </p>
            </div>

            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Credentials */}
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1.5">
                    Username <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase() })}
                    placeholder="e.g. john_doe"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="w-full px-4 py-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm font-mono"
                  />
                  <p className="text-gray-500 text-xs mt-1">
                    3–30 chars · lowercase letters, numbers, _ or - only
                  </p>
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1.5">
                    Password <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Min. 6 characters"
                    className="w-full px-4 py-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1.5">
                    Display name <span className="text-gray-500">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="e.g. Jane Smith"
                    className="w-full px-4 py-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>
              </div>

              {/* Unit assignment */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-gray-300 text-sm font-medium">
                    Assign units <span className="text-gray-500">(optional)</span>
                  </label>
                  {selectedUnitIds.size > 0 && (
                    <span className="text-green-400 text-xs font-medium">
                      {selectedUnitIds.size} selected
                    </span>
                  )}
                </div>

                {totalUnits === 0 ? (
                  <p className="text-gray-500 text-sm italic">No units available yet.</p>
                ) : (
                  <div className="border border-gray-600 rounded-lg overflow-hidden max-h-52 overflow-y-auto">
                    {programs.map((prog) => (
                      <div key={prog.program_id}>
                        {/* Program header */}
                        <button
                          type="button"
                          onClick={() => toggleProgram(prog.program_id)}
                          className="w-full flex items-center gap-2 px-3 py-2 bg-gray-900/80 hover:bg-gray-900 text-gray-300 text-xs font-semibold uppercase tracking-wider transition-colors"
                        >
                          {expandedPrograms[prog.program_id]
                            ? <ChevronDown className="w-3.5 h-3.5" />
                            : <ChevronRight className="w-3.5 h-3.5" />}
                          {prog.program_name}
                        </button>

                        {expandedPrograms[prog.program_id] && prog.workstreams.map((ws) => (
                          <div key={ws.workstream_id}>
                            {/* Workstream sub-header */}
                            <div className="px-4 py-1.5 bg-gray-800/60 text-gray-400 text-xs font-medium border-t border-gray-700/50">
                              {ws.workstream_name}
                            </div>

                            {/* Units */}
                            {ws.units.map((unit) => {
                              const checked = selectedUnitIds.has(unit.id);
                              return (
                                <button
                                  key={unit.id}
                                  type="button"
                                  onClick={() => toggleUnit(unit.id)}
                                  className={`w-full flex items-center gap-3 px-5 py-2.5 text-left text-sm transition-colors border-t border-gray-700/30 ${
                                    checked
                                      ? 'bg-green-600/10 text-green-300'
                                      : 'text-gray-300 hover:bg-gray-700/40'
                                  }`}
                                >
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                    checked
                                      ? 'bg-green-600 border-green-600'
                                      : 'border-gray-500 bg-transparent'
                                  }`}>
                                    {checked && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                  {unit.title}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-gray-500 text-xs mt-1.5">
                  Field contributors only see and interact with their assigned units.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex gap-3">
              <button
                onClick={closeDialog}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !formData.username || !formData.password}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Creating...' : `Create Login${selectedUnitIds.size > 0 ? ` & Assign ${selectedUnitIds.size} Unit${selectedUnitIds.size !== 1 ? 's' : ''}` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
