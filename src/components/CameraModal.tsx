import React, {useEffect, useRef, useState} from 'react';
import {Camera, ImagePlus, RefreshCw, X} from 'lucide-react';
import {captureVideoFrame, compressImageFile} from '../lib/imageUtils';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  title?: string;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  title = 'Photograph Plant',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    async function startCamera() {
      setIsStarting(true);
      setCameraError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Live camera preview is unavailable here. Use the phone camera or gallery upload below.');
        setIsStarting(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {facingMode},
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) {
          setCameraError('Camera access was not granted. You can still take or choose a photo using the button below.');
        }
      } finally {
        if (!cancelled) setIsStarting(false);
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, facingMode]);

  if (!isOpen) return null;

  const handleSnap = () => {
    if (!videoRef.current) return;
    const dataUrl = captureVideoFrame(videoRef.current);
    onCapture(dataUrl);
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file);
      onCapture(dataUrl);
      onClose();
    } catch {
      setCameraError('Could not read that image. Please try another photo.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-modal-title"
    >
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white border border-[#E4E6DF] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E6DF]">
          <h2 id="camera-modal-title" className="text-base font-semibold text-[#18221D]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#4B5850] hover:bg-[#F0F1EC]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="relative aspect-[4/3] w-full rounded-2xl bg-[#18221D] overflow-hidden flex items-center justify-center">
            {cameraError ? (
              <div className="px-6 text-center text-sm text-[#E4E6DF] leading-relaxed">
                {cameraError}
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-cover"
                />
                {isStarting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white">
                    Starting camera...
                  </div>
                )}
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-3">
            {!cameraError && (
              <>
                <button
                  type="button"
                  onClick={handleSnap}
                  className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1F513B] text-white text-sm font-medium hover:bg-[#173E2D] active:scale-[0.98] transition-all"
                >
                  <Camera className="w-4 h-4" />
                  <span>Take Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
                  aria-label="Switch camera"
                  className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-xl border border-[#D4D8CE] bg-white text-[#18221D] hover:bg-[#F0F1EC]"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#D4D8CE] bg-white text-[#18221D] text-sm font-medium hover:bg-[#F0F1EC]"
            >
              <ImagePlus className="w-4 h-4 text-[#1F513B]" />
              <span>{cameraError ? 'Open Phone Camera / Gallery' : 'Choose Photo'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
