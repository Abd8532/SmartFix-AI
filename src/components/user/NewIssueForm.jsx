import React, { useState, useRef, useEffect } from 'react';
import { useTickets } from '../../context/TicketContext';
import apiClient from '../../services/apiClient';
import { 
  Camera, 
  ImagePlus, 
  Send, 
  Loader2, 
  Trash2, 
  Sparkles, 
  AlertTriangle,
  CheckCircle2, 
  MapPin, 
  X,
  Database,
  Flame,
  RefreshCw,
  RotateCcw
} from 'lucide-react';
import confetti from 'canvas-confetti';

// RAG Progressive Stages for smooth UX during vector retrieval + multimodal reasoning
const RAG_STAGES = [
  { step: 1, text: "Querying Pinecone vector store for matching historical equipment faults..." },
  { step: 2, text: "Injecting historical context & analyzing fault image via Gemini 2.5 Flash..." },
  { step: 3, text: "Evaluating safety-critical hazard checks & department routing..." },
  { step: 4, text: "Committing work order to backend repository & immutable audit log..." }
];

export default function NewIssueForm({ onTicketCreated }) {
  const { addTicket, setUserTab, currentUser } = useTickets();

  // Form State
  const [complaint, setComplaint] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageMimeType, setImageMimeType] = useState('image/jpeg');

  // Submission & Multi-Stage RAG Loading
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentRagStep, setCurrentRagStep] = useState(0);
  const [aiStatusMessage, setAiStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [imageWarning, setImageWarning] = useState('');
  const [successTicket, setSuccessTicket] = useState(null);

  // Hidden camera & gallery inputs
  const cameraInputRef = useRef(null);
  const filePickerRef = useRef(null);
  const videoRef = useRef(null);

  // Live WebRTC In-App Camera State
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState('environment'); // 'environment' (rear) | 'user' (front)
  const [cameraStream, setCameraStream] = useState(null);
  const [isCameraStarting, setIsCameraStarting] = useState(false);

  // Client-Side Image Compression Helper:
  // Resizes 5MB–12MB mobile phone photos to max 1280px at 0.85 JPEG quality
  const compressImage = (imageSource, maxWidth = 1280, maxHeight = 1280, quality = 0.85) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };

      img.onerror = () => {
        if (typeof imageSource === 'string') resolve(imageSource);
        else resolve(null);
      };

      if (typeof imageSource === 'string') {
        img.src = imageSource;
      } else if (imageSource instanceof File || imageSource instanceof Blob) {
        const reader = new FileReader();
        reader.onload = (e) => {
          img.src = e.target?.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(imageSource);
      } else {
        resolve(null);
      }
    });
  };

  // Convert File to compressed base64 data URL
  const handleFile = async (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload or capture a valid image file.');
      return;
    }

    setErrorMessage('');
    setAiStatusMessage('Compressing and optimizing photo...');

    try {
      const compressedDataUrl = await compressImage(file, 1280, 1280, 0.85);
      if (compressedDataUrl) {
        setImagePreview(compressedDataUrl);
        setPhotoBase64(compressedDataUrl);
        setImageMimeType('image/jpeg');

        try {
          const res = await fetch(compressedDataUrl);
          const blob = await res.blob();
          const optimizedFile = new File([blob], file.name ? `optimized_${file.name.replace(/\.[^/.]+$/, "")}.jpg` : 'fault_photo.jpg', { type: 'image/jpeg' });
          setImageFile(optimizedFile);
        } catch {
          setImageFile(file);
        }
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const res = e.target?.result;
          setImagePreview(res);
          setPhotoBase64(res);
          setImageFile(file);
          setImageMimeType(file.type || 'image/jpeg');
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.warn('Image compression warning, using original:', err);
      const reader = new FileReader();
      reader.onload = (e) => {
        const res = e.target?.result;
        setImagePreview(res);
        setPhotoBase64(res);
        setImageFile(file);
        setImageMimeType(file.type || 'image/jpeg');
      };
      reader.readAsDataURL(file);
    } finally {
      setAiStatusMessage('');
    }
  };

  const handleCameraChange = (e) => {
    setImageWarning('');
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleGalleryChange = (e) => {
    setImageWarning('');
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleRemovePhoto = () => {
    setImagePreview(null);
    setPhotoBase64(null);
    setImageFile(null);
    setImageWarning('');
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (filePickerRef.current) filePickerRef.current.value = '';
  };

  // Stop active camera stream tracks
  const stopCameraStream = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      setCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Close live camera modal
  const closeCameraModal = () => {
    stopCameraStream();
    setIsCameraModalOpen(false);
    setIsCameraStarting(false);
  };

  // Start live WebRTC in-app camera or fallback to native camera input
  const startLiveCamera = async (mode = cameraFacingMode) => {
    // Check if getUserMedia is supported in the current security context
    const hasGetUserMedia = Boolean(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    );

    // If on insecure HTTP or blocked, fall back immediately to native OS camera
    if (!hasGetUserMedia) {
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      }
      return;
    }

    stopCameraStream();
    setIsCameraStarting(true);
    setErrorMessage('');
    setIsCameraModalOpen(true);

    try {
      const constraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('getUserMedia failed, falling back to native mobile OS camera:', err);
      stopCameraStream();
      setIsCameraModalOpen(false);
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      } else {
        setErrorMessage('Camera access was blocked. Please allow camera permissions or upload an image from your files.');
      }
    } finally {
      setIsCameraStarting(false);
    }
  };

  // Flip camera between rear (environment) and front (user)
  const toggleFacingMode = () => {
    const nextMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFacingMode(nextMode);
    startLiveCamera(nextMode);
  };

  // Capture current video frame onto canvas & compress
  const capturePhotoFromLiveVideo = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (cameraFacingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);

    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const compressedDataUrl = await compressImage(rawDataUrl, 1280, 1280, 0.85);

    const finalDataUrl = compressedDataUrl || rawDataUrl;
    setImagePreview(finalDataUrl);
    setPhotoBase64(finalDataUrl);
    setImageMimeType('image/jpeg');

    try {
      const res = await fetch(compressedDataUrl || rawDataUrl);
      const blob = await res.blob();
      const capturedFile = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setImageFile(capturedFile);
    } catch {}

    stopCameraStream();
    setIsCameraModalOpen(false);
    setErrorMessage('');
  };

  useEffect(() => {
    if (isCameraModalOpen && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraModalOpen, cameraStream]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const getBase64DataUrl = async () => {
    if (photoBase64 && photoBase64.startsWith('data:')) {
      return photoBase64;
    }
    if (imagePreview && imagePreview.startsWith('data:')) {
      return imagePreview;
    }
    if (imageFile) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(imageFile);
      });
    }
    return null;
  };

  // Main Submit Handler - Sends to backend API with authoritative RAG & triage
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!complaint.trim()) {
      setErrorMessage('Please describe the maintenance issue or user complaint.');
      return;
    }

    if (!imagePreview && !imageFile) {
      setErrorMessage('Warning: A photo of the issue is required to raise a maintenance ticket.');
      return;
    }

    setErrorMessage('');
    setImageWarning('');
    setIsSubmitting(true);
    setIsProcessing(true);
    setCurrentRagStep(1);
    setAiStatusMessage(RAG_STAGES[0].text);

    // Smooth UI progress indicator while backend runs authoritative pipeline
    const stepInterval = setInterval(() => {
      setCurrentRagStep((prev) => {
        if (prev < 3) {
          const next = prev + 1;
          setAiStatusMessage(RAG_STAGES[next - 1]?.text || 'Processing...');
          return next;
        }
        return prev;
      });
    }, 900);

    try {
      const base64DataUrl = photoBase64 || (await getBase64DataUrl());

      // 1. Full S3 Presigned Upload Flow: Request URL -> Upload Binary -> Save Key (Phase 6 requirement 3)
      let s3FileKey = null;
      let binaryBlob = imageFile;
      if (!binaryBlob && base64DataUrl) {
        const byteString = atob(base64DataUrl.split(',')[1]);
        const mimeStr = base64DataUrl.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        binaryBlob = new Blob([ab], { type: mimeStr });
      }

      if (binaryBlob) {
        try {
          const presignRes = await apiClient.uploads.presign({
            fileName: imageFile?.name || 'maintenance-photo.jpg',
            mimeType: imageMimeType || binaryBlob.type || 'image/jpeg',
            fileSize: binaryBlob.size
          });

          if (!presignRes?.uploadUrl || !presignRes?.fileKey) {
            throw new Error('Storage service failed to issue presigned upload authorization.');
          }

          await apiClient.uploads.uploadToS3(
            presignRes.uploadUrl,
            binaryBlob,
            imageMimeType || binaryBlob.type || 'image/jpeg'
          );
          s3FileKey = presignRes.fileKey;
        } catch (uploadErr) {
          console.error('Presigned upload error:', uploadErr);
          throw new Error(`Attachment upload failed: ${uploadErr.message || 'S3 transmission rejected'}. Please check your connection and retry.`);
        }
      }

      setCurrentRagStep(2);
      setAiStatusMessage(RAG_STAGES[1].text);

      // 2. Strict Visual-Textual Verification Gate (Phase 7): Reject irrelevant/unrelated photos before creation
      try {
        const verifyRes = await apiClient.tickets.verifyImage({
          complaint: complaint.trim(),
          image: base64DataUrl,
          fileKey: s3FileKey,
          mimeType: imageMimeType
        });

        if (verifyRes?.imageMatchesComplaint === false || verifyRes?.status === 422) {
          setIsSubmitting(false);
          setIsProcessing(false);
          clearInterval(stepInterval);
          setImageWarning(
            verifyRes.message ||
            verifyRes.imageValidationWarning ||
            `Photo Irrelevant: You described '${complaint.trim()}', but the photo does not match the problem. Please upload a real photo of the broken equipment.`
          );
          return; // Prevent addTicket() from running entirely
        }
      } catch (verifyErr) {
        if (verifyErr.status === 422 || verifyErr.data?.imageMatchesComplaint === false || verifyErr.data?.warning) {
          setIsSubmitting(false);
          setIsProcessing(false);
          clearInterval(stepInterval);
          setImageWarning(
            verifyErr.data?.message ||
            verifyErr.message ||
            `Photo Irrelevant: You described '${complaint.trim()}', but the photo does not match the problem. Please upload a real photo of the broken equipment.`
          );
          return; // Prevent addTicket() from running entirely
        }
      }

      setCurrentRagStep(3);
      setAiStatusMessage(RAG_STAGES[2].text);

      const created = await addTicket({
        complaint: complaint.trim(),
        image: base64DataUrl,
        photo: base64DataUrl,
        imageUrl: base64DataUrl,
        fileKey: s3FileKey,
        photoKey: s3FileKey,
        mimeType: imageMimeType
      });

      clearInterval(stepInterval);
      setCurrentRagStep(4);
      setAiStatusMessage(RAG_STAGES[3].text);

      try {
        confetti({
          particleCount: 55,
          spread: 60,
          origin: { y: 0.7 }
        });
      } catch {}

      setSuccessTicket({
        ...created,
        image: created?.image || created?.photo || created?.imageUrl || base64DataUrl || imagePreview,
        photo: created?.photo || created?.image || created?.imageUrl || base64DataUrl || imagePreview,
        imageUrl: created?.imageUrl || created?.image || created?.photo || base64DataUrl || imagePreview,
      });
      setComplaint('');
      setImagePreview(null);
      setPhotoBase64(null);
      setImageFile(null);
    } catch (err) {
      clearInterval(stepInterval);
      console.error('Submission error:', err);
      if (err.status === 422 || err.data?.imageMatchesComplaint === false || err.data?.warning) {
        setIsSubmitting(false);
        setIsProcessing(false);
        setImageWarning(
          err.data?.message ||
          err.message ||
          `Photo Irrelevant: You described '${complaint.trim()}', but the photo does not match the problem. Please upload a real photo of the broken equipment.`
        );
      } else {
        setErrorMessage(err.message || 'An error occurred during ticket creation. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
      setIsProcessing(false);
      setCurrentRagStep(0);
      setAiStatusMessage('');
    }
  };

  // SUCCESS CONFIRMATION VIEW
  if (successTicket) {
    return (
      <div className="bg-[#1c1c21] rounded-xl p-6 sm:p-8 text-center max-w-lg mx-auto border border-[#2a2a32] text-zinc-100 shadow-2xl animate-slide-up">
        <div className="w-14 h-14 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Authoritative AI Maintenance Triage</span>
        </div>

        <h2 className="text-xl sm:text-2xl font-extrabold text-white font-['Plus_Jakarta_Sans',sans-serif] tracking-tight">
          Maintenance Ticket Created
        </h2>
        <p className="text-xs sm:text-sm text-zinc-400 font-medium mt-1 mb-5">
          Fault analyzed and registered in campus dispatch under <strong className="text-white">#{successTicket.id}</strong>.
        </p>

        {/* Recurrence Escalation Banner */}
        {successTicket.isRecurring && (
          <div className="mb-5 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-left text-xs text-rose-400 animate-slide-up">
            <div className="flex items-center gap-2 font-bold mb-1">
              <Flame className="w-4 h-4 text-rose-400" />
              <span>RECURRING EQUIPMENT FAULT DETECTED</span>
            </div>
            <p className="text-zinc-300 leading-relaxed font-medium">
              Vector store matched this complaint with previous maintenance incidents. Urgency has been automatically escalated.
            </p>
            {successTicket.recurringFixSummary && (
              <p className="text-[11px] text-zinc-400 mt-2 bg-[#1c1c21] p-2.5 rounded-lg border border-rose-500/20 font-mono">
                {successTicket.recurringFixSummary}
              </p>
            )}
          </div>
        )}

        {/* AI Extracted Summary Card */}
        <div className="p-5 rounded-xl bg-[#24242b] border border-[#32323b] text-left space-y-3 mb-6 text-xs text-zinc-200">
          <div>
            <span className="text-[10px] uppercase font-bold text-zinc-500">Title</span>
            <p className="font-bold text-white text-sm mt-0.5">{successTicket.title}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="px-2.5 py-0.5 rounded-lg bg-[#1c1c21] text-zinc-300 font-medium text-xs border border-[#32323b]">
              {successTicket.category}
            </span>
            <span className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
              successTicket.priority === 'High' || successTicket.priority === 'Urgent' 
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                : successTicket.priority === 'Critical' || successTicket.priority === 'Emergency' 
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' 
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
            }`}>
              {successTicket.priority} Priority
            </span>
            <span className="text-zinc-400 font-medium flex items-center gap-1 text-xs">
              <MapPin className="w-3.5 h-3.5 text-indigo-400" />
              <span>{successTicket.location}</span>
            </span>
            {successTicket.assignedTo && (
              <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 font-medium text-xs border border-indigo-500/30">
                Routed to: {typeof successTicket.assignedTo === 'string' ? successTicket.assignedTo : successTicket.assignedTo?.name || 'Technician'}
              </span>
            )}
            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 font-semibold text-xs border border-amber-500/30">
              📊 RAG History: {successTicket.ragTicketVolume || 1} Reports • Score: {successTicket.priorityScore ?? 40}/100
            </span>
          </div>

          <div className="pt-2 border-t border-[#32323b]">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Diagnosis & Engineering Assessment</span>
            <p className="text-xs text-zinc-300 font-medium mt-1 leading-relaxed">
              {successTicket.description}
            </p>
          </div>

          {(() => {
            const successImg = successTicket.image || successTicket.photo || successTicket.imageUrl;
            if (!successImg) return null;
            return (
              <div className="mt-3 rounded-xl overflow-hidden border border-[#32323b] max-h-48 bg-[#1c1c21]">
                <img
                  src={successImg}
                  alt="Fault"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    if (e.currentTarget.parentElement) {
                      e.currentTarget.parentElement.style.display = 'none';
                    }
                  }}
                />
              </div>
            );
          })()}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              if (onTicketCreated) onTicketCreated();
              setUserTab('my-tickets');
            }}
            className="flex-1 h-10 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition"
          >
            View in My Tickets
          </button>
          <button
            onClick={() => setSuccessTicket(null)}
            className="flex-1 h-10 px-4 rounded-lg bg-[#24242b] hover:bg-[#2e2e38] text-zinc-300 hover:text-white font-medium text-xs border border-[#32323b] transition"
          >
            Report Another Issue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-16 text-zinc-100">
      {/* Header - Center Aligned Hero Section */}
      <div className="mb-6 text-center">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
          New Maintenance Issue<span className="text-indigo-500">.</span>
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          Attach a fault photo and describe your complaint for automated AI triage
        </p>
      </div>

      {/* MAIN FORM CARD */}
      <form onSubmit={handleSubmit} className="bg-[#1c1c21] border border-[#2a2a32] rounded-xl p-6 sm:p-8 space-y-6 text-zinc-100 shadow-xl">
        {/* 1. CAMERA & IMAGE UPLOAD SECTION */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Camera className="w-4 h-4 text-indigo-400" />
              <span>Fault Photo Documentation</span>
            </label>
            <span className="text-xs text-zinc-500 font-medium">Rear Camera Native</span>
          </div>

          {/* Hidden rear-camera input with capture="environment" */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraChange}
            className="hidden"
            id="camera-rear-input"
          />

          {/* Hidden standard file picker input */}
          <input
            ref={filePickerRef}
            type="file"
            accept="image/*"
            onChange={handleGalleryChange}
            className="hidden"
            id="file-picker-input"
          />

          {/* Prominent Visual Verification Rejection Alert Banner Right Above Upload Box */}
          {imageWarning && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-4 rounded-xl animate-slide-up flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-400 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-rose-200 flex items-center gap-1.5">
                    Visual-Textual Verification Rejected
                  </span>
                  <button
                    type="button"
                    onClick={() => setImageWarning('')}
                    className="text-rose-400 hover:text-rose-200 p-1 rounded transition"
                    aria-label="Dismiss warning"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-rose-300 font-medium mt-1 leading-relaxed">
                  {imageWarning}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setImageWarning('');
                      handleRemovePhoto();
                      startLiveCamera('environment');
                    }}
                    className="h-7 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <Camera className="w-3 h-3" />
                    <span>Retake Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImageWarning('');
                      handleRemovePhoto();
                      filePickerRef.current?.click();
                    }}
                    className="h-7 px-3 rounded-lg bg-[#24242b] hover:bg-[#2e2e38] text-zinc-200 border border-[#32323b] text-xs font-medium transition flex items-center gap-1.5"
                  >
                    <ImagePlus className="w-3 h-3 text-zinc-400" />
                    <span>Upload Different Image</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* IMAGE PREVIEW OR CAPTURE BUTTONS */}
          {!imagePreview ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-[#32323b] hover:border-indigo-500 rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center transition bg-[#24242b] text-center">
                <div className="w-14 h-14 rounded-xl bg-[#1c1c21] border border-[#32323b] flex items-center justify-center text-indigo-400 mb-3">
                  <Camera className="w-7 h-7" />
                </div>
                <p className="text-sm font-bold text-white">
                  Take a Photo or Upload Fault Image
                </p>
                <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                  Native camera on mobile or file selector on desktop
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => startLiveCamera('environment')}
                    className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 transition"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Take Photo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => filePickerRef.current?.click()}
                    className="h-9 px-4 rounded-lg bg-[#1c1c21] hover:bg-[#282830] text-zinc-300 hover:text-white text-xs font-medium border border-[#32323b] flex items-center gap-2 transition"
                  >
                    <ImagePlus className="w-4 h-4 text-zinc-400" />
                    <span>Upload from Gallery</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* IMAGE PREVIEW AREA */
            <div className="relative rounded-xl overflow-hidden border border-[#32323b] bg-[#24242b] group">
              <img
                src={imagePreview}
                alt="Fault preview"
                className="w-full max-h-72 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-4">
                <div className="flex items-center gap-2 text-xs text-white font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Photo Ready for RAG Multimodal Analysis</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startLiveCamera('environment')}
                    className="h-8 px-3 rounded-lg bg-[#1c1c21]/90 hover:bg-[#1c1c21] text-white text-xs font-medium border border-[#32323b] flex items-center gap-1.5 transition"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Retake</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition"
                    aria-label="Remove image"
                    title="Remove photo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. USER COMPLAINT TEXTAREA */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label htmlFor="complaint" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Describe the problem / User Complaint <span className="text-rose-500">*</span>
            </label>
            <span className="text-xs font-mono text-zinc-500">{complaint.length}/500</span>
          </div>
          <textarea
            id="complaint"
            rows={4}
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            placeholder="Describe your issue..."
            maxLength={500}
            className="w-full p-3.5 rounded-lg bg-[#24242b] border border-[#32323b] text-white placeholder-zinc-500 focus:bg-[#282832] focus:outline-none focus:border-indigo-500 text-sm transition"
          />
        </div>

        {/* 3. MULTI-STAGE RAG PROGRESS INDICATOR */}
        {isProcessing && (
          <div className="p-4 rounded-xl bg-[#24242b] border border-[#32323b] space-y-3 animate-fade-in">
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span className="flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400 animate-pulse" />
                <span>RAG Pipeline in Execution</span>
              </span>
              <span className="text-indigo-400 font-mono">Step {currentRagStep || 1} of 4</span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-1.5 rounded-full bg-[#1c1c21] overflow-hidden">
              <div 
                className="h-full bg-indigo-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.max(15, (currentRagStep / 4) * 100)}%` }}
              />
            </div>

            {/* Current Step Text */}
            <p className="text-xs font-medium text-zinc-300 animate-pulse flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 shrink-0" />
              <span>{aiStatusMessage || 'Processing with Pinecone & Gemini 2.5 Flash...'}</span>
            </p>

            {/* Step Checkmarks */}
            <div className="grid grid-cols-4 gap-1.5 pt-1 text-[10px] font-semibold text-zinc-500">
              <span className={currentRagStep >= 1 ? 'text-indigo-400' : ''}>1. Vector Query</span>
              <span className={currentRagStep >= 2 ? 'text-indigo-400' : ''}>2. Multimodal AI</span>
              <span className={currentRagStep >= 3 ? 'text-indigo-400' : ''}>3. Recurrence</span>
              <span className={currentRagStep >= 4 ? 'text-indigo-400' : ''}>4. Audit Commit</span>
            </div>
          </div>
        )}

        {/* Verification / Rejection Alert Box */}
        {errorMessage && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-4 rounded-xl text-xs sm:text-sm animate-slide-up flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-rose-200">Submission Alert</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage('')}
                  className="text-rose-400 hover:text-rose-200 font-bold p-0.5"
                  aria-label="Dismiss error"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-1 font-medium leading-relaxed">{errorMessage}</p>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition"
                >
                  Retry Submission
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. SUBMIT BUTTON */}
        <div>
          <button
            type="submit"
            disabled={isProcessing}
            className="w-full h-11 min-h-[44px] flex items-center justify-center gap-2 px-6 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition shadow-sm disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-white" />
                <span>RAG Pipeline Triaging...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 text-white" />
                <span>Analyze & Create Ticket</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* IN-APP LIVE WEBRTC CAMERA MODAL */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 animate-fade-in text-white">
          {/* Modal Top Header */}
          <div className="flex items-center justify-between z-10 max-w-2xl mx-auto w-full">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold text-sm sm:text-base font-['Plus_Jakarta_Sans']">
                Live Camera Viewfinder
              </span>
              <span className="text-[11px] font-semibold bg-white/10 px-2.5 py-0.5 rounded-full border border-white/20">
                {cameraFacingMode === 'environment' ? 'Rear Camera' : 'Front Camera'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleFacingMode}
                className="h-10 px-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/20 transition-all duration-200 active:scale-[0.98]"
                title="Flip Camera"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Flip</span>
              </button>

              <button
                type="button"
                onClick={closeCameraModal}
                className="h-10 w-10 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center border border-white/20 transition-all duration-200 active:scale-[0.98]"
                aria-label="Close Camera"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Viewfinder Video Frame with Equipment Focus Guidelines */}
          <div className="relative flex-1 my-4 flex items-center justify-center overflow-hidden rounded-3xl bg-black border border-white/10 shadow-2xl max-w-2xl mx-auto w-full">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover rounded-3xl"
            />

            {/* Viewfinder Target Framing Brackets */}
            <div className="absolute inset-8 sm:inset-16 pointer-events-none border-2 border-white/25 rounded-2xl flex flex-col justify-between p-3">
              <div className="flex justify-between">
                <span className="w-5 h-5 border-t-2 border-l-2 border-white/80 rounded-tl-md" />
                <span className="w-5 h-5 border-t-2 border-r-2 border-white/80 rounded-tr-md" />
              </div>
              <div className="flex justify-center">
                <p className="text-[11px] font-medium text-white/80 bg-black/50 px-3 py-1 rounded-full backdrop-blur-xs">
                  Frame faulty equipment clearly
                </p>
              </div>
              <div className="flex justify-between">
                <span className="w-5 h-5 border-b-2 border-l-2 border-white/80 rounded-bl-md" />
                <span className="w-5 h-5 border-b-2 border-r-2 border-white/80 rounded-br-md" />
              </div>
            </div>

            {/* Spinner while camera is initializing */}
            {isCameraStarting && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#2D60FF]" />
                <p className="text-xs font-semibold text-white">Starting Camera Stream...</p>
              </div>
            )}
          </div>

          {/* Shutter / Capture Controls Bar */}
          <div className="flex items-center justify-between px-4 sm:px-12 pb-2 z-10 max-w-2xl mx-auto w-full">
            <button
              type="button"
              onClick={closeCameraModal}
              className="h-11 px-4 text-xs font-semibold text-white/70 hover:text-white transition-colors"
            >
              Cancel
            </button>

            {/* Circular Shutter Button */}
            <button
              type="button"
              onClick={capturePhotoFromLiveVideo}
              disabled={isCameraStarting}
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1.5 transition-all duration-200 active:scale-90 hover:scale-105 shadow-xl bg-white/20 hover:bg-white/30 disabled:opacity-50"
              title="Capture Photo"
              aria-label="Capture photo"
            >
              <span className="w-full h-full rounded-full bg-white shadow-inner block" />
            </button>

            <button
              type="button"
              onClick={toggleFacingMode}
              className="h-11 px-4 text-xs font-semibold text-white/70 hover:text-white flex items-center gap-1.5 transition-colors"
              title="Flip Camera (Front/Rear)"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Flip</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
