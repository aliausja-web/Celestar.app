'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft, Info, Bell, ChevronDown, ChevronUp, Shield,
  Mic, Square, Play, Pause, Trash2, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/firebase';

export default function NewUnitPage() {
  const router = useRouter();
  const params = useParams();
  const workstreamId = params?.id as string | undefined;

  const [loading, setLoading] = useState(false);
  const [showAdvancedAlerts, setShowAdvancedAlerts] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // Voice recorder
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    management_notes: '',
    owner: '',
    deadline: '',
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

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [audioUrl]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch {
      toast.error('Microphone access denied. Please allow microphone permissions.');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function deleteRecording() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingSeconds(0);
    setIsPlaying(false);
  }

  function formatSeconds(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }

  async function uploadVoiceNote(): Promise<string | null> {
    if (!audioBlob || !workstreamId) return null;
    try {
      const filename = `${workstreamId}/${Date.now()}.webm`;
      const { error } = await supabase.storage
        .from('voice-notes')
        .upload(filename, audioBlob, { contentType: 'audio/webm' });
      if (error) throw error;
      const { data } = supabase.storage.from('voice-notes').getPublicUrl(filename);
      return data.publicUrl;
    } catch {
      toast.warning('Voice note could not be saved — unit will be created without it.');
      return null;
    }
  }

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
      if (sessionError || !session) throw new Error('Not authenticated. Please log in again.');

      const token = session.access_token;
      const voiceNoteUrl = await uploadVoiceNote();

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
          management_notes: formData.management_notes || null,
          voice_note_url: voiceNoteUrl,
          owner: formData.owner || null,
          deadline: formData.deadline || null,
          required_proof_count: formData.required_proof_count,
          required_proof_types: formData.required_proof_types,
          requires_reviewer_approval: formData.requires_reviewer_approval,
          requires_reference_number: formData.requires_reference_number,
          requires_expiry_date: formData.requires_expiry_date,
          escalation_config: {
            enabled: formData.urgency_alerts_enabled,
            thresholds: [
              { level: 1, percentage_elapsed: formData.urgency_level_1, target_roles: ['WORKSTREAM_LEAD'] },
              { level: 2, percentage_elapsed: formData.urgency_level_2, target_roles: ['PROGRAM_OWNER', 'WORKSTREAM_LEAD'] },
              { level: 3, percentage_elapsed: formData.urgency_level_3, target_roles: ['PLATFORM_ADMIN', 'PROGRAM_OWNER'] },
            ],
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create unit');

      toast.success('Unit created successfully');
      const createAnother = confirm('Unit created! Would you like to create another unit for this workstream?');

      if (createAnother) {
        deleteRecording();
        setFormData({
          name: '', description: '', management_notes: '', owner: '', deadline: '',
          required_proof_count: 1, required_proof_types: ['photo'] as string[],
          requires_reviewer_approval: true, requires_reference_number: false, requires_expiry_date: false,
          urgency_alerts_enabled: true, urgency_level_1: 50, urgency_level_2: 75, urgency_level_3: 90,
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

        {/* Header */}
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

              {/* Unit Name */}
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

              {/* Deadline */}
              <div className="space-y-2">
                <Label htmlFor="deadline" className="text-gray-300">Deadline</Label>
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  className="bg-black/40 border-gray-700 text-white"
                />
              </div>

              {/* Notes from Management */}
              <div className="pt-2 border-t border-gray-800">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                  <h3 className="text-white font-semibold">Notes from Management</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Leave voice and written guidance for the field team — requirements, acceptance criteria, and instructions they need before starting.
                </p>

                {/* Voice recorder */}
                <div className="bg-black/30 border border-gray-700 rounded-lg p-4 mb-3">
                  <div className="flex items-center gap-3 flex-wrap">

                    {/* Idle — no recording yet */}
                    {!audioUrl && !isRecording && (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600/15 border border-blue-500/35 text-blue-400 hover:bg-blue-600/25 transition-colors text-sm font-medium"
                      >
                        <Mic className="w-4 h-4" />
                        Record Voice Note
                      </button>
                    )}

                    {/* Recording in progress */}
                    {isRecording && (
                      <div className="flex items-center gap-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                        <span className="text-red-400 font-mono text-sm tabular-nums">
                          {formatSeconds(recordingSeconds)}
                        </span>
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500/40 text-red-400 hover:bg-red-600/30 transition-colors text-sm"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                          Stop
                        </button>
                      </div>
                    )}

                    {/* Recording saved */}
                    {audioUrl && !isRecording && (
                      <div className="flex items-center gap-3">
                        <audio
                          ref={audioRef}
                          src={audioUrl}
                          onEnded={() => setIsPlaying(false)}
                          className="hidden"
                        />
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-600/10 border border-green-500/25">
                          <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                          <span className="text-green-400 text-sm font-medium">Voice note recorded</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (!audioRef.current) return;
                            if (isPlaying) {
                              audioRef.current.pause();
                              setIsPlaying(false);
                            } else {
                              audioRef.current.play();
                              setIsPlaying(true);
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700/50 border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors text-sm"
                        >
                          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          {isPlaying ? 'Pause' : 'Play'}
                        </button>
                        <button
                          type="button"
                          onClick={deleteRecording}
                          title="Delete recording"
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Written notes */}
                <Textarea
                  value={formData.management_notes}
                  onChange={(e) => setFormData({ ...formData, management_notes: e.target.value })}
                  placeholder="Written notes — requirements, acceptance criteria, guidelines for the field team..."
                  className="bg-black/40 border-gray-700 text-white min-h-[90px]"
                />
              </div>

              {/* Advanced Options */}
              <div className="pt-2 border-t border-gray-800">
                <button
                  type="button"
                  className="flex items-center gap-2 text-gray-400 hover:text-gray-300 transition-colors text-sm"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                >
                  {showAdvancedOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  Advanced Options
                </button>

                {showAdvancedOptions && (
                  <div className="mt-4 space-y-6">

                    {/* Description */}
                    <div className="space-y-2">
                      <Label htmlFor="description" className="text-gray-300">Description</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Brief description of the unit..."
                        className="bg-black/40 border-gray-700 text-white min-h-[100px]"
                      />
                    </div>

                    {/* Owner */}
                    <div className="space-y-2">
                      <Label htmlFor="owner" className="text-gray-300">Owner</Label>
                      <Input
                        id="owner"
                        value={formData.owner}
                        onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                        placeholder="Responsible person or team"
                        className="bg-black/40 border-gray-700 text-white"
                      />
                    </div>

                    {/* Proof Validation Rules — moved here from top-level */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-4 h-4 text-purple-400" />
                        <h4 className="text-white font-semibold">Proof Validation Rules</h4>
                      </div>
                      <p className="text-sm text-gray-400 mb-3">
                        Additional evidence requirements — configure when needed for regulated or contractual units.
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
                            <Label htmlFor="requires_reviewer_approval" className="text-gray-300 font-medium cursor-pointer">
                              Require reviewer approval
                            </Label>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Proofs must be explicitly approved by a Workstream Lead or Program Owner before counting toward GREEN. (Default: on)
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
                            <Label htmlFor="requires_reference_number" className="text-gray-300 font-medium cursor-pointer">
                              Require reference number
                            </Label>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Each proof must include a structured reference (permit number, certificate ID, invoice ref, etc.)
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
                            <Label htmlFor="requires_expiry_date" className="text-gray-300 font-medium cursor-pointer">
                              Require expiry date (time-bound proofs)
                            </Label>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Each proof must include a validity expiry date. Expired proofs are automatically revoked and the unit reverts to RED.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Proof Requirements */}
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
                                setFormData({ ...formData, required_proof_types: [...formData.required_proof_types, type] });
                              } else {
                                setFormData({ ...formData, required_proof_types: formData.required_proof_types.filter((t) => t !== type) });
                              }
                            }}
                            className="border-gray-600"
                          />
                          <Label htmlFor={`type-${type}`} className="text-gray-300 font-normal cursor-pointer capitalize">
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

              {/* Deadline Alerts */}
              <div className="pt-6 border-t border-gray-800">
                <div
                  className="flex items-center justify-between mb-4 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setShowAdvancedAlerts(!showAdvancedAlerts)}
                >
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-orange-400" />
                    <h3 className="text-white font-semibold">Deadline Alerts</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{formData.urgency_alerts_enabled ? 'On' : 'Off'}</span>
                    {showAdvancedAlerts
                      ? <ChevronUp className="w-4 h-4 text-gray-400" />
                      : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>

                {showAdvancedAlerts && (
                  <div className="flex items-center gap-2 mb-4">
                    <Checkbox
                      id="urgency_alerts_enabled"
                      checked={formData.urgency_alerts_enabled}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, urgency_alerts_enabled: checked as boolean })
                      }
                      className="border-gray-600"
                    />
                    <Label htmlFor="urgency_alerts_enabled" className="text-gray-300 font-normal cursor-pointer">
                      Enable Alerts
                    </Label>
                  </div>
                )}

                {showAdvancedAlerts && formData.urgency_alerts_enabled && (
                  <div className="space-y-3 bg-black/20 p-4 rounded-lg border border-gray-700">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center justify-center font-bold shrink-0">1</span>
                          <span className="text-gray-300 font-medium">Workstream Lead</span>
                        </div>
                        <p className="text-gray-500 pl-6">When half the time to deadline has passed</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold shrink-0">2</span>
                          <span className="text-gray-300 font-medium">Program Owner</span>
                        </div>
                        <p className="text-gray-500 pl-6">When three-quarters of the time has passed</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold shrink-0">3</span>
                          <span className="text-gray-300 font-medium">Platform Admin</span>
                        </div>
                        <p className="text-gray-500 pl-6">When 90% of the time has passed</p>
                      </div>
                    </div>

                    <div className="bg-black/30 border border-gray-700 rounded p-3 space-y-1.5">
                      <p className="text-xs text-gray-400 font-medium">How this works for your unit</p>
                      <p className="text-xs text-gray-500">
                        Alert timing is calculated from unit creation to the deadline you set above — so alerts fire at the right moment regardless of whether the deadline is 3 days or 3 months away.
                      </p>
                      <p className="text-xs text-gray-600 italic">
                        e.g. 10-day deadline → alerts on day 5, day 7.5, day 9 &nbsp;·&nbsp; 60-day deadline → alerts on day 30, day 45, day 54
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
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
