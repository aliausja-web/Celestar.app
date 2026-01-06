'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/firebase';

export default function NewWorkstreamPage() {
  const router = useRouter();
  const params = useParams();
  const programId = params.id as string;
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    type: '',
    description: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name) {
      toast.error('Workstream name is required');
      return;
    }

    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const token = session.access_token;

      const response = await fetch('/api/workstreams', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          program_id: programId,
          name: formData.name,
          type: formData.type || null,
          description: formData.description || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create workstream');
      }

      toast.success('Workstream created successfully');
      router.push('/programs');
    } catch (error: any) {
      console.error('Error creating workstream:', error);
      toast.error(error.message || 'Failed to create workstream');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
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
            <h1 className="text-3xl font-black text-white">Create New Workstream</h1>
            <p className="text-gray-500">Add a new workstream to the program</p>
          </div>
        </div>

        <Card className="bg-black/25 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Workstream Details</CardTitle>
            <CardDescription className="text-gray-400">
              Enter the basic information for the new workstream
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-300">
                  Workstream Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Riyadh Season Launch"
                  className="bg-black/40 border-gray-700 text-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type" className="text-gray-300">
                  Type
                </Label>
                <p className="text-xs text-gray-500">
                  Type describes what this workstream represents (e.g. a site, a build scope, or a system).
                </p>
                <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
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
                <Label htmlFor="description" className="text-gray-300">
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the workstream..."
                  className="bg-black/40 border-gray-700 text-white min-h-[100px]"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading ? 'Creating...' : 'Create Workstream'}
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
