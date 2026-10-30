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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in" onClick={onClose}>
      <div 
        className="bg-white rounded-3xl max-w-md w-full shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] border border-[#E6EFF5] overflow-hidden animate-slide-up relative z-10 text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E6EFF5] flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E7EDFF] text-[#2D60FF] flex items-center justify-center shadow-xs">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 font-['Plus_Jakarta_Sans']">User Profile Settings</h3>
              <p className="text-xs font-medium text-slate-500">Manage photo & account details</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-[#F5F7FA] transition-all duration-200 active:scale-[0.98]"
          >
            <X className="w-5 h-5" />
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
                className="ring-4 ring-[#E6EFF5] shadow-md text-xl"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2.5 rounded-full bg-[#2D60FF] hover:bg-[#1814F3] text-white shadow-md transition-all duration-200 active:scale-[0.98]"
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

            <p className="text-base font-bold text-slate-900 font-['Plus_Jakarta_Sans']">{name || currentUser?.name}</p>
            <span className="inline-flex items-center gap-1 mt-1 px-3 py-1 rounded-full text-xs font-bold bg-[#E7EDFF] text-[#2D60FF] border border-[#2D60FF]/30 uppercase tracking-wide">
              <ShieldCheck className="w-3.5 h-3.5 text-[#2D60FF]" />
              {currentUser?.roleDisplay || currentUser?.role || 'Campus User'}
            </span>

            {/* Change Picture Controls */}
            <div className="flex items-center gap-3 mt-6 w-full">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 h-11 px-4 rounded-2xl bg-[#F5F7FA] hover:bg-[#E6EFF5] text-slate-900 text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] border border-[#DFEAF2] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]"
              >
                <Upload className="w-4 h-4 text-slate-500" />
                <span>Upload Photo</span>
              </button>

              <button
                type="button"
                onClick={() => setIsUrlInputOpen(!isUrlInputOpen)}
                className="h-11 px-4 rounded-2xl bg-[#F5F7FA] hover:bg-[#E6EFF5] text-slate-600 hover:text-slate-900 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-[0.98] border border-[#DFEAF2] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]"
                title="Paste image web link"
              >
                <LinkIcon className="w-4 h-4" />
                <span>URL</span>
              </button>
            </div>

            {/* Custom URL Input Accordion */}
            {isUrlInputOpen && (
              <div className="w-full mt-3 flex items-center gap-2">
                <input
                  type="url"
                  placeholder="Paste image URL (https://...)"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="flex-1 h-11 text-xs px-4 rounded-2xl border border-[#DFEAF2] bg-[#F5F7FA] text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-[#2D60FF] focus:ring-2 focus:ring-[#2D60FF]/20"
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
                  className="h-11 px-5 rounded-2xl bg-[#2D60FF] text-white text-xs font-bold hover:bg-[#1814F3] transition-all duration-200 active:scale-[0.98]"
                >
                  Apply
                </button>
              </div>
            )}

            {/* Quick Avatar Presets */}
            <div className="mt-6 w-full text-left">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#FFBB38]" />
                <span>Or Select Preset Avatar</span>
              </p>
              <div className="grid grid-cols-4 gap-2.5">
                {AVATAR_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAvatarUrl(p.url)}
                    className={`relative p-1.5 rounded-2xl border transition-all duration-200 active:scale-[0.98] flex flex-col items-center gap-1 ${
                      avatarUrl === p.url
                        ? 'border-[#2D60FF] bg-[#E7EDFF] ring-2 ring-[#2D60FF]/30 shadow-xs'
                        : 'border-[#E6EFF5] hover:border-[#2D60FF]/40 bg-[#F5F7FA]'
                    }`}
                  >
                    <img src={p.url} alt={p.label} className="w-12 h-12 rounded-xl object-cover" />
                    <span className="text-[10px] font-semibold text-slate-600 truncate w-full text-center">
                      {p.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Account Details Form */}
          <div className="space-y-4 pt-4 border-t border-[#E6EFF5]">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 tracking-wider font-['Plus_Jakarta_Sans']">
                Display Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 pl-11 pr-4 text-xs sm:text-sm font-medium rounded-2xl border border-[#DFEAF2] bg-[#F5F7FA] text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-[#2D60FF] focus:ring-2 focus:ring-[#2D60FF]/20 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]"
                  placeholder="Your full name"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 tracking-wider font-['Plus_Jakarta_Sans']">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  disabled
                  value={currentUser?.email || ''}
                  className="w-full h-11 pl-11 pr-4 text-xs sm:text-sm font-medium rounded-2xl border border-[#E6EFF5] bg-[#F5F7FA]/60 text-slate-500 cursor-not-allowed outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 tracking-wider font-['Plus_Jakarta_Sans']">
                Department / Assignment
              </label>
              <div className="relative">
                <Building className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full h-11 pl-11 pr-4 text-xs sm:text-sm font-medium rounded-2xl border border-[#DFEAF2] bg-[#F5F7FA] text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-[#2D60FF] focus:ring-2 focus:ring-[#2D60FF]/20 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]"
                  placeholder="Campus Department or Specialty"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions: Save Changes and Direct Logout */}
        <div className="p-6 bg-white border-t border-[#E6EFF5] flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full sm:w-auto h-11 px-5 rounded-2xl border border-rose-200 bg-white hover:bg-rose-50 text-[#FF4B4A] text-xs font-bold flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] shadow-xs order-2 sm:order-1"
          >
            <LogOut className="w-4 h-4 text-[#FF4B4A]" />
            <span>Log Out</span>
          </button>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end order-1 sm:order-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 rounded-2xl border border-[#E6EFF5] bg-white hover:bg-[#F5F7FA] text-slate-600 hover:text-slate-900 text-xs font-semibold transition-all duration-200 active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="h-11 px-6 rounded-2xl bg-[#2D60FF] hover:bg-[#1814F3] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-[#2D60FF]/25 transition-all duration-200 active:scale-[0.98]"
            >
              <Check className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
