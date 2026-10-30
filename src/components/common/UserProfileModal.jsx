import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTickets } from '../../context/TicketContext';
import Avatar from './Avatar';
import { 
  X, 
  Camera, 
  Upload, 
  LogOut, 
  Check, 
  User, 
  Mail, 
  ShieldCheck, 
  Sparkles,
  Link as LinkIcon,
  Building
} from 'lucide-react';

const AVATAR_PRESETS = [
  {
    label: 'Campus Member',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240&auto=format&fit=crop&q=80'
  },
  {
    label: 'Field Engineer',
    url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&auto=format&fit=crop&q=80'
  },
  {
    label: 'Executive / Admin',
    url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=240&auto=format&fit=crop&q=80'
  },
  {
    label: 'Student / Tech',
    url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=240&auto=format&fit=crop&q=80'
  }
];

export default function UserProfileModal({ isOpen, onClose }) {
  const { currentUser, updateUserProfile, logout } = useAuth();
  const { addToast } = useTickets();

  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar || '');
  const [name, setName] = useState(currentUser?.name || '');
  const [department, setDepartment] = useState(currentUser?.department || currentUser?.specialty || '');
  const [isUrlInputOpen, setIsUrlInputOpen] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      setAvatarUrl(currentUser.avatar || '');
      setName(currentUser.name || '');
      setDepartment(currentUser.department || currentUser.specialty || '');
      setIsUrlInputOpen(false);
      setCustomUrl('');
    }
  }, [isOpen, currentUser]);

  if (!isOpen || !currentUser) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      if (addToast) {
        addToast({
          type: 'error',
          title: 'Invalid File',
          message: 'Please choose an image file (PNG, JPG, WebP).'
        });
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result;
      if (!rawDataUrl) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 320;
        let w = img.width;
        let h = img.height;

        if (w > h && w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
        setAvatarUrl(compressedDataUrl);

        if (addToast) {
          addToast({
            type: 'info',
            title: 'Photo Uploaded',
            message: 'Click "Save Changes" to persist your new profile photo.'
          });
        }
      };
      img.onerror = () => {
        setAvatarUrl(rawDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const updates = {
      avatar: avatarUrl.trim() || currentUser.avatar,
      name: name.trim() || currentUser.name,
      department: department.trim() || currentUser.department
    };

    try {
      if (updateUserProfile) {
        await updateUserProfile(updates);
      }

      if (addToast) {
        addToast({
          type: 'success',
          title: 'Profile Updated',
          message: 'Your profile picture and account settings have been saved.'
        });
      }
      onClose();
    } catch (err) {
      if (addToast) {
        addToast({
          type: 'error',
          title: 'Update Error',
          message: err?.message || 'Failed to save profile changes. Please try again.'
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    onClose();
    if (logout) {
      logout();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 transition-opacity" onClick={onClose}>
      <div 
        className="bg-[#1c1c21] rounded-xl max-w-md w-full border border-[#2a2a32] overflow-hidden relative z-10 text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#2a2a32] flex items-center justify-between bg-[#18181c]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white font-['Plus_Jakarta_Sans',sans-serif]">User Profile Settings</h3>
              <p className="text-[11px] text-zinc-400">Manage photo & account details</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#282830] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Avatar Edit Section */}
          <div className="flex flex-col items-center text-center">
            <div className="relative group mb-3">
              <Avatar
                src={avatarUrl}
                name={name || currentUser?.name}
                size="w-20 h-20"
                className="ring-2 ring-[#32323b] text-lg"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow transition"
                title="Upload new image"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <h4 className="text-sm font-bold text-white">{name || currentUser?.name}</h4>
            <span className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <ShieldCheck className="w-3 h-3" />
              <span>{currentUser?.roleDisplay || currentUser?.role?.toUpperCase()}</span>
            </span>

            {/* Photo Action Buttons */}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 px-3 rounded-lg bg-[#24242b] hover:bg-[#2e2e38] text-zinc-200 border border-[#32323b] text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Upload className="w-3.5 h-3.5 text-zinc-400" />
                <span>Upload Photo</span>
              </button>

              <button
                type="button"
                onClick={() => setIsUrlInputOpen(!isUrlInputOpen)}
                className="h-8 px-3 rounded-lg bg-[#24242b] hover:bg-[#2e2e38] text-zinc-200 border border-[#32323b] text-xs font-medium flex items-center gap-1.5 transition"
              >
                <LinkIcon className="w-3.5 h-3.5 text-zinc-400" />
                <span>URL</span>
              </button>
            </div>

            {/* Custom URL Input Box */}
            {isUrlInputOpen && (
              <div className="mt-2.5 w-full flex items-center gap-1.5">
                <input
                  type="url"
                  placeholder="Paste direct image URL..."
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="flex-1 h-8 px-3 text-xs bg-[#24242b] border border-[#32323b] text-white rounded-lg focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customUrl.trim()) {
                      setAvatarUrl(customUrl.trim());
                      setCustomUrl('');
                      setIsUrlInputOpen(false);
                    }
                  }}
                  className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
                >
                  Set
                </button>
              </div>
            )}
          </div>

          {/* Preset Avatars */}
          <div>
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Or Select Preset Avatar
            </p>
            <div className="grid grid-cols-4 gap-2">
              {AVATAR_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setAvatarUrl(preset.url)}
                  className={`p-1.5 rounded-lg border text-center transition ${
                    avatarUrl === preset.url
                      ? 'bg-indigo-600/20 border-indigo-500'
                      : 'bg-[#24242b] border-[#32323b] hover:border-zinc-500'
                  }`}
                >
                  <img
                    src={preset.url}
                    alt={preset.label}
                    className="w-10 h-10 rounded-full mx-auto object-cover"
                  />
                  <span className="block text-[9px] text-zinc-400 mt-1 truncate">
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Account Details */}
          <div className="space-y-3 pt-2 border-t border-[#2a2a32]">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-[#24242b] border border-[#32323b] text-white rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <input
                type="email"
                disabled
                value={currentUser?.email}
                className="w-full h-9 px-3 text-xs bg-[#1e1e24] border border-[#2a2a32] text-zinc-500 rounded-lg cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-[#2a2a32] bg-[#18181c] flex items-center justify-between">
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs text-rose-400 hover:text-rose-300 font-medium flex items-center gap-1.5 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-[#32323b] bg-[#24242b] text-zinc-300 hover:text-white text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-60"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
