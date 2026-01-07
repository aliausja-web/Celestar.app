'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/firebase';

export default function NewUnitPage() {
  const router = useRouter();
  const params = useParams();
  const workstreamId = params.id as string;
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    owner: '',
    deadline: '',
    acceptance_criteria: '',
    required_proof_count: 1,
    required_proof_types: ['photo'] as string[],
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name) {
      toast.error('Unit name is required');
      return;
    }

    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const token = session.access_token;

      const response = await fetch('/api/units', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workstream_id: workstreamId,
          name: formData.name,
          description: formData.description || null,
          owner: formData.owner || null,
          deadline: formData.deadline || null,
          acceptance_criteria: formData.acceptance_criteria || null,
          required_proof_count: formData.required_proof_count,
          required_proof_types: formData.required_proof_types,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create unit');
      }

      toast.success('Unit created successfully');

      // Ask if user wants to create another unit
      const createAnother = confirm('Unit created successfully! Would you like to create another unit for this workstream?');

      if (createAnother) {
        // Reset form for new unit
        setFormData({
          name: '',
          description: '',
          owner: '',
          deadline: '',
          acceptance_criteria: '',
          required_proof_count: 1,
          required_proof_types: ['photo'] as string[],
        });
      } else {
        router.push(`/workstreams/${workstreamId}`);
      }
    } catch (error: any) {
      console.error('Error creating unit:', error);
      toast.error(error.message || 'Failed to create unit');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => router.push(`/workstreams/${workstreamId}`)}
            variant="outline"
            className="bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-black text-white">Create New Unit</h1>
            <p className="text-gray-500">Add a new execution unit to the workstream</p>
          </div>
        </div>

        <Card className="bg-black/25 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Unit Details</CardTitle>
            <CardDescription className="text-gray-400">
              Enter the basic information for the new unit
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-300">
                  Unit Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Booth Setup - Main Stage"
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
                  placeholder="Brief description of the unit..."
                  className="bg-black/40 border-gray-700 text-white min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner" className="text-gray-300">
                  Owner
                </Label>
                <Input
                  id="owner"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  placeholder="Responsible person or team"
                  className="bg-black/40 border-gray-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadline" className="text-gray-300">
                  Deadline
                </Label>
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  className="bg-black/40 border-gray-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="acceptance_criteria" className="text-gray-300">
                  Acceptance Criteria
                </Label>
                <Textarea
                  id="acceptance_criteria"
                  value={formData.acceptance_criteria}
                  onChange={(e) => setFormData({ ...formData, acceptance_criteria: e.target.value })}
                  placeholder="Define what needs to be done for this unit to be considered complete..."
                  className="bg-black/40 border-gray-700 text-white min-h-[100px]"
                />
                <p className="text-xs text-gray-500">
                  List the specific conditions or criteria that must be met for approval
                </p>
              </div>

              {/* Proof Requirements Section */}
              <div className="pt-6 border-t border-gray-800">
                <div className="flex items-center gap-2 mb-4">
                  <Info className="w-4 h-4 text-blue-400" />
                  <h3 className="text-white font-semibold">Proof Requirements</h3>
                </div>
                <p className="text-sm text-gray-400 mb-4">
                  Configure how many proofs are needed and what types are required for this unit to turn GREEN.
                  Proofs must be approved by a Program Owner or Workstream Lead.
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="required_proof_count" className="text-gray-300">
                      Required Number of Approved Proofs <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      id="required_proof_count"
                      type="number"
                      min="1"
                      max="10"
                      value={formData.required_proof_count}
                      onChange={(e) => setFormData({ ...formData, required_proof_count: parseInt(e.target.value) || 1 })}
                      className="bg-black/40 border-gray-700 text-white"
                      required
                    />
                    <p className="text-xs text-gray-500">
                      Unit will only turn GREEN after this many proofs are uploaded AND approved
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-300">Required Proof Types</Label>
                    <p className="text-xs text-gray-500 mb-2">
                      Select which types of proofs are required (at least one of each selected type must be approved)
                    </p>
                    <div className="space-y-2">
                      {['photo', 'video', 'document'].map((type) => (
                        <div key={type} className="flex items-center gap-2">
                          <Checkbox
                            id={`type-${type}`}
                            checked={formData.required_proof_types.includes(type)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFormData({
                                  ...formData,
                                  required_proof_types: [...formData.required_proof_types, type],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  required_proof_types: formData.required_proof_types.filter((t) => t !== type),
                                });
                              }
                            }}
                            className="border-gray-600"
                          />
                          <Label
                            htmlFor={`type-${type}`}
                            className="text-gray-300 font-normal cursor-pointer capitalize"
                          >
                            {type}
                          </Label>
                        </div>
                      ))}
                    </div>
                    {formData.required_proof_types.length === 0 && (
                      <p className="text-xs text-yellow-400 mt-2">
                        ⚠️ At least one proof type should be selected
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading ? 'Creating...' : 'Create Unit'}
                </Button>
                <Button
                  type="button"
                  onClick={() => router.push(`/workstreams/${workstreamId}`)}
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
