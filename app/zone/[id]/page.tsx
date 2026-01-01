'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  getZone,
  getProofsByZone,
  getUpdatesByZone,
  uploadProof,
  createUpdate,
  requiresProof,
} from '@/lib/firestore-utils';
import { Zone, Proof, Update, ZoneStatus } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ArrowLeft, Upload, Image as ImageIcon } from 'lucide-react';
import { toDate } from '@/lib/utils';

export default function ZoneDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { userData, loading: authLoading } = useAuth();

  const zoneId = params.id as string;
  const view = searchParams.get('view') || 'supervisor';
  const isReadOnly = view === 'client' || userData?.role === 'client';

  const [zone, setZone] = useState<Zone | null>(null);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedProofId, setUploadedProofId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<ZoneStatus | ''>('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{lat: number, lon: number} | null>(null);
  const [captureTimestamp, setCaptureTimestamp] = useState<string>('');
  const [showCameraDialog, setShowCameraDialog] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const [selectedProof, setSelectedProof] = useState<Proof | null>(null);
  const [showProofDialog, setShowProofDialog] = useState(false);

  useEffect(() => {
    if (!authLoading && !userData) {
      router.push('/login');
    }
  }, [userData, authLoading, router]);

  useEffect(() => {
    if (stream && showCameraDialog) {
      // Wait for video element to be rendered in the DOM
      const timer = setTimeout(() => {
        const video = document.getElementById('camera-video') as HTMLVideoElement;
        if (video) {
          video.srcObject = stream;
          video.play().catch(err => console.error('Error playing video:', err));
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [stream, showCameraDialog]);

  useEffect(() => {
    async function loadData() {
      try {
        const [zoneData, proofsData, updatesData] = await Promise.all([
          getZone(zoneId),
          getProofsByZone(zoneId),
          getUpdatesByZone(zoneId),
        ]);

        setZone(zoneData);
        setProofs(proofsData);
        setUpdates(updatesData);
      } catch (error) {
        console.error('Error loading zone data:', error);
        toast.error('Failed to load zone data');
      } finally {
        setLoading(false);
      }
    }

    if (zoneId) {
      loadData();
    }
  }, [zoneId]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      setStream(mediaStream);
      setShowCameraDialog(true);

      // Capture GPS location when camera opens
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setGpsCoords({
              lat: position.coords.latitude,
              lon: position.coords.longitude
            });
            toast.success('📍 Location captured');
          },
          (error) => {
            console.error('Error getting location:', error);
            toast.error('Could not get GPS location');
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('Could not access camera. Please grant camera permissions.');
    }
  };

  const capturePhoto = () => {
    const video = document.getElementById('camera-video') as HTMLVideoElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedImage(imageData);

      // Capture timestamp
      const timestamp = new Date().toISOString();
      setCaptureTimestamp(timestamp);

      // Stop camera
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }

      // Convert to File
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `proof-${Date.now()}.jpg`, { type: 'image/jpeg' });
          setSelectedFile(file);
        }
      }, 'image/jpeg', 0.9);

      toast.success('📸 Photo captured with GPS & timestamp');
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setSelectedFile(null);
    startCamera();
  };

  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCameraDialog(false);
    setCapturedImage(null);
  };

  const handleUploadProof = async () => {
    if (!selectedFile || !zone || !userData) return;

    setUploading(true);
    try {
      // Build metadata note with timestamp and GPS
      let metadataNote = note;
      if (captureTimestamp) {
        const formattedTime = format(new Date(captureTimestamp), 'MMM d, yyyy HH:mm:ss');
        metadataNote = metadataNote ? `${metadataNote} | Captured: ${formattedTime}` : `Captured: ${formattedTime}`;
      }
      if (gpsCoords) {
        metadataNote += ` | GPS: ${gpsCoords.lat.toFixed(6)}, ${gpsCoords.lon.toFixed(6)}`;
      }

      const proof = await uploadProof(
        selectedFile,
        zone.projectId,
        zone.id,
        userData.uid,
        userData.email,
        metadataNote
      );

      setProofs([proof, ...proofs]);
      setUploadedProofId(proof.id);
      setSelectedFile(null);
      setGpsCoords(null);
      setCaptureTimestamp('');
      toast.success('Proof uploaded with timestamp & GPS');

      const fileInput = document.getElementById('proof-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error) {
      console.error('Error uploading proof:', error);
      toast.error('Failed to upload proof');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveUpdate = async () => {
    if (!zone || !userData || !newStatus) return;

    const needsProof = requiresProof(zone.status, newStatus);
    if (needsProof && !uploadedProofId) {
      toast.error('Upload proof to change status');
      return;
    }

    setSaving(true);
    try {
      const update = await createUpdate(
        zone.projectId,
        zone.id,
        zone.status,
        newStatus,
        userData.uid,
        userData.email,
        'STATUS_CHANGE',
        uploadedProofId || undefined,
        note || undefined
      );

      setUpdates([update, ...updates]);
      setZone({ ...zone, status: newStatus });
      setNewStatus('');
      setNote('');
      setUploadedProofId(null);

      toast.success(`Status updated: ${zone.status} → ${newStatus}`);
    } catch (error) {
      console.error('Error saving update:', error);
      toast.error('Failed to save update');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (isReadOnly) {
      router.push('/client');
    } else {
      router.push('/supervisor');
    }
  };

  const handleProofClick = (proof: Proof) => {
    setSelectedProof(proof);
    setShowProofDialog(true);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!zone) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">Zone not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b0e14] via-[#121826] to-[#0b0e14]">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="border-gray-700 bg-gray-800/50 hover:bg-gray-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">{zone.name}</h1>
            <p className="text-sm text-gray-400">{zone.deliverable}</p>
          </div>
          <Badge
            className={
              zone.status === 'RED'
                ? 'border-red-500/40 bg-red-500/12 text-red-200'
                : 'border-green-500/40 bg-green-500/12 text-green-200'
            }
          >
            {zone.status}
          </Badge>
          {zone.isEscalated && (
            <Badge className="border-amber-500/40 bg-amber-500/12 text-amber-200">
              ⚠ {zone.escalationLevel}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card className="bg-[#121826]/90 border-[#23304a] backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">Acceptance Criteria</CardTitle>
                <Badge className="w-fit">READ-ONLY</Badge>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {zone.acceptanceCriteria.map((criteria, index) => (
                    <li key={index} className="flex items-start gap-2 text-gray-300">
                      <span className="text-blue-400 mt-1">•</span>
                      <span>{criteria}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-[#121826]/90 border-[#23304a] backdrop-blur">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">Proof Gallery</CardTitle>
                  <Badge className="border-blue-500/40 bg-blue-500/12 text-blue-200">
                    {proofs.length} items
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {proofs.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {proofs.map((proof) => (
                      <div
                        key={proof.id}
                        className="relative aspect-square rounded-lg border border-gray-800 overflow-hidden cursor-pointer hover:border-blue-500 transition-colors"
                        onClick={() => handleProofClick(proof)}
                      >
                        {proof.mediaType.startsWith('image/') ? (
                          <img
                            src={proof.url}
                            alt="Proof"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-gray-600" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No proof uploaded yet</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {!isReadOnly && (
              <Card className="bg-[#121826]/90 border-[#23304a] backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-white">Update Zone</CardTitle>
                  <Badge className="w-fit border-green-500/40 bg-green-500/12 text-green-200">
                    PROOF-FIRST ENFORCED
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!selectedFile ? (
                    <Button
                      onClick={startCamera}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      📸 Open Camera
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      {capturedImage && (
                        <img
                          src={capturedImage}
                          alt="Captured proof"
                          className="w-full rounded-lg border border-gray-700"
                        />
                      )}
                      <div className="flex gap-2">
                        <Button
                          onClick={retakePhoto}
                          variant="outline"
                          className="flex-1"
                        >
                          Retake
                        </Button>
                        <Button
                          onClick={handleUploadProof}
                          disabled={uploading}
                          className="flex-1"
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          {uploading ? 'Uploading...' : 'Upload'}
                        </Button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 text-center">
                    📍 GPS location and timestamp captured automatically
                  </p>

                  <div className="border-t border-gray-800 pt-4 space-y-4">
                    <div className="space-y-2">
                      <Label>New Status</Label>
                      <Select
                        value={newStatus}
                        onValueChange={(value) => setNewStatus(value as ZoneStatus)}
                        disabled={!uploadedProofId}
                      >
                        <SelectTrigger className="bg-black/25 border-gray-700">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RED">RED</SelectItem>
                          <SelectItem value="GREEN">GREEN</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="note">Note (optional)</Label>
                      <Textarea
                        id="note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Example: 'Painter incomplete at 14:05'"
                        maxLength={200}
                        className="bg-black/25 border-gray-700"
                      />
                      <p className="text-xs text-gray-500">{note.length}/200 characters</p>
                    </div>

                    <Button
                      onClick={handleSaveUpdate}
                      disabled={!newStatus || saving}
                      className="w-full"
                    >
                      {saving ? 'Saving...' : 'Save Update'}
                    </Button>

                    <p className="text-xs text-gray-500">
                      Rule: GREEN requires proof. RED→GREEN requires proof.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-[#121826]/90 border-[#23304a] backdrop-blur">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">Update History</CardTitle>
                  <Badge className="border-blue-500/40 bg-blue-500/12 text-blue-200">
                    {updates.length} records
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {updates.length > 0 ? (
                  <div className="space-y-3">
                    {updates.map((update) => (
                      <div
                        key={update.id}
                        className="p-4 bg-black/25 border border-gray-800 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-white">
                            {update.previousStatus} → {update.newStatus}
                          </span>
                          <Badge className="text-xs">
                            {format(toDate(update.createdAt), 'MMM d, HH:mm')}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-400 space-y-1">
                          <p>By: {update.byEmail}</p>
                          {update.note && <p>Note: {update.note}</p>}
                          {update.proofId && (
                            <Badge className="border-blue-500/40 bg-blue-500/12 text-blue-200 text-xs">
                              Proof attached
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No updates yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={showCameraDialog} onOpenChange={closeCamera}>
        <DialogContent className="max-w-4xl bg-[#0f1522] border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">📸 Capture Proof</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!capturedImage ? (
              <div className="relative">
                <video
                  id="camera-video"
                  autoPlay
                  playsInline
                  className="w-full rounded-lg border border-gray-700"
                />
                <Button
                  onClick={capturePhoto}
                  className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white hover:bg-gray-200 text-black font-bold px-8 py-6 rounded-full"
                >
                  📸 Capture
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <img
                  src={capturedImage}
                  alt="Captured proof"
                  className="w-full rounded-lg border border-gray-700"
                />
                <div className="flex gap-3">
                  <Button
                    onClick={retakePhoto}
                    variant="outline"
                    className="flex-1"
                  >
                    🔄 Retake
                  </Button>
                  <Button
                    onClick={() => {
                      setShowCameraDialog(false);
                    }}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    ✓ Use This Photo
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showProofDialog} onOpenChange={setShowProofDialog}>
        <DialogContent className="max-w-4xl bg-[#0f1522] border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">Proof Details</DialogTitle>
          </DialogHeader>
          {selectedProof && (
            <div className="space-y-4">
              {selectedProof.mediaType.startsWith('image/') ? (
                <img
                  src={selectedProof.url}
                  alt="Proof"
                  className="w-full rounded-lg border border-gray-800"
                />
              ) : (
                <video
                  src={selectedProof.url}
                  controls
                  className="w-full rounded-lg border border-gray-800"
                />
              )}
              <div className="text-sm text-gray-400 space-y-1">
                <p>Uploaded: {format(toDate(selectedProof.createdAt), 'MMM d, yyyy HH:mm')}</p>
                <p>By: {selectedProof.uploadedByEmail}</p>
                {selectedProof.note && <p>Note: {selectedProof.note}</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
