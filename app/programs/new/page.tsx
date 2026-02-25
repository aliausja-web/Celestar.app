'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

interface Org {
  id: string;
  name: string;
}

export default function NewProgramPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    owner_org: '',
    org_id: '',
    start_time: '',
    end_time: '',
  });

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const token = session.access_token;

      // Check role
      const profileRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);

      // Fall back: load orgs — only PLATFORM_ADMIN can access this endpoint
      const orgsRes = await fetch('/api/admin/organizations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (orgsRes.ok) {
        const data = await orgsRes.json();
        setOrgs(data.organizations || []);
        setIsPlatformAdmin(true);
      }
    }
    init();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name || !formData.owner_org) {
      toast.error('Program name and owner organization are required');
      return;
    }

    if (isPlatformAdmin && !formData.org_id) {
      toast.error('Please select a client organization to assign this program to');
      return;
    }

    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const token = session.access_token;

      const response = await fetch('/api/programs', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          owner_org: formData.owner_org,
          org_id: formData.org_id || undefined,
          start_time: formData.start_time || null,
          end_time: formData.end_time || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create program');
      }

      toast.success('Program created successfully');
      router.push('/programs');
    } catch (error: any) {
      console.error('Error creating program:', error);
      toast.error(error.message || 'Failed to create program');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            onClick={() => router.push('/programs')}
            variant="outline"
            className="bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-black text-white">Create New Program</h1>
            <p className="text-gray-500">Add a new program to track execution readiness</p>
          </div>
        </div>

        {/* Form */}
        <Card className="bg-black/25 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Program Details</CardTitle>
            <CardDescription className="text-gray-400">
              Enter the basic information for the new program
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-300">
                  Program Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Riyadh Season Launch Event"
                  className="bg-black/40 border-gray-700 text-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-gray-300">
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the program..."
                  className="bg-black/40 border-gray-700 text-white min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner_org" className="text-gray-300">
                  Owner Organization <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="owner_org"
                  value={formData.owner_org}
                  onChange={(e) => setFormData({ ...formData, owner_org: e.target.value })}
                  placeholder="e.g., Riyadh Season Authority"
                  className="bg-black/40 border-gray-700 text-white"
                  required
                />
              </div>

              {/* Client org assignment — only shown to PLATFORM_ADMIN */}
              {isPlatformAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="org_id" className="text-gray-300">
                    Assign to Client Organization <span className="text-red-400">*</span>
                  </Label>
                  <select
                    id="org_id"
                    value={formData.org_id}
                    onChange={(e) => setFormData({ ...formData, org_id: e.target.value })}
                    className="w-full px-3 py-2 bg-black/40 border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select client organization...</option>
                    {orgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">
                    All users in this org will receive escalation emails for units in this program
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_time" className="text-gray-300">
                    Start Date
                  </Label>
                  <Input
                    id="start_time"
                    type="datetime-local"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="bg-black/40 border-gray-700 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end_time" className="text-gray-300">
                    End Date
                  </Label>
                  <Input
                    id="end_time"
                    type="datetime-local"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    className="bg-black/40 border-gray-700 text-white"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading ? 'Creating...' : 'Create Program'}
                </Button>
                <Button
                  type="button"
                  onClick={() => router.push('/programs')}
                  variant="outline"
                  className="bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
