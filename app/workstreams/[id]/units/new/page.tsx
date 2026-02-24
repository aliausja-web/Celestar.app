'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Info, Bell, AlertCircle, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/firebase';

export default function NewUnitPage() {
  const router = useRouter();
  const params = useParams();

  // Get workstream ID directly from params
  const workstreamId = params?.id as string | undefined;

  const [loading, setLoading] = useState(false);
  const [showAdvancedAlerts, setShowAdvancedAlerts] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    owner: '',
    deadline: '',
    acceptance_criteria: '',
    required_proof_count: 1,
    required_proof_types: ['photo'] as string[],
    requires_reviewer_approval: true,
    requires_reference_number: false,
    requires_expiry_date: false,
    urgency_alerts_enabled: true,
    urgency_level_1: 50,  // Alert at 50% of time elapsed
    urgency_level_2: 75,  // Alert at 75% of time elapsed
    urgency_level_3: 90,  // Alert at 90% of time elapsed
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name) {
      toast.error('Unit name is required');
      return;
    }

    if (!workstreamId) {
      toast.error('Workstream ID not found');
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
          requires_reviewer_approval: formData.requires_reviewer_approval,
          requires_reference_number: formData.requires_reference_number,
          requires_expiry_date: formData.requires_expiry_date,
          escalation_config: {
            enabled: formData.urgency_alerts_enabled,
            thresholds: [
              {
                level: 1,
                percentage_elapsed: formData.urgency_level_1,
                target_roles: ['WORKSTREAM_LEAD']
              },
              {
                level: 2,
                percentage_elapsed: formData.urgency_level_2,
                target_roles: ['PROGRAM_OWNER', 'WORKSTREAM_LEAD']
              },
              {
                level: 3,
                percentage_elapsed: formData.urgency_level_3,
                target_roles: ['PLATFORM_ADMIN', 'PROGRAM_OWNER']
              }
            ]
          },
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
          requires_reviewer_approval: true,
          requires_reference_number: false,
          requires_expiry_date: false,
          urgency_alerts_enabled: true,
          urgency_level_1: 50,
          urgency_level_2: 75,
          urgency_level_3: 90,
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

              {/* Governance Validation Section */}
              <div className="pt-6 border-t border-gray-800">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-4 h-4 text-purple-400" />
                  <h3 className="text-white font-semibold">Governance Validation</h3>
                </div>
                <p className="text-sm text-gray-400 mb-4">
                  Configure additional evidence requirements for this unit. These settings determine what
                  constitutes a qualifying proof submission.
                </p>

                <div className="space-y-4 bg-black/20 p-4 rounded-lg border border-gray-700">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="requires_reviewer_approval"
                      checked={formData.requires_reviewer_approval}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, requires_reviewer_approval: checked as boolean })
                      }
                      className="border-gray-600 mt-0.5"
                    />
                    <div>
                      <Label
                        htmlFor="requires_reviewer_approval"
                        className="text-gray-300 font-medium cursor-pointer"
                      >
                        Require reviewer approval
                      </Label>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Proofs must be explicitly approved by a Workstream Lead or Program Owner before counting
                        toward GREEN. Recommended for all units. (Default: on)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="requires_reference_number"
                      checked={formData.requires_reference_number}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, requires_reference_number: checked as boolean })
                      }
                      className="border-gray-600 mt-0.5"
                    />
                    <div>
                      <Label
                        htmlFor="requires_reference_number"
                        className="text-gray-300 font-medium cursor-pointer"
                      >
                        Require reference number
                      </Label>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Each proof must include a structured reference (permit number, certificate ID, invoice ref,
                        etc.) to be counted. Enable for regulatory or contractual evidence.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="requires_expiry_date"
                      checked={formData.requires_expiry_date}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, requires_expiry_date: checked as boolean })
                      }
                      className="border-gray-600 mt-0.5"
                    />
                    <div>
                      <Label
                        htmlFor="requires_expiry_date"
                        className="text-gray-300 font-medium cursor-pointer"
                      >
                        Require expiry date (time-bound proofs)
                      </Label>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Each proof must include a validity expiry date. Expired proofs are automatically
                        revoked and the unit reverts to RED. Enable for permits, certifications, or
                        time-bound licences.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Urgency Alert Settings Section */}
              <div className="pt-6 border-t border-gray-800">
                <div
                  className="flex items-center justify-between mb-4 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setShowAdvancedAlerts(!showAdvancedAlerts)}
                >
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-orange-400" />
                    <h3 className="text-white font-semibold">Urgency Alert Settings</h3>
                    <span className="text-xs text-gray-500">(Optional - Click to customize)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {formData.urgency_alerts_enabled ? 'Enabled (50%, 75%, 90%)' : 'Disabled'}
                    </span>
                    {showAdvancedAlerts ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {showAdvancedAlerts && (
                  <>
                    <p className="text-sm text-gray-400 mb-4">
                      Automatic notifications will be sent to team leads and managers as the deadline approaches.
                      Set when alerts should trigger based on percentage of time elapsed.
                    </p>

                    <div className="flex items-center gap-2 mb-4">
                      <Checkbox
                        id="urgency_alerts_enabled"
                        checked={formData.urgency_alerts_enabled}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, urgency_alerts_enabled: checked as boolean })
                        }
                        className="border-gray-600"
                      />
                      <Label
                        htmlFor="urgency_alerts_enabled"
                        className="text-gray-300 font-normal cursor-pointer"
                      >
                        Enable Alerts
                      </Label>
                    </div>
                  </>
                )}

                {showAdvancedAlerts && formData.urgency_alerts_enabled && (
                  <div className="space-y-4 bg-black/20 p-4 rounded-lg border border-gray-700">
                    <div className="space-y-2">
                      <Label htmlFor="urgency_level_1" className="text-gray-300 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-400 text-xs flex items-center justify-center font-bold">1</span>
                        First Alert (Workstream Lead)
                      </Label>
                      <div className="flex items-center gap-3">
                        <Input
                          id="urgency_level_1"
                          type="number"
                          min="10"
                          max="90"
                          step="5"
                          value={formData.urgency_level_1}
                          onChange={(e) => setFormData({ ...formData, urgency_level_1: parseInt(e.target.value) || 50 })}
                          className="bg-black/40 border-gray-700 text-white w-24"
                        />
                        <span className="text-gray-400 text-sm">% of time elapsed</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Alert when {formData.urgency_level_1}% of the time between creation and deadline has passed
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="urgency_level_2" className="text-gray-300 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs flex items-center justify-center font-bold">2</span>
                        Second Alert (Program Owner + Lead)
                      </Label>
                      <div className="flex items-center gap-3">
                        <Input
                          id="urgency_level_2"
                          type="number"
                          min="10"
                          max="95"
                          step="5"
                          value={formData.urgency_level_2}
                          onChange={(e) => setFormData({ ...formData, urgency_level_2: parseInt(e.target.value) || 75 })}
                          className="bg-black/40 border-gray-700 text-white w-24"
                        />
                        <span className="text-gray-400 text-sm">% of time elapsed</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Alert when {formData.urgency_level_2}% of the time between creation and deadline has passed
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="urgency_level_3" className="text-gray-300 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 text-xs flex items-center justify-center font-bold">3</span>
                        Critical Alert (Platform Admin + Owner)
                      </Label>
                      <div className="flex items-center gap-3">
                        <Input
                          id="urgency_level_3"
                          type="number"
                          min="10"
                          max="100"
                          step="5"
                          value={formData.urgency_level_3}
                          onChange={(e) => setFormData({ ...formData, urgency_level_3: parseInt(e.target.value) || 90 })}
                          className="bg-black/40 border-gray-700 text-white w-24"
                        />
                        <span className="text-gray-400 text-sm">% of time elapsed</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Alert when {formData.urgency_level_3}% of the time between creation and deadline has passed
                      </p>
                    </div>

                    <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 mt-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-blue-300">
                          Alerts are sent via email and in-app notifications. Each level notifies progressively higher authority to ensure timely attention.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
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
