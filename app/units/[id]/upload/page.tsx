'use client';

import { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/firebase';
import { useLocale } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/language-switcher';

type ProofType = 'photo' | 'video';

export default function UploadProofPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const unitId = params.id as string;
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');

  // Pre-select proof type from URL query param (?type=video, etc.)
  const initialType = (searchParams.get('type') as ProofType | null) ?? 'photo';
  const [proofType, setProofType] = useState<ProofType>(
    initialType === 'video' ? 'video' : 'photo'
  );

  // Camera/video state
  const [capturedMedia, setCapturedMedia] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);

  // Unit proof configuration (fetched on load)
  const [unitConfig, setUnitConfig] = useState<{
    requires_reference_number: boolean;
    requires_expiry_date: boolean;
  } | null>(null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  // Update timestamp every second (used for watermark and display)
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Stop camera/recording when proof type changes or on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      stopRecording();
    };
  }, [proofType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      stopCamera();
      stopRecording();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startCamera() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      toast.error(t('unitsUpload.errorHttps'));
      return;
    }
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
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      if (!window.isSecureContext) {
        toast.error(t('unitsUpload.errorHttps'));
      } else if (error instanceof DOMException && error.name === 'NotAllowedError') {
        toast.error(t('unitsUpload.errorCameraDenied'));
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        toast.error(t('unitsUpload.errorCameraNotFound'));
      } else {
        toast.error(t('unitsUpload.errorCameraFailed'));
      }
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
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
    toast.success(t('unitsUpload.photoCaptured'));
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
        toast.success(t('unitsUpload.videoRecorded'));
      };
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error(t('unitsUpload.errorVideoRecord'));
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
    setCameraActive(false);
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!capturedMedia) {
      toast.error(t('unitsUpload.errorNoMedia').replace('{type}', proofType));
      return;
    }

    if (unitConfig?.requires_reference_number && !referenceNumber.trim()) {
      toast.error(t('unitsUpload.errorRefRequired'));
      return;
    }
    if (unitConfig?.requires_expiry_date && !expiryDate) {
      toast.error(t('unitsUpload.errorExpiryRequired'));
      return;
    }

    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error(t('unitsUpload.errorNotAuthenticated'));
      }
      const token = session.access_token;

      const timestamp = Date.now();
      let uploadPath: string;
      let fileMimeType: string;
      let originalFileName: string;
      let fileForUpload: File;

      if (proofType === 'photo') {
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

      const proofPayload: Record<string, any> = {
        type: proofType,
        file_path: uploadData.path,
        notes: notes || null,
        captured_at: currentTime.toISOString(),
        file_name: originalFileName,
        file_size: fileForUpload.size,
        mime_type: fileMimeType,
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
        throw new Error(data.error || t('unitsUpload.errorUploadFailed'));
      }

      toast.success(t('unitsUpload.uploadSuccess'));
      router.back();
    } catch (error: any) {
      console.error('Error uploading proof:', error);
      toast.error(error.message || t('unitsUpload.errorUploadFailed'));
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    stopCamera();
    stopRecording();
    router.back();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={handleCancel}
              variant="outline"
              className="bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40"
            >
              <ArrowLeft className="w-4 h-4 me-2" />
              {t('unitsUpload.back')}
            </Button>
            <div>
              <h1 className="text-3xl font-black text-white">{t('unitsUpload.title')}</h1>
              <p className="text-gray-500">{t('unitsUpload.subtitle')}</p>
            </div>
          </div>
          <LanguageSwitcher />
        </div>

        <Card className="bg-black/25 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">{t('unitsUpload.cardTitle')}</CardTitle>
            <CardDescription className="text-gray-400">
              {proofType === 'photo' ? t('unitsUpload.descPhoto') : t('unitsUpload.descVideo')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Proof Type Selection */}
              {!capturedMedia && (
                <div className="space-y-2">
                  <Label htmlFor="proofType" className="text-gray-300">
                    {t('unitsUpload.proofTypeLabel')} <span className="text-red-400">*</span>
                  </Label>
                  <Select
                    value={proofType}
                    onValueChange={(value) => {
                      stopCamera();
                      stopRecording();
                      setCapturedMedia(null);
                      setCameraActive(false);
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
                          {t('unitsUpload.photoOption')}
                        </div>
                      </SelectItem>
                      <SelectItem value="video" className="text-white">
                        <div className="flex items-center gap-2">
                          <VideoIcon className="w-4 h-4" />
                          {t('unitsUpload.videoOption')}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Camera / video capture */}
              <div className="space-y-2">
                <Label className="text-gray-300">
                  {proofType === 'photo' ? t('unitsUpload.photoOption') : t('unitsUpload.videoOption')} <span className="text-red-400">*</span>
                </Label>
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                  {!capturedMedia ? (
                    <>
                      {!cameraActive && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900/80">
                          <Camera className="w-12 h-12 text-gray-500" />
                          <p className="text-gray-400 text-sm">{t('unitsUpload.tapCamera')}</p>
                        </div>
                      )}
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover ${!cameraActive ? 'invisible' : ''}`}
                      />
                      {cameraActive && proofType === 'photo' && (
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
                        onClick={!cameraActive ? startCamera : capturePhoto}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={cameraActive && !stream}
                      >
                        <Camera className="w-4 h-4 me-2" />
                        {t('unitsUpload.capturePhoto')}
                      </Button>
                    ) : (
                      !cameraActive ? (
                        <Button
                          type="button"
                          onClick={startCamera}
                          className="w-full bg-red-600 hover:bg-red-700 text-white"
                        >
                          <Circle className="w-4 h-4 me-2" />
                          {t('unitsUpload.startRecording')}
                        </Button>
                      ) : !isRecording ? (
                        <Button
                          type="button"
                          onClick={startVideoRecording}
                          className="w-full bg-red-600 hover:bg-red-700 text-white"
                          disabled={!stream}
                        >
                          <Circle className="w-4 h-4 me-2" />
                          {t('unitsUpload.startRecording')}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={stopRecording}
                          className="w-full bg-gray-600 hover:bg-gray-700 text-white"
                        >
                          <Square className="w-4 h-4 me-2" />
                          {t('unitsUpload.stopRecording')}
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
                      <RotateCcw className="w-4 h-4 me-2" />
                      {proofType === 'photo' ? t('unitsUpload.retakePhoto') : t('unitsUpload.retakeVideo')}
                    </Button>
                  )}
                </div>
              </div>

              {/* Governance structured fields */}
              {unitConfig?.requires_reference_number && (
                <div className="space-y-2">
                  <Label htmlFor="reference_number" className="text-gray-300">
                    {t('unitsUpload.refNumberLabel')} <span className="text-red-400">*</span>
                    <span className="text-gray-500 text-xs ms-2">{t('unitsUpload.refNumberHelper')}</span>
                  </Label>
                  <Input
                    id="reference_number"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder={t('unitsUpload.refNumberPlaceholder')}
                    className="bg-black/40 border-gray-700 text-white"
                  />
                </div>
              )}

              {unitConfig?.requires_expiry_date && (
                <div className="space-y-2">
                  <Label htmlFor="expiry_date" className="text-gray-300">
                    {t('unitsUpload.expiryDateLabel')} <span className="text-red-400">*</span>
                    <span className="text-gray-500 text-xs ms-2">{t('unitsUpload.expiryDateHelper')}</span>
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

              {!unitConfig?.requires_reference_number && (
                <div className="space-y-2">
                  <Label htmlFor="reference_number_opt" className="text-gray-300">
                    {t('unitsUpload.refNumberLabel')} <span className="text-gray-500 text-xs">{t('unitsUpload.refNumberOptional')}</span>
                  </Label>
                  <Input
                    id="reference_number_opt"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder={t('unitsUpload.refNumberPlaceholder')}
                    className="bg-black/40 border-gray-700 text-white"
                  />
                </div>
              )}

              {!unitConfig?.requires_expiry_date && (
                <div className="space-y-2">
                  <Label htmlFor="expiry_date_opt" className="text-gray-300">
                    {t('unitsUpload.expiryDateLabel')} <span className="text-gray-500 text-xs">{t('unitsUpload.expiryDateOptional')}</span>
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
                  {t('unitsUpload.notesLabel')} <span className="text-gray-500 text-xs">{t('unitsUpload.notesOptional')}</span>
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('unitsUpload.notesPlaceholder')}
                  className="bg-black/40 border-gray-700 text-white min-h-[80px]"
                />
              </div>

              {/* Submit */}
              <div className="pt-2 space-y-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="text-gray-400 hover:text-gray-200 text-sm transition-colors"
                  >
                    {t('unitsUpload.cancel')}
                  </button>
                </div>
                <Button
                  type="submit"
                  disabled={loading || !capturedMedia}
                  className="w-full bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                >
                  {loading ? t('unitsUpload.uploading') : t('unitsUpload.submit')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
