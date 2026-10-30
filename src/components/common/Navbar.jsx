import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Avatar from './Avatar';
import UserProfileModal from './UserProfileModal';
import { Wrench, LogOut, Camera } from 'lucide-react';

export default function Navbar({ onLogout }) {
  const { currentUser, logout } = useAuth();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const handleLogout = onLogout || logout;
  if (!currentUser) return null;

  return (
    <header className="sticky top-0 z-40 w-full h-14 bg-[#18181c] border-b border-[#2a2a32] px-4 lg:px-6 flex items-center justify-between">
      {/* Left: Brand Icon + Title */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
          <Wrench className="w-4 h-4" />
        </div>
        <span className="font-bold text-base tracking-tight text-white font-['Plus_Jakarta_Sans',sans-serif]">
          SmartFix AI
        </span>
      </div>

      {/* Right: User Profile Avatar + Clean Dark Sign Out Button */}
      <div className="flex items-center gap-3">
        {/* Profile Avatar Trigger Button */}
        <button
          type="button"
          onClick={() => setIsProfileModalOpen(true)}
          className="flex items-center gap-2 p-1 rounded-lg hover:bg-[#24242b] border border-transparent hover:border-[#32323b] transition group"
          title="Account profile & photo settings"
        >
          <div className="relative">
            <Avatar
              src={currentUser?.avatar}
              name={currentUser?.name}
              size="w-7 h-7"
              className="ring-1 ring-white/10"
            />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-indigo-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
              <Camera className="w-2 h-2" />
            </div>
          </div>
          <span className="hidden sm:inline-block text-xs font-medium text-zinc-300 group-hover:text-white">
            {currentUser?.name || 'Account'}
          </span>
        </button>

        {/* NeetCode Clean Dark Sign Out Button */}
        <button
          type="button"
          onClick={handleLogout}
          className="border border-[#32323b] bg-[#1e1e24] text-zinc-200 hover:bg-[#282830] hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </header>
  );
}
