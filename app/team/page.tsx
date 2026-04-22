'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Plus, Trash2, ArrowLeft, Mail, Shield, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/firebase';
import { usePermissions } from '@/hooks/use-permissions';
import { NotificationBell } from '@/components/notification-bell';

interface FieldUser {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  organization_id: string;
  organization_name?: string;
  created_at: string;
}

export default function TeamManagementPage() {
  const router = useRouter();
  const permissions = usePermissions();

  const [users, setUsers] = useState<FieldUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
  });

  const canManage =
    permissions.role === 'PLATFORM_ADMIN' ||
    permissions.role === 'PROGRAM_OWNER' ||
    permissions.role === 'WORKSTREAM_LEAD';

  useEffect(() => {
    if (permissions.role === null) return; // still loading
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

  async function handleCreate() {
    if (!formData.email || !formData.password) {
      setError('Email and password are required');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/team/users', {
        method: 'POST',
        headers,
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create login');
      }

      await fetchUsers();
      setShowCreateDialog(false);
      setFormData({ email: '', password: '', full_name: '' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(userId: string, email: string) {
    if (!confirm(`Remove login for "${email}"? This cannot be undone.`)) return;

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

  function closeDialog() {
    setShowCreateDialog(false);
    setFormData({ email: '', password: '', full_name: '' });
    setError('');
  }

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
                  Manage field contributor accounts for your organisation
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
              Create logins for field contributors so they can upload proof evidence.
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
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <span className="text-gray-300 text-sm font-medium">
                {users.length} field contributor{users.length !== 1 ? 's' : ''}
              </span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800/40">
                  <th className="text-left py-3 px-6 text-gray-400 font-medium text-xs uppercase tracking-wider">User</th>
                  <th className="text-left py-3 px-6 text-gray-400 font-medium text-xs uppercase tracking-wider">Role</th>
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
                          <Mail className="w-4 h-4 text-yellow-400" />
                        </div>
                        <div>
                          <div className="text-white font-medium text-sm">
                            {user.full_name || user.email}
                          </div>
                          <div className="text-gray-400 text-xs">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-yellow-500/10 text-yellow-300 border-yellow-500/20">
                        <Shield className="w-3 h-3" />
                        Field Contributor
                      </span>
                    </td>
                    <td className="py-4 px-6 text-gray-400 text-sm">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => handleDelete(user.user_id, user.email)}
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
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-700">
              <h2 className="text-xl font-bold text-white">Create Field Team Login</h2>
              <p className="text-gray-400 text-sm mt-1">
                The new account will be a Field Contributor in your organisation.
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-1.5">
                  Email address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="field.worker@example.com"
                  className="w-full px-4 py-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
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
                  Full name <span className="text-gray-500">(optional)</span>
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
                disabled={saving || !formData.email || !formData.password}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Creating...' : 'Create Login'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
