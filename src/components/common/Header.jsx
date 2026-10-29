import React from 'react';
import { useTickets } from '../../context/TicketContext';
import Avatar from './Avatar';
import { Wrench, ShieldCheck } from 'lucide-react';

export default function Header({ currentUser: propUser, onLogout }) {
  const context = useTickets();
  const user = propUser || context?.currentUser;
  const handleLogout = onLogout || context?.logout;

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
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
          <div className="flex items-center gap-2.5">
            <Avatar
              src={user?.avatar}
              name={user?.name}
              size="w-8 h-8"
              className="ring-1 ring-slate-200"
            />
            <div className="text-left hidden sm:flex flex-col">
              <p className="text-xs font-semibold text-slate-900 leading-tight">{user?.name}</p>
              <div className="mt-0.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${roleBadgeClass}`}>
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-all shadow-2xs"
            aria-label="Log out"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
