import React, { useState, useRef } from 'react';
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

  if (!isOpen || !currentUser) return null;

  // Handle local image file upload (converts to base64 data URL)
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
      const dataUrl = event.target?.result;
      if (dataUrl) {
        setAvatarUrl(dataUrl);
        if (addToast) {
          addToast({
            type: 'info',
            title: 'Image Selected',
            message: 'Click "Save Changes" to apply your new profile photo.'
          });
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    setIsSaving(true);
    const updates = {
      avatar: avatarUrl.trim() || currentUser.avatar,
      name: name.trim() || currentUser.name,
      department: department.trim() || currentUser.department
    };

    if (updateUserProfile) {
      updateUserProfile(updates);
    }

    if (addToast) {
      addToast({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your profile picture and account settings have been saved.'
      });
    }

    setIsSaving(false);
    onClose();
  };

  const handleLogout = () => {
    onClose();
    if (logout) {
      logout();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div 
        className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-slide-up relative z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-2xs">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">User Profile Settings</h3>
              <p className="text-[11px] text-slate-500">Manage photo & account details</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Avatar Edit Section */}
          <div className="flex flex-col items-center text-center">
            <div className="relative group mb-3">
              <Avatar
                src={avatarUrl}
                name={name || currentUser?.name}
                size="w-24 h-24"
                className="ring-4 ring-slate-100 shadow-md text-xl"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2 rounded-full bg-slate-900 text-white shadow-md hover:bg-slate-800 transition-transform active:scale-95"
                title="Upload new image"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <p className="text-xs font-bold text-slate-900">{name || currentUser?.name}</p>
            <span className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wide">
              <ShieldCheck className="w-3 h-3 text-sky-600" />
              {currentUser?.roleDisplay || currentUser?.role || 'Campus User'}
            </span>

            {/* Change Picture Controls */}
            <div className="flex items-center gap-2 mt-4 w-full">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-slate-200/80 shadow-2xs"
              >
                <Upload className="w-3.5 h-3.5 text-slate-700" />
                <span>Upload Photo</span>
              </button>

              <button
                type="button"
                onClick={() => setIsUrlInputOpen(!isUrlInputOpen)}
                className="py-2 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-200 shadow-2xs"
                title="Paste image web link"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>URL</span>
              </button>
            </div>

            {/* Custom URL Input Accordion */}
            {isUrlInputOpen && (
              <div className="w-full mt-2.5 flex items-center gap-2">
                <input
                  type="url"
                  placeholder="Paste image URL (https://...)"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-1 focus:ring-slate-900"
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
                  className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                >
                  Apply
                </button>
              </div>
            )}

            {/* Quick Avatar Presets */}
            <div className="mt-4 w-full text-left">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Or Select Preset Avatar</span>
              </p>
              <div className="grid grid-cols-4 gap-2">
                {AVATAR_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAvatarUrl(p.url)}
                    className={`relative p-1 rounded-xl border transition-all flex flex-col items-center gap-1 ${
                      avatarUrl === p.url
                        ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <img src={p.url} alt={p.label} className="w-10 h-10 rounded-lg object-cover" />
                    <span className="text-[9px] font-medium text-slate-600 truncate w-full text-center">
                      {p.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Account Details Form */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Display Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                  placeholder="Your full name"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  disabled
                  value={currentUser?.email || ''}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Department / Assignment
              </label>
              <div className="relative">
                <Building className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                  placeholder="Campus Department or Specialty"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions: Save Changes and Direct Logout */}
        <div className="p-4 bg-slate-50 border-t border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full sm:w-auto py-2.5 px-3.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs order-2 sm:order-1"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-600" />
            <span>Log Out</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end order-1 sm:order-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
