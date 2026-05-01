'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Plus, Trash2, ArrowLeft, User, AlertCircle, ChevronDown, ChevronRight, Check, Pencil, Search, X } from 'lucide-react';
import { supabase } from '@/lib/firebase';
import { usePermissions } from '@/hooks/use-permissions';
import { NotificationBell } from '@/components/notification-bell';
import { useLocale } from '@/lib/i18n/context';

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
  const { t } = useLocale();

  const [users, setUsers] = useState<FieldUser[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [unitsLoading, setUnitsLoading] = useState(false);

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedPrograms, setExpandedPrograms] = useState<Record<string, boolean>>({});
  const [expandedWorkstreams, setExpandedWorkstreams] = useState<Record<string, boolean>>({});
  const [createSearch, setCreateSearch] = useState('');
  const [formData, setFormData] = useState({ username: '', password: '', full_name: '' });
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());

  // Edit dialog state
  const [editingUser, setEditingUser] = useState<FieldUser | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editFormData, setEditFormData] = useState({ full_name: '' });
  const [editSelectedUnitIds, setEditSelectedUnitIds] = useState<Set<string>>(new Set());
  const [editExpandedPrograms, setEditExpandedPrograms] = useState<Record<string, boolean>>({});
  const [editExpandedWorkstreams, setEditExpandedWorkstreams] = useState<Record<string, boolean>>({});
  const [editSearch, setEditSearch] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  async function fetchAvailableUnits(): Promise<ProgramOption[]> {
    setUnitsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/team/units', { headers });
      if (res.ok) {
        const data = await res.json();
        const fetched: ProgramOption[] = data.programs || [];
        setPrograms(fetched);
        return fetched;
      }
    } catch {
      // Non-fatal — unit assignment is optional
    } finally {
      setUnitsLoading(false);
    }
    return programs;
  }

  async function openCreateDialog() {
    setError('');
    setFormData({ username: '', password: '', full_name: '' });
    setSelectedUnitIds(new Set());
    setCreateSearch('');
    setExpandedPrograms({});
    setExpandedWorkstreams({});
    setShowCreateDialog(true);
    const fetched = await fetchAvailableUnits();
    if (fetched.length > 0) {
      setExpandedPrograms({ [fetched[0].program_id]: true });
      if (fetched[0].workstreams.length > 0) {
        setExpandedWorkstreams({ [fetched[0].workstreams[0].workstream_id]: true });
      }
    }
  }

  async function openEditDialog(user: FieldUser) {
    setEditError('');
    setEditFormData({ full_name: user.display_name });
    setEditSelectedUnitIds(new Set(user.assigned_units.map((u) => u.unit_id)));
    setEditSearch('');
    setEditExpandedPrograms({});
    setEditExpandedWorkstreams({});
    setEditingUser(user);
    setShowEditDialog(true);
    const fetched = await fetchAvailableUnits();
    if (fetched.length > 0) {
      setEditExpandedPrograms({ [fetched[0].program_id]: true });
      if (fetched[0].workstreams.length > 0) {
        setEditExpandedWorkstreams({ [fetched[0].workstreams[0].workstream_id]: true });
      }
    }
  }

  async function handleCreate() {
    const username = formData.username.trim().toLowerCase();
    if (!username || !formData.password) {
      setError(t('team.usernameRequired'));
      return;
    }
    if (formData.password.length < 6) {
      setError(t('team.passwordLengthError'));
      return;
    }
    if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
      setError(t('team.usernameFormatError'));
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
      closeCreateDialog();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!editingUser) return;

    setEditSaving(true);
    setEditError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/team/users/${editingUser.user_id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          full_name: editFormData.full_name.trim() || editingUser.username,
          unit_ids: Array.from(editSelectedUnitIds),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update login');
      }

      await fetchUsers();
      closeEditDialog();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(userId: string, username: string | null) {
    const label = username ?? userId;
    if (!confirm(t('team.removeConfirm', { username: label }))) return;

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
      if (next.has(unitId)) next.delete(unitId); else next.add(unitId);
      return next;
    });
  }

  function toggleEditUnit(unitId: string) {
    setEditSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId); else next.add(unitId);
      return next;
    });
  }

  function toggleProgram(programId: string) {
    setExpandedPrograms((prev) => ({ ...prev, [programId]: !prev[programId] }));
  }

  function toggleWorkstream(wsId: string) {
    setExpandedWorkstreams((prev) => ({ ...prev, [wsId]: !prev[wsId] }));
  }

  function toggleEditProgram(programId: string) {
    setEditExpandedPrograms((prev) => ({ ...prev, [programId]: !prev[programId] }));
  }

  function toggleEditWorkstream(wsId: string) {
    setEditExpandedWorkstreams((prev) => ({ ...prev, [wsId]: !prev[wsId] }));
  }

  function closeCreateDialog() {
    setShowCreateDialog(false);
    setFormData({ username: '', password: '', full_name: '' });
    setSelectedUnitIds(new Set());
    setCreateSearch('');
    setExpandedPrograms({});
    setExpandedWorkstreams({});
    setError('');
  }

  function closeEditDialog() {
    setShowEditDialog(false);
    setEditingUser(null);
    setEditFormData({ full_name: '' });
    setEditSelectedUnitIds(new Set());
    setEditSearch('');
    setEditExpandedPrograms({});
    setEditExpandedWorkstreams({});
    setEditError('');
  }

  const totalUnits = programs.reduce(
    (sum, p) => sum + p.workstreams.reduce((s, ws) => s + ws.units.length, 0),
    0
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">{t('team.loadingTeam')}</div>
      </div>
    );
  }

  // Reusable unit tree for both create and edit dialogs
  function UnitTree({
    selected,
    onToggleUnit,
    expanded,
    onToggleProgram,
    expandedWs,
    onToggleWs,
    search,
    onSearchChange,
    onToggleAllInWs,
  }: {
    selected: Set<string>;
    onToggleUnit: (id: string) => void;
    expanded: Record<string, boolean>;
    onToggleProgram: (id: string) => void;
    expandedWs: Record<string, boolean>;
    onToggleWs: (id: string) => void;
    search: string;
    onSearchChange: (v: string) => void;
    onToggleAllInWs: (unitIds: string[], allSelected: boolean) => void;
  }) {
    if (unitsLoading) {
      return <p className="text-gray-500 text-sm italic px-1">{t('team.loadingWorkstreams')}</p>;
    }
    if (totalUnits === 0) {
      return <p className="text-gray-500 text-sm italic">{t('team.noUnitsAvailable')}</p>;
    }

    const q = search.toLowerCase().trim();
    const searching = q.length > 0;

    // Filter and auto-expand when searching
    const visiblePrograms = programs.map((prog) => ({
      ...prog,
      workstreams: prog.workstreams.map((ws) => ({
        ...ws,
        units: searching ? ws.units.filter((u) => u.title.toLowerCase().includes(q)) : ws.units,
      })).filter((ws) => !searching || ws.units.length > 0),
    })).filter((prog) => !searching || prog.workstreams.length > 0);

    return (
      <div className="space-y-1.5">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('team.searchPlaceholder')}
            className="w-full pl-8 pr-8 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="border border-gray-600 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
          {visiblePrograms.map((prog) => {
            const isProgramOpen = searching || expanded[prog.program_id];
            return (
              <div key={prog.program_id}>
                <button
                  type="button"
                  onClick={() => onToggleProgram(prog.program_id)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-900/80 hover:bg-gray-900 text-gray-300 text-xs font-semibold uppercase tracking-wider transition-colors"
                >
                  {isProgramOpen
                    ? <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                  {prog.program_name}
                </button>

                {isProgramOpen && prog.workstreams.map((ws) => {
                  const isWsOpen = searching || expandedWs[ws.workstream_id];
                  const allWsSelected = ws.units.length > 0 && ws.units.every((u) => selected.has(u.id));
                  const someWsSelected = ws.units.some((u) => selected.has(u.id));
                  const wsUnitIds = ws.units.map((u) => u.id);

                  return (
                    <div key={ws.workstream_id}>
                      <div className="flex items-center border-t border-gray-700/50 bg-gray-800/60">
                        <button
                          type="button"
                          onClick={() => onToggleWs(ws.workstream_id)}
                          className="flex items-center gap-1.5 flex-1 px-4 py-1.5 text-gray-400 text-xs font-medium hover:text-gray-300 transition-colors text-left"
                        >
                          {isWsOpen
                            ? <ChevronDown className="w-3 h-3 shrink-0" />
                            : <ChevronRight className="w-3 h-3 shrink-0" />}
                          {ws.workstream_name}
                          <span className="ml-1 text-gray-600 font-normal">({ws.units.length})</span>
                        </button>
                        {/* Select-all toggle for this workstream */}
                        <button
                          type="button"
                          onClick={() => onToggleAllInWs(wsUnitIds, allWsSelected)}
                          className={`px-2.5 py-1 text-xs transition-colors shrink-0 ${
                            allWsSelected
                              ? 'text-green-400 hover:text-red-400'
                              : someWsSelected
                              ? 'text-yellow-400 hover:text-green-400'
                              : 'text-gray-600 hover:text-green-400'
                          }`}
                          title={allWsSelected ? t('team.deselectAll') : t('team.selectAll')}
                        >
                          {allWsSelected ? t('team.deselectAll') : t('team.selectAll')}
                        </button>
                      </div>

                      {isWsOpen && ws.units.map((unit) => {
                        const checked = selected.has(unit.id);
                        return (
                          <button
                            key={unit.id}
                            type="button"
                            onClick={() => onToggleUnit(unit.id)}
                            className={`w-full flex items-center gap-3 px-5 py-2.5 text-left text-sm transition-colors border-t border-gray-700/30 ${
                              checked ? 'bg-green-600/10 text-green-300' : 'text-gray-300 hover:bg-gray-700/40'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              checked ? 'bg-green-600 border-green-600' : 'border-gray-500 bg-transparent'
                            }`}>
                              {checked && <Check className="w-3 h-3 text-white" />}
                            </div>
                            {unit.title}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {searching && visiblePrograms.length === 0 && (
            <p className="text-gray-500 text-xs italic text-center py-4 px-3">
              No units match "{search}"
            </p>
          )}
        </div>
      </div>
    );
  }

  function toggleAllInWs(unitIds: string[], allSelected: boolean) {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        unitIds.forEach((id) => next.delete(id));
      } else {
        unitIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function toggleAllInWsEdit(unitIds: string[], allSelected: boolean) {
    setEditSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        unitIds.forEach((id) => next.delete(id));
      } else {
        unitIds.forEach((id) => next.add(id));
      }
      return next;
    });
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
                <h1 className="text-2xl font-bold text-white">{t('team.pageTitle')}</h1>
                <p className="text-gray-400 text-sm mt-0.5">
                  {t('team.pageSubtitle')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <button
                onClick={openCreateDialog}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                {t('team.addLogin')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {error && !showCreateDialog && !showEditDialog && (
          <div className="flex items-center gap-2 mb-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {users.length === 0 ? (
          <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-12 text-center">
            <Users className="w-14 h-14 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-1">{t('team.noLoginsTitle')}</h3>
            <p className="text-gray-400 text-sm mb-6">
              {t('team.noLoginsDesc')}
            </p>
            <button
              onClick={openCreateDialog}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {t('team.createFirstLogin')}
            </button>
          </div>
        ) : (
          <div className="bg-gray-800/60 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700">
              <span className="text-gray-300 text-sm font-medium">
                {users.length !== 1
                  ? t('team.contributorCountPlural', { count: users.length })
                  : t('team.contributorCount', { count: users.length })}
              </span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800/40">
                  <th className="text-left py-3 px-6 text-gray-400 font-medium text-xs uppercase tracking-wider">{t('team.colUsername')}</th>
                  <th className="text-left py-3 px-6 text-gray-400 font-medium text-xs uppercase tracking-wider">{t('team.colDisplayName')}</th>
                  <th className="text-left py-3 px-6 text-gray-400 font-medium text-xs uppercase tracking-wider">{t('team.colAssignedUnits')}</th>
                  <th className="text-left py-3 px-6 text-gray-400 font-medium text-xs uppercase tracking-wider">{t('team.colAdded')}</th>
                  <th className="text-right py-3 px-6 text-gray-400 font-medium text-xs uppercase tracking-wider">{t('team.colActions')}</th>
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
                        <span className="text-gray-500 text-sm italic">{t('team.noUnitsAssigned')}</span>
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
                              {t('team.moreUnits', { count: user.assigned_units.length - 2 })}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6 text-gray-400 text-sm">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditDialog(user)}
                          className="p-2 hover:bg-blue-500/10 rounded-lg text-blue-400 hover:text-blue-300 transition-colors"
                          title={t('team.editDialogTitle')}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(user.user_id, user.username)}
                          disabled={deletingId === user.user_id}
                          className="p-2 hover:bg-red-500/10 rounded-lg text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
              <h2 className="text-xl font-bold text-white">{t('team.createDialogTitle')}</h2>
              <p className="text-gray-400 text-sm mt-1">
                {t('team.createDialogDesc')}
              </p>
            </div>

            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1.5">
                    {t('team.usernameLabel')} <span className="text-red-400">*</span>
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
                    {t('team.usernameHint')}
                  </p>
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1.5">
                    {t('team.passwordLabel')} <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={t('team.passwordHint')}
                    className="w-full px-4 py-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1.5">
                    {t('team.displayNameLabel')} <span className="text-gray-500">{t('team.displayNameOptional')}</span>
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

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-gray-300 text-sm font-medium">
                    {t('team.assignUnitsLabel')} <span className="text-gray-500">{t('team.displayNameOptional')}</span>
                  </label>
                  {selectedUnitIds.size > 0 && (
                    <span className="text-green-400 text-xs font-medium">
                      {t('team.unitsSelected', { count: selectedUnitIds.size })}
                    </span>
                  )}
                </div>
                <UnitTree
                  selected={selectedUnitIds}
                  onToggleUnit={toggleUnit}
                  expanded={expandedPrograms}
                  onToggleProgram={toggleProgram}
                  expandedWs={expandedWorkstreams}
                  onToggleWs={toggleWorkstream}
                  search={createSearch}
                  onSearchChange={setCreateSearch}
                  onToggleAllInWs={toggleAllInWs}
                />
                <p className="text-gray-500 text-xs mt-1.5">
                  {t('team.unitsHint')}
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex gap-3">
              <button
                onClick={closeCreateDialog}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
              >
                {t('team.cancelButton')}
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !formData.username || !formData.password}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving
                  ? t('team.creatingButton')
                  : selectedUnitIds.size > 0
                  ? t(selectedUnitIds.size === 1 ? 'team.createWithUnitsButton' : 'team.createWithUnitsButtonPlural', { count: selectedUnitIds.size })
                  : t('team.createButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      {showEditDialog && editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-6 py-5 border-b border-gray-700">
              <h2 className="text-xl font-bold text-white">{t('team.editDialogTitle')}</h2>
              <p className="text-gray-400 text-sm mt-1 font-mono">
                {editingUser.username}
              </p>
            </div>

            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
              {editError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-1.5">
                  {t('team.displayNameLabel')}
                </label>
                <input
                  type="text"
                  value={editFormData.full_name}
                  onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                  placeholder="e.g. Jane Smith"
                  className="w-full px-4 py-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-gray-300 text-sm font-medium">
                    {t('team.assignedUnitsLabel')}
                  </label>
                  {editSelectedUnitIds.size > 0 ? (
                    <span className="text-green-400 text-xs font-medium">
                      {t('team.unitsSelected', { count: editSelectedUnitIds.size })}
                    </span>
                  ) : (
                    <span className="text-gray-500 text-xs">{t('team.noneSelected')}</span>
                  )}
                </div>
                <UnitTree
                  selected={editSelectedUnitIds}
                  onToggleUnit={toggleEditUnit}
                  expanded={editExpandedPrograms}
                  onToggleProgram={toggleEditProgram}
                  expandedWs={editExpandedWorkstreams}
                  onToggleWs={toggleEditWorkstream}
                  search={editSearch}
                  onSearchChange={setEditSearch}
                  onToggleAllInWs={toggleAllInWsEdit}
                />
                <p className="text-gray-500 text-xs mt-1.5">
                  {t('team.reassignHint')}
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex gap-3">
              <button
                onClick={closeEditDialog}
                disabled={editSaving}
                className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
              >
                {t('team.cancelButton')}
              </button>
              <button
                onClick={handleEdit}
                disabled={editSaving}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editSaving ? t('team.savingButton') : t('team.saveButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
