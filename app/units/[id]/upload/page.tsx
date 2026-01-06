'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Camera, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/firebase';

export default function UploadProofPage() {
  const router = useRouter();
  const params = useParams();
  const unitId = params.id as string;
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Update timestamp every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Start camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  async function startCamera() {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

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
    setCapturedImage(imageData);

    // Stop camera after capture
    stopCamera();

    toast.success('Photo captured with timestamp');
  }

  function retakePhoto() {
    setCapturedImage(null);
    startCamera();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!capturedImage) {
      toast.error('Please capture a photo first');
      return;
    }

    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const token = session.access_token;

      // Convert base64 to blob
      const response = await fetch(capturedImage);
      const blob = await response.blob();

      // Create file from blob
      const timestamp = Date.now();
      const fileName = `${unitId}/${timestamp}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });

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
            <p className="text-gray-500">Take a timestamped photo as proof of completion</p>
          </div>
        </div>

        <Card className="bg-black/25 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Camera Capture</CardTitle>
            <CardDescription className="text-gray-400">
              Photo will be automatically timestamped for verification
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Camera/Preview Area */}
              <div className="space-y-2">
                <Label className="text-gray-300">
                  Photo <span className="text-red-400">*</span>
                </Label>
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                  {!capturedImage ? (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      {/* Live timestamp overlay */}
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
                    </>
                  ) : (
                    <img
                      src={capturedImage}
                      alt="Captured proof"
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>

                {/* Hidden canvas for image processing */}
                <canvas ref={canvasRef} className="hidden" />

                {/* Capture/Retake Button */}
                <div className="flex gap-2">
                  {!capturedImage ? (
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
                    <Button
                      type="button"
                      onClick={retakePhoto}
                      variant="outline"
                      className="w-full bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Retake Photo
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
                  disabled={loading || !capturedImage}
                  className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                >
                  {loading ? 'Uploading...' : 'Submit Proof'}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    stopCamera();
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
