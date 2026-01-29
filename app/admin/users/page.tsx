'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users, Plus, Trash2, ArrowLeft, Mail, Shield, Building2 } from 'lucide-react';
import { supabase } from '@/lib/firebase';

interface User {
  user_id: string;
  email: string;
  full_name?: string;
  role: string;
  organization_id?: string;
  organization_name?: string;
  created_at: string;
}

interface Organization {
  id: string;
  name: string;
  client_code: string;
}

export default function UsersManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<User[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'FIELD_CONTRIBUTOR',
    organization_id: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setShowCreateDialog(true);
    }
    fetchData();
  }, [searchParams]);

  const fetchData = async () => {
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      // Fetch users
      const usersRes = await fetch('/api/admin/users', { headers });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.users || []);
      }

      // Fetch organizations
      const orgsRes = await fetch('/api/admin/organizations', { headers });
      if (orgsRes.ok) {
        const orgsData = await orgsRes.json();
        setOrganizations(orgsData.organizations || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.email || !formData.password || !formData.organization_id) {
      alert('Please fill in required fields (Email, Password, and Organization)');
      return;
    }

    if (formData.password.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        await fetchData();
        setShowCreateDialog(false);
        setFormData({
          email: '',
          password: '',
          full_name: '',
          role: 'FIELD_CONTRIBUTOR',
          organization_id: '',
        });
        alert('User created successfully! Escalation emails will be sent to this address.');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create user');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to delete user "${email}"?`)) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });

      if (response.ok) {
        await fetchData();
        alert('User deleted successfully');
      } else {
        alert('Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'PLATFORM_ADMIN':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'PROGRAM_OWNER':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'WORKSTREAM_LEAD':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'FIELD_CONTRIBUTOR':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <div className="border-b border-gray-700 bg-gray-800/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/admin')}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-400" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-white mb-1">User Management</h1>
                <p className="text-gray-400">Create and manage user accounts</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add New User
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {users.length === 0 ? (
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-12 border border-gray-700 text-center">
            <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No users yet</h3>
            <p className="text-gray-400 mb-6">Create your first user account to get started</p>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              Create First User
            </button>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700 bg-gray-800/50">
                    <th className="text-left py-4 px-6 text-gray-400 font-semibold text-sm">User</th>
                    <th className="text-left py-4 px-6 text-gray-400 font-semibold text-sm">Role</th>
                    <th className="text-left py-4 px-6 text-gray-400 font-semibold text-sm">Organization</th>
                    <th className="text-left py-4 px-6 text-gray-400 font-semibold text-sm">Created</th>
                    <th className="text-right py-4 px-6 text-gray-400 font-semibold text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.user_id} className="border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-green-600">
                            <Mail className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <div className="text-white font-medium">{user.full_name || user.email}</div>
                            <div className="text-gray-400 text-sm">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>
                          <Shield className="w-3 h-3" />
                          {user.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2 text-gray-300">
                          <Building2 className="w-4 h-4 text-gray-500" />
                          <span>{user.organization_name || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-gray-400 text-sm">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex justify-end">
                          {user.role !== 'PLATFORM_ADMIN' && (
                            <button
                              onClick={() => handleDelete(user.user_id, user.email)}
                              className="p-2 hover:bg-red-500/10 rounded-lg text-red-400 hover:text-red-300 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-700 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-white mb-4">Create New User</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Email Address * (For Login & Alerts)
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g., john@apple.com"
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-gray-500 text-xs mt-1">Escalation emails will be sent to this address</p>
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Password * (Minimum 6 characters)
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Full Name (Optional)
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="e.g., John Smith"
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Role *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="PROGRAM_OWNER">Program Owner - Manages entire program</option>
                  <option value="WORKSTREAM_LEAD">Workstream Lead - Manages workstreams</option>
                  <option value="FIELD_CONTRIBUTOR">Field Contributor - Uploads proof</option>
                  <option value="CLIENT_VIEWER">Client Viewer - Read-only access</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Assign to Organization *
                </label>
                <select
                  value={formData.organization_id}
                  onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Select Organization...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.client_code})
                    </option>
                  ))}
                </select>
                <p className="text-gray-500 text-xs mt-1">User will only see this organization's data</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setFormData({
                    email: '',
                    password: '',
                    full_name: '',
                    role: 'FIELD_CONTRIBUTOR',
                    organization_id: '',
                  });
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !formData.email || !formData.password || !formData.organization_id}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
