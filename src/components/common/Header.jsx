import React, { useState } from 'react';
import { useTickets } from '../../context/TicketContext';
import Avatar from './Avatar';
import UserProfileModal from './UserProfileModal';
import { Wrench, ShieldCheck, Camera } from 'lucide-react';

export default function Header({ currentUser: propUser, onLogout }) {
  const context = useTickets();
  const user = propUser || context?.currentUser;
  const handleLogout = onLogout || context?.logout;
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  if (!user) return null;

  // Role pill styling
  let roleBadgeClass = 'bg-blue-100 text-blue-800 border border-blue-200';
  let roleLabel = user.roleDisplay || 'Campus User';

  if (user.role === 'admin') {
    roleBadgeClass = 'bg-purple-100 text-purple-800 border border-purple-200';
    roleLabel = user.roleDisplay || 'Administrator';
  } else if (user.role === 'technician') {
    roleBadgeClass = 'bg-amber-100 text-amber-800 border border-amber-200';
    roleLabel = user.roleDisplay || 'Field Technician';
  }

  return (
    <header className="sticky top-0 z-30 w-full bg-white border-b border-slate-200/90 shadow-xs">
      <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Title: SmartFixFlow - AI */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-sm">
            <Wrench className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-lg tracking-tight text-slate-900">
            SmartFixFlow <span className="text-sky-600">- AI</span>
          </span>
        </div>

        {/* Right: User Account, Role Pill & Log out */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setIsProfileModalOpen(true)}
            className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-slate-100 transition-colors text-left group"
            title="View profile & change photo"
          >
            <div className="relative">
              <Avatar
                src={user?.avatar}
                name={user?.name}
                size="w-8 h-8"
                className="ring-1 ring-slate-200"
              />
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-slate-900 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-2 h-2" />
              </div>
            </div>
            <div className="text-left hidden sm:flex flex-col">
              <p className="text-xs font-semibold text-slate-900 leading-tight group-hover:text-sky-700 transition-colors">{user?.name}</p>
              <div className="mt-0.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${roleBadgeClass}`}>
                  {roleLabel}
                </span>
              </div>
            </div>
          </button>

          <button
            onClick={handleLogout}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-all shadow-2xs"
            aria-label="Log out"
          >
            Log out
          </button>
        </div>
      </div>

      {/* User Profile & Image Modal */}
      <UserProfileModal 
        isOpen={isProfileModalOpen} 
        onClose={() => setIsProfileModalOpen(false)} 
      />
    </header>
  );
}
