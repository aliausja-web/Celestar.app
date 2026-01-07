'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Camera, Video as VideoIcon, RotateCcw, Square, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/firebase';

type ProofType = 'photo' | 'video';

export default function UploadProofPage() {
  const router = useRouter();
  const params = useParams();
  const unitId = params.id as string;
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [proofType, setProofType] = useState<ProofType>('photo');
  const [capturedMedia, setCapturedMedia] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Update timestamp every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Start camera when proof type changes or on mount
  useEffect(() => {
    if (!capturedMedia) {
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
          facingMode: 'environment', // Use back camera on mobile
          // Lower resolution for video to reduce lag
          width: { ideal: proofType === 'video' ? 1280 : 1920 },
          height: { ideal: proofType === 'video' ? 720 : 1080 },
          frameRate: { ideal: proofType === 'video' ? 30 : 60 }
        }
      };

      // Add audio for video recording with noise cancellation
      if (proofType === 'video') {
        constraints.audio = {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
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

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Add timestamp watermark
    const timestamp = currentTime.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // Configure watermark style
    const fontSize = Math.floor(canvas.height / 20);
    context.font = `bold ${fontSize}px Arial`;
    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
    context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    context.lineWidth = 3;

    // Position watermark at bottom right
    const padding = 20;
    const textMetrics = context.measureText(timestamp);
    const x = canvas.width - textMetrics.width - padding;
    const y = canvas.height - padding;

    // Draw text with outline
    context.strokeText(timestamp, x, y);
    context.fillText(timestamp, x, y);

    // Convert to base64
    const imageData = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedMedia(imageData);

    // Stop camera after capture
    stopCamera();

    toast.success('Photo captured with timestamp');
  }

  function startVideoRecording() {
    if (!stream) return;

    recordedChunksRef.current = [];

    // Try different codecs for better browser compatibility
    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm'
    ];

    let selectedMimeType = 'video/webm';
    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType;
        break;
      }
    }

    const options = {
      mimeType: selectedMimeType,
      videoBitsPerSecond: 2500000 // 2.5 Mbps for good quality without excessive size
    };

    try {
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: selectedMimeType });
        const videoURL = URL.createObjectURL(blob);
        setCapturedMedia(videoURL);
        stopCamera();
        toast.success('Video recorded');
      };

      // Request data every 100ms for smoother recording
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration timer
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!capturedMedia) {
      toast.error(`Please capture a ${proofType} first`);
      return;
    }

    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const token = session.access_token;

      let file: File;
      const timestamp = Date.now();
      const fileName = `${unitId}/${timestamp}.${proofType === 'photo' ? 'jpg' : 'webm'}`;

      if (proofType === 'photo') {
        // Convert base64 to blob for photo
        const response = await fetch(capturedMedia);
        const blob = await response.blob();
        file = new File([blob], fileName, { type: 'image/jpeg' });
      } else {
        // Convert blob URL to file for video
        const response = await fetch(capturedMedia);
        const blob = await response.blob();
        file = new File([blob], fileName, { type: 'video/webm' });
      }

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('proofs')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Create proof record
      const proofResponse = await fetch(`/api/units/${unitId}/proofs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: proofType,
          file_path: uploadData.path,
          notes: notes || null,
          captured_at: currentTime.toISOString(),
        }),
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
            <h1 className="text-3xl font-black text-white">Capture Proof</h1>
            <p className="text-gray-500">Take a timestamped photo or video as proof of completion</p>
          </div>
        </div>

        <Card className="bg-black/25 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Proof Capture</CardTitle>
            <CardDescription className="text-gray-400">
              {proofType === 'photo' ? 'Photo will be automatically timestamped for verification' : 'Video will be recorded with audio'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Proof Type Selection */}
              {!capturedMedia && (
                <div className="space-y-2">
                  <Label htmlFor="proofType" className="text-gray-300">
                    Proof Type <span className="text-red-400">*</span>
                  </Label>
                  <Select value={proofType} onValueChange={(value) => setProofType(value as ProofType)}>
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
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Camera/Preview Area */}
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
                      {/* Live timestamp overlay for photo */}
                      {proofType === 'photo' && (
                        <div className="absolute bottom-4 right-4 bg-black/70 text-white px-3 py-2 rounded font-mono text-sm">
                          {currentTime.toLocaleString('en-US', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                          })}
                        </div>
                      )}
                      {/* Recording indicator for video */}
                      {isRecording && (
                        <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-3 py-2 rounded-full">
                          <Circle className="w-3 h-3 fill-white animate-pulse" />
                          <span className="font-mono text-sm">REC {formatDuration(recordingDuration)}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    proofType === 'photo' ? (
                      <img
                        src={capturedMedia}
                        alt="Captured proof"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <video
                        src={capturedMedia}
                        controls
                        className="w-full h-full object-contain"
                      />
                    )
                  )}
                </div>

                {/* Hidden canvas for image processing */}
                <canvas ref={canvasRef} className="hidden" />

                {/* Capture/Recording Buttons */}
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

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-gray-300">
                  Notes (Optional)
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes or comments about this proof..."
                  className="bg-black/40 border-gray-700 text-white min-h-[100px]"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="submit"
                  disabled={loading || !capturedMedia}
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
