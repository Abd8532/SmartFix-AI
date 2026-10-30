import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTickets } from '../../context/TicketContext';
import Avatar from './Avatar';
import UserProfileModal from './UserProfileModal';
import { Wrench, Zap, LogOut, Camera } from 'lucide-react';

export default function Navbar({
  adminTab,
  setAdminTab,
  onLogout
}) {
  const { currentUser, logout } = useAuth();
  const { userTab, setUserTab } = useTickets();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const handleLogout = onLogout || logout;
  if (!currentUser) return null;

  // Role Pill Config
  let roleLabel = '⚡ Campus User';
  if (currentUser.role === 'admin') {
    roleLabel = '⚡ Admin';
  } else if (currentUser.role === 'technician') {
    roleLabel = `⚡ Tech (${currentUser.specialty || 'General'})`;
  }

  return (
    <header className="sticky top-0 z-40 w-full h-14 bg-[#18181c] border-b border-[#2a2a32] px-4 lg:px-6 flex items-center justify-between">
      {/* Left: Brand Icon + Title + Pill Navigation */}
      <div className="flex items-center gap-4 lg:gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Wrench className="w-4 h-4" />
          </div>
          <span className="font-bold text-base tracking-tight text-white font-['Plus_Jakarta_Sans',sans-serif]">
            FixFlow AI
          </span>
        </div>

        {/* Horizontal Pill Navigation for Roles */}
        <nav className="hidden md:flex items-center gap-1.5 pl-2 border-l border-[#2a2a32]">
          {currentUser.role === 'user' && (
            <>
              <button
                type="button"
                onClick={() => setUserTab('my-tickets')}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  userTab === 'my-tickets'
                    ? 'bg-[#26262e] text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                All Tickets
              </button>
              <button
                type="button"
                onClick={() => setUserTab('new-issue')}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  userTab === 'new-issue'
                    ? 'bg-[#26262e] text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Raise Issue
              </button>
            </>
          )}

          {currentUser.role === 'technician' && (
            <>
              <button
                type="button"
                className="bg-[#26262e] text-white rounded-lg px-3 py-1.5 text-sm font-medium"
              >
                Department Queue
              </button>
            </>
          )}

          {currentUser.role === 'admin' && (
            <>
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'approvals', label: 'Approvals' },
                { id: 'requests', label: 'Requests' },
                { id: 'hazards', label: 'Hazards' },
                { id: 'audit', label: 'Audit' },
                { id: 'settings', label: 'Settings' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAdminTab && setAdminTab(tab.id)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    adminTab === tab.id
                      ? 'bg-[#26262e] text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </>
          )}
        </nav>
      </div>

      {/* Right: Role Badge + User Profile Avatar + Clean Dark Sign Out Button */}
      <div className="flex items-center gap-3">
        {/* Pro-style Role Badge */}
        <div className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1 rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition">
          <Zap className="w-3.5 h-3.5 fill-current" />
          <span>{roleLabel}</span>
        </div>

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
