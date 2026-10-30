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

  // Role pill styling in BankDash style
  let roleBadgeClass = 'bg-[#E7EDFF] text-[#2D60FF] border border-[#2D60FF]/20';
  let roleLabel = user.roleDisplay || 'Campus User';

  if (user.role === 'admin') {
    roleBadgeClass = 'bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/30';
    roleLabel = user.roleDisplay || 'Administrator';
  } else if (user.role === 'technician') {
    roleBadgeClass = 'bg-[#DCFAF8] text-[#16DBCC] border border-[#16DBCC]/30';
    roleLabel = user.roleDisplay || 'Field Technician';
  }

  return (
    <header className="sticky top-0 z-30 w-full bg-white border-b border-[#E6EFF5] text-[#343C6A] shadow-xs">
      <div className="w-full px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
        {/* Title: SmartFixFlow - AI (BankDash Brand style) */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#2D60FF] flex items-center justify-center text-white shadow-md shadow-[#2D60FF]/25">
            <Wrench className="w-5 h-5" />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-[#343C6A] font-['Plus_Jakarta_Sans']">
            SmartFixFlow <span className="text-[#2D60FF]">- AI</span>
          </span>
        </div>

        {/* Right: User Account & Log out */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* User Profile Pill button */}
          <button
            type="button"
            onClick={() => setIsProfileModalOpen(true)}
            className="flex items-center gap-2.5 p-1 rounded-2xl hover:bg-[#F5F7FA] transition-all duration-200 active:scale-[0.98] text-left group border border-transparent hover:border-[#E6EFF5]"
            title="View profile & change photo"
          >
            <div className="relative">
              <Avatar
                src={user?.avatar}
                name={user?.name}
                size="w-10 h-10"
                className="ring-2 ring-[#DFEAF2]"
              />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#2D60FF] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-xs">
                <Camera className="w-2.5 h-2.5" />
              </div>
            </div>
            <div className="text-left hidden sm:flex flex-col">
              <p className="text-xs font-bold text-slate-900 leading-tight group-hover:text-[#2D60FF] transition-colors font-['Plus_Jakarta_Sans']">{user?.name}</p>
              <div className="mt-0.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${roleBadgeClass}`}>
                  {roleLabel}
                </span>
              </div>
            </div>
          </button>

          <button
            onClick={handleLogout}
            className="h-10 px-4 text-xs font-bold text-slate-500 hover:text-rose-600 bg-[#F5F7FA] hover:bg-rose-50 border border-[#DFEAF2] rounded-full transition-all duration-200 active:scale-[0.98] shadow-xs"
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
