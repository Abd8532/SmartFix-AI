import React from 'react';
import { useTickets } from '../../context/TicketContext';
import Avatar from './Avatar';
import { Wrench } from 'lucide-react';

export default function Header() {
  const { role, currentUser, logout } = useTickets();

  if (!role) return null;

  return (
    <header className="sticky top-0 z-30 w-full bg-white border-b border-slate-200/90 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Title: FixFlow AI */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-sm">
            <Wrench className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-lg tracking-tight text-slate-900">
            FixFlow <span className="text-sky-600">AI</span>
          </span>
        </div>

        {/* Right: User Account & Log out */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <Avatar
              src={currentUser?.avatar}
              name={currentUser?.name}
              size="w-8 h-8"
              className="ring-1 ring-slate-200"
            />
            <div className="text-left hidden sm:block">
              <p className="text-xs font-semibold text-slate-900 leading-tight">{currentUser?.name}</p>
              <p className="text-[11px] text-slate-500 capitalize">{currentUser?.roleDisplay || 'Campus Staff'}</p>
            </div>
          </div>

          <button
            onClick={logout}
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
