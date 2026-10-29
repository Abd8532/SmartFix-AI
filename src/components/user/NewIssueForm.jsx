import React, { useState, useRef } from 'react';
import { useTickets } from '../../context/TicketContext';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  Camera, 
  ImagePlus, 
  Send, 
  Loader2, 
  Trash2, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  MapPin, 
  Tag, 
  Flame, 
  Key, 
  Cpu, 
  X,
  RefreshCw,
  SlidersHorizontal
} from 'lucide-react';
import confetti from 'canvas-confetti';

// Pre-packaged test samples for rapid testing on laptops without physical cameras
const SAMPLE_PHOTOS = [
  { label: 'Water Leak', url: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=800&auto=format&fit=crop&q=80', complaint: 'Urgent! Water pipe under restroom sink burst and is spraying water near electrical socket.' },
  { label: 'Electrical Panel', url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80', complaint: 'Sub-panel breaker in Server Room 204 keeps tripping and feels hot to touch.' },
  { label: 'HVAC Failure', url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80', complaint: 'Rooftop chiller AC unit in Carrow Library is making loud metallic grinding noise.' }
];

// Modern Google AI Studio Gemini models in order of priority & stability
const CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-002',
  'gemini-1.5-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-pro'
];

function runLocalHeuristics(complaintText) {
  const lower = (complaintText || '').toLowerCase();
  let cat = 'General';
  let prio = 'Moderate';
  let loc = 'Demo Building B · Facility Floor';
  let assigned = 'General Maintenance';

  if (lower.includes('water') || lower.includes('pipe') || lower.includes('leak') || lower.includes('sink') || lower.includes('drain') || lower.includes('toilet') || lower.includes('faucet') || lower.includes('plumb')) {
    cat = 'Plumbing';
    prio = lower.includes('burst') || lower.includes('flood') || lower.includes('urgent') ? 'Urgent' : 'Moderate';
    loc = "Demo Building B · Men's Restroom";
    assigned = 'Plumbing Tech';
  } else if (lower.includes('electric') || lower.includes('breaker') || lower.includes('panel') || lower.includes('wire') || lower.includes('spark') || lower.includes('power') || lower.includes('voltage')) {
    cat = 'Electrical';
    prio = 'Urgent';
    loc = 'Keller Science Center · Server Room';
    assigned = 'Electrical Tech';
  } else if (lower.includes('ac') || lower.includes('hvac') || lower.includes('chiller') || lower.includes('heat') || lower.includes('cold') || lower.includes('fan') || lower.includes('air') || lower.includes('filter')) {
    cat = 'HVAC';
    prio = lower.includes('noise') || lower.includes('vibrat') ? 'Moderate' : 'Urgent';
    loc = 'Carrow Library · Study Hall Rooftop';
    assigned = 'General Maintenance';
  } else if (lower.includes('computer') || lower.includes('network') || lower.includes('wifi') || lower.includes('server') || lower.includes('cable') || lower.includes('internet') || lower.includes('router')) {
    cat = 'IT';
    prio = 'Moderate';
    loc = 'Keller Science Center · Lab 110';
    assigned = 'General Maintenance';
  }

  return {
    title: complaintText.length > 50 ? complaintText.substring(0, 48) + '...' : complaintText,
    category: cat,
    urgency: prio,
    location: loc,
    description: `Summary: ${complaintText.trim()}`,
    assignedTo: assigned
  };
}

export default function NewIssueForm({ onTicketCreated }) {
  const { addTicket, setUserTab, currentUser } = useTickets();

  // Form State
  const [complaint, setComplaint] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageMimeType, setImageMimeType] = useState('image/jpeg');
  
  // API & AI Processing State
  const [apiKey, setApiKey] = useState(() => {
    return import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('maintainx_gemini_api_key') || '';
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('maintainx_gemini_model') || 'auto';
  });
  const [activeModelUsed, setActiveModelUsed] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successTicket, setSuccessTicket] = useState(null);

  // Hidden camera & gallery inputs
  const cameraInputRef = useRef(null);
  const filePickerRef = useRef(null);

  // Convert File to base64 data URL
  const handleFile = (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload or capture a valid image file.');
      return;
    }

    setErrorMessage('');
    setImageFile(file);
    setImageMimeType(file.type || 'image/jpeg');

    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCameraChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleGalleryChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleRemovePhoto = () => {
    setImagePreview(null);
    setImageFile(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (filePickerRef.current) filePickerRef.current.value = '';
  };

  // Helper to load sample image as dataURL
  const handleSelectSample = async (sample) => {
    setComplaint(sample.complaint);
    setErrorMessage('');
    setAiStatusMessage('Loading sample image...');

    try {
      // Fetch and convert Unsplash image to base64
      const res = await fetch(sample.url);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result);
        setImageMimeType(blob.type || 'image/jpeg');
        setImageFile(blob);
        setAiStatusMessage('');
      };
      reader.readAsDataURL(blob);
    } catch {
      // Fallback: direct URL
      setImagePreview(sample.url);
      setImageMimeType('image/jpeg');
      setAiStatusMessage('');
    }
  };

  // Convert base64 dataUrl into Gemini inlineData part
  const convertBase64ToPart = (base64DataUrl, mimeType = 'image/jpeg') => {
    const base64Content = base64DataUrl.includes(',')
      ? base64DataUrl.split(',')[1]
      : base64DataUrl;
    return {
      inlineData: {
        data: base64Content,
        mimeType: mimeType || 'image/jpeg'
      }
    };
  };

  // Helper to safely extract base64 from current preview
  const getBase64DataUrl = async () => {
    if (!imagePreview) return null;
    if (imagePreview.startsWith('data:image/')) {
      return imagePreview;
    }
    // If it's an external URL (sample), fetch and convert to base64
    try {
      const response = await fetch(imagePreview);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  // SmartFixFlow AI Dispatch with Multi-Model Fallback & Safety Net
  const processWithAI = async () => {
    const base64DataUrl = await getBase64DataUrl();
    let ticketData = null;

    // Check if user has provided Gemini API key
    const activeKey = apiKey.trim() || import.meta.env.VITE_GEMINI_API_KEY;

    if (activeKey) {
      const promptContents = [];

      // Add base64 image part if available
      if (base64DataUrl) {
        const imagePart = convertBase64ToPart(base64DataUrl, imageMimeType);
        promptContents.push(imagePart);
      }

      // Exact prompt requested by user
      const prompt = `You are the AI Chief Engineer for SmartFixFlow - AI. Analyze the image and user complaint: "${complaint}".
Extract the details and return ONLY a raw JSON object.
Structure the JSON exactly like this:
{
  "title": "Short, clear title",
  "category": "Plumbing, Electrical, HVAC, IT, or General",
  "urgency": "Low, Moderate, or Urgent based on visual severity and text context",
  "location": "Extracted location or 'Pending inspection'",
  "description": "Professional summary of the issue.",
  "assignedTo": "Determine routing. If Electrical, route to 'Electrical Tech'. If Plumbing, 'Plumbing Tech'. Otherwise 'General Maintenance'."
}`;

      promptContents.push(prompt);

      // Determine models to attempt
      let modelsToTry = [];
      if (selectedModel && selectedModel !== 'auto') {
        modelsToTry = [selectedModel, ...CANDIDATE_MODELS.filter((m) => m !== selectedModel)];
      } else {
        // Auto mode: Try querying available models from Google API with a short timeout
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${activeKey}`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            const data = await res.json();
            const onlineNames = (data.models || [])
              .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
              .map((m) => m.name.replace(/^models\//, ''));
            
            // Prioritize matching candidate models
            const matched = CANDIDATE_MODELS.filter((c) => onlineNames.includes(c));
            modelsToTry = [...matched, ...onlineNames.filter((n) => n.includes('flash') || n.includes('pro'))];
          }
        } catch (discoverErr) {
          console.warn('Model auto-discovery timed out, using standard cascade:', discoverErr);
        }

        if (modelsToTry.length === 0) {
          modelsToTry = [...CANDIDATE_MODELS];
        }
      }

      // De-duplicate model list
      modelsToTry = Array.from(new Set(modelsToTry));

      const genAI = new GoogleGenerativeAI(activeKey);
      let success = false;
      let lastApiError = null;

      for (const modelName of modelsToTry) {
        try {
          setAiStatusMessage(`AI Chief Engineer analyzing via ${modelName}...`);
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: 'application/json'
            }
          });

          const result = await model.generateContent(promptContents);
          const responseText = result.response.text();

          try {
            const cleanedText = responseText.replace(/```json\n?|```/g, '').trim();
            ticketData = JSON.parse(cleanedText);
          } catch (jsonErr) {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              ticketData = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('AI response format was unparseable.');
            }
          }

          success = true;
          setActiveModelUsed(modelName);
          console.log(`✓ Analysis succeeded with Gemini model: ${modelName}`);
          break;
        } catch (modelErr) {
          lastApiError = modelErr;
          console.warn(`Model ${modelName} encountered error:`, modelErr.message);

          // If API key is fundamentally invalid, stop immediately
          if (modelErr.message?.includes('API_KEY_INVALID')) {
            throw new Error('Your Gemini API Key is invalid or expired. Please check your key in the settings.');
          }
          // Otherwise (e.g. 404 not found, unsupported), loop to try the next candidate model!
        }
      }

      // If all models in the cascade failed, fall back to local AI heuristics with a polite warning
      if (!success || !ticketData) {
        console.warn('All remote Gemini models returned 404 or failed. Applying AI Chief Engineer local heuristics fallback:', lastApiError);
        ticketData = runLocalHeuristics(complaint);
        ticketData.description += ` (Processed via Chief Engineer local heuristics - remote API returned: ${lastApiError?.message?.substring(0, 70) || 'Model unavailable'})`;
        setActiveModelUsed('Local Chief Engineer Engine');
      }
    } else {
      // Graceful local heuristic fallback if no key is configured yet
      setAiStatusMessage('Routing with local AI Chief Engineer heuristics...');
      await new Promise((r) => setTimeout(r, 600));
      ticketData = runLocalHeuristics(complaint);
      setActiveModelUsed('Local Chief Engineer Engine');
    }

    setAiStatusMessage('Logging ticket to maintenance register...');

    // Inside NewIssueForm.jsx -> processWithAI (Exact requirement)
    const created = await addTicket({
      ...ticketData,
      priority: ticketData.urgency || ticketData.priority || 'Moderate',
      photo: base64DataUrl || imagePreview || null,
      status: 'Assigned', // Auto-assigned by AI
      techConfirmed: false,
      userConfirmed: false,
      reportedBy: {
        id: currentUser?.id || 'usr_1',
        name: currentUser?.name || 'Alex Rivera',
        email: currentUser?.email || 'alex@campus.edu',
        role: currentUser?.role || 'user',
        avatar: currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120'
      },
      reporterId: currentUser?.id || 'usr_1',
      reporterEmail: currentUser?.email || 'alex@campus.edu',
      reporterName: currentUser?.name || 'Alex Rivera',
      createdAt: new Date().toISOString()
    });

    return created;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!complaint.trim()) {
      setErrorMessage('Please describe the maintenance issue or complaint.');
      return;
    }

    setErrorMessage('');
    setIsProcessing(true);
    setAiStatusMessage('AI Chief Engineer is analyzing fault...');

    try {
      const created = await processWithAI();

      // Trigger celebration
      try {
        confetti({
          particleCount: 55,
          spread: 60,
          origin: { y: 0.7 }
        });
      } catch {}

      // Reset form state & show success confirmation
      setSuccessTicket(created);
      setComplaint('');
      setImagePreview(null);
      setImageFile(null);
      setAiStatusMessage('');
    } catch (err) {
      console.error('SmartFixFlow AI error:', err);
      setErrorMessage(
        err.message?.includes('API_KEY_INVALID') || err.message?.includes('API key')
          ? 'Invalid Gemini API key. Please check your key in the settings above.'
          : err.message || 'An error occurred while communicating with the AI model. Please try again.'
      );
    } finally {
      setIsProcessing(false);
      setAiStatusMessage('');
    }
  };

  const handleSubmitWithLocalFallback = async () => {
    if (!complaint.trim()) {
      setErrorMessage('Please describe the maintenance issue or complaint.');
      return;
    }

    setErrorMessage('');
    setIsProcessing(true);
    setAiStatusMessage('Routing with local AI Chief Engineer heuristics...');

    try {
      await new Promise((r) => setTimeout(r, 500));
      const base64DataUrl = await getBase64DataUrl();
      const ticketData = runLocalHeuristics(complaint);
      setActiveModelUsed('Local Chief Engineer Engine');

      const created = await addTicket({
        ...ticketData,
        priority: ticketData.urgency || ticketData.priority || 'Moderate',
        photo: base64DataUrl || imagePreview || null,
        status: 'Assigned',
        techConfirmed: false,
        userConfirmed: false,
        reportedBy: {
          id: currentUser?.id || 'usr_1',
          name: currentUser?.name || 'Alex Rivera',
          email: currentUser?.email || 'alex@campus.edu',
          role: currentUser?.role || 'user',
          avatar: currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120'
        },
        reporterId: currentUser?.id || 'usr_1',
        reporterEmail: currentUser?.email || 'alex@campus.edu',
        reporterName: currentUser?.name || 'Alex Rivera',
        createdAt: new Date().toISOString()
      });

      try {
        confetti({
          particleCount: 55,
          spread: 60,
          origin: { y: 0.7 }
        });
      } catch {}

      setSuccessTicket(created);
      setComplaint('');
      setImagePreview(null);
      setImageFile(null);
    } finally {
      setIsProcessing(false);
      setAiStatusMessage('');
    }
  };

  const handleSaveApiKey = (e) => {
    e.preventDefault();
    const trimmed = apiKey.trim();
    if (trimmed) {
      localStorage.setItem('maintainx_gemini_api_key', trimmed);
    } else {
      localStorage.removeItem('maintainx_gemini_api_key');
    }
    localStorage.setItem('maintainx_gemini_model', selectedModel);
    setShowApiKeyInput(false);
  };

  // SUCCESS CONFIRMATION VIEW
  if (successTicket) {
    return (
      <div className="bg-white/90 backdrop-blur-md rounded-3xl p-6 sm:p-8 text-center max-w-lg mx-auto border border-slate-200/90 shadow-lg animate-slide-up">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 ring-8 ring-emerald-50/60 shadow-xs">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-xs font-semibold mb-3">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>AI Chief Engineer Processed ({activeModelUsed || 'Gemini 2.5 Flash'})</span>
        </div>

        <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
          Maintenance Ticket Created
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 mt-1 mb-5">
          Fault analyzed and registered in campus dispatch under <strong className="text-slate-900">#{successTicket.id}</strong>.
        </p>

        {/* AI Extracted Summary Card */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-2.5 mb-6 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Title</span>
            <p className="font-bold text-slate-900 text-sm mt-0.5">{successTicket.title}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-800 font-semibold text-[11px]">
              {successTicket.category}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-white font-semibold text-[11px] ${
              successTicket.priority === 'High' ? 'bg-[#b45309]' : successTicket.priority === 'Critical' ? 'bg-[#b91c1c]' : 'bg-[#047857]'
            }`}>
              {successTicket.priority} Priority
            </span>
            <span className="text-slate-500 flex items-center gap-1 text-[11px]">
              <MapPin className="w-3 h-3 text-sky-600" />
              <span>{successTicket.location}</span>
            </span>
            {successTicket.assignedTo && (
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold text-[11px] border border-indigo-200">
                Routed to: {typeof successTicket.assignedTo === 'string' ? successTicket.assignedTo : successTicket.assignedTo?.name || 'Technician'}
              </span>
            )}
          </div>
          {successTicket.photo && (
            <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 max-h-40">
              <img src={successTicket.photo} alt="Fault" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              if (onTicketCreated) onTicketCreated();
              setUserTab('my-tickets');
            }}
            className="flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm transition-all shadow-sm active:scale-98"
          >
            View in My Tickets
          </button>
          <button
            onClick={() => setSuccessTicket(null)}
            className="flex-1 py-3 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs sm:text-sm transition-all border border-slate-300 shadow-2xs"
          >
            Report Another Issue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          New Maintenance Issue
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Snap a photo & state your complaint. AI auto-extracts priority, category, and location.
        </p>
      </div>

      {/* API Key Modal/Input Box */}
      {showApiKeyInput && (
        <form onSubmit={handleSaveApiKey} className="mb-6 p-5 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-sm animate-slide-up space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-sky-600" />
              <span>Google Gemini AI Engine Configuration</span>
            </label>
            <button
              type="button"
              onClick={() => setShowApiKeyInput(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            SmartFixFlow - AI automatically discovers supported models on your key and falls back sequentially across <code className="font-mono text-slate-800">gemini-2.5-flash</code>, <code className="font-mono text-slate-800">gemini-2.0-flash</code>, and <code className="font-mono text-slate-800">gemini-1.5-flash-latest</code>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 shadow-2xs"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Model Tier</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 shadow-2xs cursor-pointer bg-white"
              >
                <option value="auto">Auto-detect (gemini-2.5-flash / 2.0-flash)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                <option value="gemini-1.5-flash-latest">Gemini 1.5 Flash Latest</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Legacy)</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {apiKey && (
              <button
                type="button"
                onClick={() => {
                  setApiKey('');
                  localStorage.removeItem('maintainx_gemini_api_key');
                }}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl"
              >
                Clear Key
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-2xs"
            >
              Save Configuration
            </button>
          </div>
        </form>
      )}

      {/* Error Alert Box with Immediate One-Click Local AI Fallback */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-3 animate-slide-up">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-rose-900">Dispatch Error</p>
            <p className="mt-0.5 leading-relaxed text-rose-800">{errorMessage}</p>
            
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSubmitWithLocalFallback}
                className="px-3.5 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs transition-colors shadow-2xs"
              >
                Submit using Local AI Chief Engineer Heuristics
              </button>
              <button
                type="button"
                onClick={() => setShowApiKeyInput(true)}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 font-semibold text-xs transition-colors shadow-2xs"
              >
                Change API Model
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN FORM CARD with Tailwind Glassmorphism (bg-white/80 backdrop-blur-md) */}
      <form onSubmit={handleSubmit} className="bg-white/80 backdrop-blur-md rounded-3xl p-5 sm:p-7 border border-slate-200/90 shadow-sm space-y-6">
        {/* 1. CAMERA & IMAGE UPLOAD SECTION */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Camera className="w-4 h-4 text-sky-600" />
              <span>Fault Photo Documentation</span>
            </label>
            <span className="text-[11px] text-slate-400 font-medium">Rear Camera Native</span>
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

          {/* IMAGE PREVIEW OR CAPTURE BUTTONS */}
          {!imagePreview ? (
            <div className="space-y-3">
              <div className="border-2 border-dashed border-slate-300 hover:border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center transition-all bg-slate-50/60 hover:bg-slate-50 text-center">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 mb-3 shadow-2xs">
                  <Camera className="w-7 h-7" />
                </div>
                <p className="text-sm font-bold text-slate-900">
                  Take a Photo or Upload Fault Image
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Native rear camera on mobile phones (<code className="font-mono text-slate-800 text-[11px]">capture="environment"</code>) or file picker on desktop.
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-transform active:scale-95"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Open Camera</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => filePickerRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-300 shadow-2xs transition-colors"
                  >
                    <ImagePlus className="w-4 h-4 text-slate-600" />
                    <span>Choose File</span>
                  </button>
                </div>
              </div>

              {/* Sample Photo Presets for Easy Desktop Testing */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                <span className="text-slate-400 text-[11px]">Instant Presets for Testing:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {SAMPLE_PHOTOS.map((sample) => (
                    <button
                      key={sample.label}
                      type="button"
                      onClick={() => handleSelectSample(sample)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium border border-slate-200 transition-colors"
                    >
                      + {sample.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* IMAGE PREVIEW AREA */
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 group shadow-2xs">
              <img
                src={imagePreview}
                alt="Fault preview"
                className="w-full max-h-72 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent flex items-end justify-between p-4">
                <div className="flex items-center gap-2 text-xs text-white font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Photo Ready for AI Analysis</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-white/95 hover:bg-white text-slate-900 text-xs font-semibold border border-slate-200 flex items-center gap-1.5 shadow-sm"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Retake</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-sm"
                    aria-label="Remove image"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. USER COMPLAINT TEXTAREA */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label htmlFor="complaint" className="text-sm font-bold text-slate-900">
              Describe the problem / User Complaint <span className="text-rose-500">*</span>
            </label>
            <span className="text-[11px] text-slate-400 font-mono">{complaint.length}/500</span>
          </div>
          <textarea
            id="complaint"
            rows={4}
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            placeholder="E.g., Water pipe burst under the cafeteria sink. Spraying cold water near electrical socket, urgent shutoff needed."
            maxLength={500}
            className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 text-sm transition-all shadow-2xs"
          />
        </div>

        {/* 3. SUBMIT BUTTON WITH LOADING STATE */}
        <div>
          <button
            type="submit"
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm sm:text-base shadow-sm hover:shadow-md transition-all active:scale-[0.99] disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-indigo-300" />
                <span>{aiStatusMessage || 'AI Processing...'}</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 text-sky-400" />
                <span>Analyze & Create Ticket</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
