'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft,
  Camera,
  Video as VideoIcon,
  RotateCcw,
  Square,
  Circle,
  FileText,
  Upload,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/firebase';

type ProofType = 'photo' | 'video' | 'document';

// Governance document file types — permits, RFPs, Pre-Qualification, ToR, contracts, etc.
const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx';
const DOCUMENT_MIME_TYPES: Record<string, string> = {
  pdf:  'application/pdf',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:  'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const DOCUMENT_CATEGORIES: { value: string; label: string; description: string }[] = [
  { value: 'permit',            label: 'Permit / Licence',           description: 'Government or authority-issued permit, operating licence, or regulatory approval' },
  { value: 'rfp',               label: 'RFP / RFQ',                  description: 'Request for Proposal, Request for Quotation, or tender document' },
  { value: 'pre_qualification', label: 'Pre-Qualification',          description: 'Vendor or contractor pre-qualification document' },
  { value: 'terms_of_reference',label: 'Terms of Reference',         description: 'Project scope, terms of reference, or statement of work' },
  { value: 'contract',          label: 'Contract / Agreement',       description: 'Signed contract, MOU, or formal agreement' },
  { value: 'certificate',       label: 'Certificate / Accreditation',description: 'Professional certificate, compliance certificate, or accreditation' },
  { value: 'insurance',         label: 'Insurance Document',         description: 'Liability, indemnity, or professional indemnity insurance certificate' },
  { value: 'financial',         label: 'Financial Document',         description: 'BOQ, invoice, payment certificate, or financial schedule' },
  { value: 'other',             label: 'Other Governance Document',  description: 'Any other document that serves as verifiable governance evidence' },
];

async function computeSHA256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function UploadProofPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const unitId = params.id as string;
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');

  // Pre-select proof type from URL query param (?type=document, ?type=video, etc.)
  const initialType = (searchParams.get('type') as ProofType | null) ?? 'photo';
  const [proofType, setProofType] = useState<ProofType>(
    ['photo', 'video', 'document'].includes(initialType) ? initialType : 'photo'
  );

  // Camera/video state (existing)
  const [capturedMedia, setCapturedMedia] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Document state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [hashLoading, setHashLoading] = useState(false);
  const [documentCategory, setDocumentCategory] = useState<string>('');

  // Unit proof configuration (fetched on load)
  const [unitConfig, setUnitConfig] = useState<{
    requires_reference_number: boolean;
    requires_expiry_date: boolean;
  } | null>(null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch unit configuration for proof requirements
  useEffect(() => {
    async function fetchUnitConfig() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const response = await fetch(`/api/units/${unitId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (response.ok) {
          const unit = await response.json();
          setUnitConfig({
            requires_reference_number: unit.requires_reference_number ?? false,
            requires_expiry_date: unit.requires_expiry_date ?? false,
          });
        }
      } catch {
        // Non-fatal — fields become optional if we can't fetch config
      }
    }
    if (unitId) fetchUnitConfig();
  }, [unitId]);

  // Update timestamp every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Start camera when proof type changes (photo/video only)
  useEffect(() => {
    if (proofType !== 'document' && !capturedMedia) {
      startCamera();
    }
    return () => {
      stopCamera();
      stopRecording();
    };
  }, [proofType]);

  async function startCamera() {
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: proofType === 'video' ? 1280 : 1920 },
          height: { ideal: proofType === 'video' ? 720 : 1080 },
          frameRate: { ideal: proofType === 'video' ? 30 : 60 },
        },
      };
      if (proofType === 'video') {
        constraints.audio = {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        };
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('Failed to access camera. Please grant camera permissions.');
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Timestamp watermark
    const timestamp = currentTime.toLocaleString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const fontSize = Math.floor(canvas.height / 20);
    context.font = `bold ${fontSize}px Arial`;
    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
    context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    context.lineWidth = 3;
    const padding = 20;
    const textMetrics = context.measureText(timestamp);
    const x = canvas.width - textMetrics.width - padding;
    const y = canvas.height - padding;
    context.strokeText(timestamp, x, y);
    context.fillText(timestamp, x, y);

    const imageData = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedMedia(imageData);
    stopCamera();
    toast.success('Photo captured with timestamp');
  }

  function startVideoRecording() {
    if (!stream) return;
    recordedChunksRef.current = [];
    const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=h264,opus', 'video/webm'];
    let selectedMimeType = 'video/webm';
    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType;
        break;
      }
    }
    try {
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 2500000,
      });
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: selectedMimeType });
        const videoURL = URL.createObjectURL(blob);
        setCapturedMedia(videoURL);
        stopCamera();
        toast.success('Video recorded');
      };
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start video recording');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  }

  function retakeMedia() {
    setCapturedMedia(null);
    setRecordingDuration(0);
    startCamera();
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Document file selection + hash computation
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setFileHash(null);
    setHashLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const hash = await computeSHA256(buffer);
      setFileHash(hash);
      toast.success('File integrity hash computed');
    } catch {
      toast.error('Failed to compute file hash');
    } finally {
      setHashLoading(false);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (proofType !== 'document' && !capturedMedia) {
      toast.error(`Please capture a ${proofType} first`);
      return;
    }
    if (proofType === 'document' && !selectedFile) {
      toast.error('Please select a document file');
      return;
    }
    if (proofType === 'document' && !documentCategory) {
      toast.error('Please select a document category (e.g. Permit, RFP, Pre-Qualification)');
      return;
    }

    // Validate required governance fields
    if (unitConfig?.requires_reference_number && !referenceNumber.trim()) {
      toast.error('This unit requires a reference number for each proof');
      return;
    }
    if (unitConfig?.requires_expiry_date && !expiryDate) {
      toast.error('This unit requires an expiry date for each proof');
      return;
    }

    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }
      const token = session.access_token;

      let uploadPath: string;
      let fileMimeType: string;
      let fileForUpload: File;
      let originalFileName: string;

      const timestamp = Date.now();

      if (proofType === 'document') {
        const ext = selectedFile!.name.split('.').pop()?.toLowerCase() || 'pdf';
        originalFileName = selectedFile!.name;
        uploadPath = `${unitId}/${timestamp}.${ext}`;
        fileMimeType = DOCUMENT_MIME_TYPES[ext] || selectedFile!.type || 'application/octet-stream';
        fileForUpload = new File([selectedFile!], uploadPath, { type: fileMimeType });
      } else if (proofType === 'photo') {
        originalFileName = `proof_${timestamp}.jpg`;
        uploadPath = `${unitId}/${timestamp}.jpg`;
        fileMimeType = 'image/jpeg';
        const response = await fetch(capturedMedia!);
        const blob = await response.blob();
        fileForUpload = new File([blob], uploadPath, { type: 'image/jpeg' });
      } else {
        originalFileName = `proof_${timestamp}.webm`;
        uploadPath = `${unitId}/${timestamp}.webm`;
        fileMimeType = 'video/webm';
        const response = await fetch(capturedMedia!);
        const blob = await response.blob();
        fileForUpload = new File([blob], uploadPath, { type: 'video/webm' });
      }

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('proofs')
        .upload(uploadPath, fileForUpload);

      if (uploadError) throw uploadError;

      // Build proof payload
      const proofPayload: Record<string, any> = {
        type: proofType,
        file_path: uploadData.path,
        notes: notes || null,
        captured_at: proofType !== 'document' ? currentTime.toISOString() : null,
        // Integrity fields
        file_name: originalFileName,
        file_size: fileForUpload.size,
        mime_type: fileMimeType,
        file_hash: fileHash || null,
        // Governance structured fields
        document_category: proofType === 'document' ? documentCategory : null,
        reference_number: referenceNumber.trim() || null,
        expiry_date: expiryDate || null,
      };

      const proofResponse = await fetch(`/api/units/${unitId}/proofs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(proofPayload),
      });

      const data = await proofResponse.json();
      if (!proofResponse.ok) {
        throw new Error(data.error || 'Failed to upload proof');
      }

      toast.success('Proof uploaded successfully');
      router.back();
    } catch (error: any) {
      console.error('Error uploading proof:', error);
      toast.error(error.message || 'Failed to upload proof');
    } finally {
      setLoading(false);
    }
  }

  const isDocumentMode = proofType === 'document';
  const canSubmit = isDocumentMode ? !!selectedFile : !!capturedMedia;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => {
              stopCamera();
              stopRecording();
              router.back();
            }}
            variant="outline"
            className="bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-black text-white">Upload Proof</h1>
            <p className="text-gray-500">Capture timestamped evidence or upload a governance document</p>
          </div>
        </div>

        <Card className="bg-black/25 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Proof Submission</CardTitle>
            <CardDescription className="text-gray-400">
              {isDocumentMode
                ? 'Upload a PDF, Word, or Excel document as traceable governance evidence'
                : proofType === 'photo'
                ? 'Photo will be automatically timestamped for verification'
                : 'Video will be recorded with audio'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Proof Type Selection */}
              {!capturedMedia && !selectedFile && (
                <div className="space-y-2">
                  <Label htmlFor="proofType" className="text-gray-300">
                    Proof Type <span className="text-red-400">*</span>
                  </Label>
                  <Select
                    value={proofType}
                    onValueChange={(value) => {
                      stopCamera();
                      stopRecording();
                      setCapturedMedia(null);
                      setSelectedFile(null);
                      setFileHash(null);
                      setProofType(value as ProofType);
                    }}
                  >
                    <SelectTrigger className="bg-black/40 border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-950 border-gray-700">
                      <SelectItem value="photo" className="text-white">
                        <div className="flex items-center gap-2">
                          <Camera className="w-4 h-4" />
                          Photo
                        </div>
                      </SelectItem>
                      <SelectItem value="video" className="text-white">
                        <div className="flex items-center gap-2">
                          <VideoIcon className="w-4 h-4" />
                          Video
                        </div>
                      </SelectItem>
                      <SelectItem value="document" className="text-white">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Document (PDF, DOCX, XLSX)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* ── DOCUMENT MODE ── */}
              {isDocumentMode && (
                <div className="space-y-4">
                  {/* Document Category */}
                  <div className="space-y-2">
                    <Label htmlFor="document_category" className="text-gray-300">
                      Document Category <span className="text-red-400">*</span>
                    </Label>
                    <Select
                      value={documentCategory}
                      onValueChange={setDocumentCategory}
                    >
                      <SelectTrigger className="bg-black/40 border-gray-700 text-white">
                        <SelectValue placeholder="Select document type…" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-950 border-gray-700">
                        {DOCUMENT_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value} className="text-white">
                            <div>
                              <div className="font-medium">{cat.label}</div>
                              <div className="text-xs text-gray-400">{cat.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                      Governance documents include permits, RFPs, pre-qualification docs, contracts, certificates, and similar verifiable evidence.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-300">
                      Document File <span className="text-red-400">*</span>
                    </Label>
                    {!selectedFile ? (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-all"
                      >
                        <Upload className="w-10 h-10 text-gray-500 mx-auto mb-3" />
                        <p className="text-gray-400">Click to select a PDF, DOCX, or XLSX file</p>
                        <p className="text-gray-600 text-xs mt-1">Maximum 100MB</p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept={DOCUMENT_ACCEPT}
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                      </div>
                    ) : (
                      <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <FileText className="w-8 h-8 text-blue-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">{selectedFile.name}</p>
                            <p className="text-gray-500 text-xs">
                              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedFile(null);
                              setFileHash(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="bg-black/25 border-gray-700 text-gray-300"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Change
                          </Button>
                        </div>

                        {/* Hash display */}
                        {hashLoading && (
                          <p className="text-yellow-400 text-xs flex items-center gap-2">
                            <span className="animate-pulse">Computing integrity hash...</span>
                          </p>
                        )}
                        {fileHash && !hashLoading && (
                          <div className="flex items-center gap-2 bg-green-900/20 border border-green-800/50 rounded p-2">
                            <ShieldCheck className="w-4 h-4 text-green-400 shrink-0" />
                            <div>
                              <p className="text-green-400 text-xs font-medium">Integrity hash computed</p>
                              <p className="text-gray-500 text-xs font-mono">{fileHash.slice(0, 16)}…</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── CAMERA MODE (photo/video) — UNCHANGED ── */}
              {!isDocumentMode && (
                <div className="space-y-2">
                  <Label className="text-gray-300">
                    {proofType === 'photo' ? 'Photo' : 'Video'} <span className="text-red-400">*</span>
                  </Label>
                  <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                    {!capturedMedia ? (
                      <>
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                        {proofType === 'photo' && (
                          <div className="absolute bottom-4 right-4 bg-black/70 text-white px-3 py-2 rounded font-mono text-sm">
                            {currentTime.toLocaleString('en-US', {
                              year: 'numeric', month: '2-digit', day: '2-digit',
                              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                            })}
                          </div>
                        )}
                        {isRecording && (
                          <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-3 py-2 rounded-full">
                            <Circle className="w-3 h-3 fill-white animate-pulse" />
                            <span className="font-mono text-sm">REC {formatDuration(recordingDuration)}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      proofType === 'photo' ? (
                        <img src={capturedMedia} alt="Captured proof" className="w-full h-full object-contain" />
                      ) : (
                        <video src={capturedMedia} controls className="w-full h-full object-contain" />
                      )
                    )}
                  </div>
                  <canvas ref={canvasRef} className="hidden" />

                  <div className="flex gap-2">
                    {!capturedMedia ? (
                      proofType === 'photo' ? (
                        <Button
                          type="button"
                          onClick={capturePhoto}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          disabled={!stream}
                        >
                          <Camera className="w-4 h-4 mr-2" />
                          Capture Photo
                        </Button>
                      ) : (
                        !isRecording ? (
                          <Button
                            type="button"
                            onClick={startVideoRecording}
                            className="w-full bg-red-600 hover:bg-red-700 text-white"
                            disabled={!stream}
                          >
                            <Circle className="w-4 h-4 mr-2" />
                            Start Recording
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            onClick={stopRecording}
                            className="w-full bg-gray-600 hover:bg-gray-700 text-white"
                          >
                            <Square className="w-4 h-4 mr-2" />
                            Stop Recording
                          </Button>
                        )
                      )
                    ) : (
                      <Button
                        type="button"
                        onClick={retakeMedia}
                        variant="outline"
                        className="w-full bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Retake {proofType === 'photo' ? 'Photo' : 'Video'}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* ── GOVERNANCE STRUCTURED FIELDS (conditional on unit config) ── */}
              {unitConfig?.requires_reference_number && (
                <div className="space-y-2">
                  <Label htmlFor="reference_number" className="text-gray-300">
                    Reference Number <span className="text-red-400">*</span>
                    <span className="text-gray-500 text-xs ml-2">(permit, certificate, or invoice ID)</span>
                  </Label>
                  <Input
                    id="reference_number"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="e.g. PERMIT-2026-00123"
                    className="bg-black/40 border-gray-700 text-white"
                  />
                </div>
              )}

              {unitConfig?.requires_expiry_date && (
                <div className="space-y-2">
                  <Label htmlFor="expiry_date" className="text-gray-300">
                    Expiry Date <span className="text-red-400">*</span>
                    <span className="text-gray-500 text-xs ml-2">(permit/certificate validity end date)</span>
                  </Label>
                  <Input
                    id="expiry_date"
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="bg-black/40 border-gray-700 text-white"
                  />
                </div>
              )}

              {/* Optional reference/expiry for units that don't require but allow */}
              {!unitConfig?.requires_reference_number && (
                <div className="space-y-2">
                  <Label htmlFor="reference_number_opt" className="text-gray-300">
                    Reference Number <span className="text-gray-500 text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="reference_number_opt"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Permit, certificate, or invoice ID (if applicable)"
                    className="bg-black/40 border-gray-700 text-white"
                  />
                </div>
              )}

              {!unitConfig?.requires_expiry_date && (
                <div className="space-y-2">
                  <Label htmlFor="expiry_date_opt" className="text-gray-300">
                    Expiry Date <span className="text-gray-500 text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="expiry_date_opt"
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="bg-black/40 border-gray-700 text-white"
                  />
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-gray-300">
                  Notes <span className="text-gray-500 text-xs">(optional)</span>
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes or context about this proof..."
                  className="bg-black/40 border-gray-700 text-white min-h-[80px]"
                />
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={loading || !canSubmit}
                  className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                >
                  {loading ? 'Uploading...' : 'Submit Proof'}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    stopRecording();
                    router.back();
                  }}
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
