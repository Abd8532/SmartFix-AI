import React from 'react';
import { useTickets } from '../../context/TicketContext';
import { PlusCircle, ListTodo, Wrench, Shield } from 'lucide-react';

export default function BottomNav() {
  const { role, userTab, setUserTab, stats } = useTickets();

  if (!role) return null;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E6EFF5] pb-safe text-[#718EBF] shadow-lg">
      <div className="flex items-center justify-around h-16 px-2">
        {role === 'user' && (
          <>
            <button
              onClick={() => setUserTab('new-issue')}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all duration-200 active:scale-[0.98] ${
                userTab === 'new-issue'
                  ? 'text-[#2D60FF] font-bold'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${
                userTab === 'new-issue' ? 'bg-[#E7EDFF] text-[#2D60FF]' : ''
              }`}>
                <PlusCircle className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5">New Issue</span>
            </button>

            <button
              onClick={() => setUserTab('my-tickets')}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all duration-200 active:scale-[0.98] relative ${
                userTab === 'my-tickets'
                  ? 'text-[#2D60FF] font-bold'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${
                userTab === 'my-tickets' ? 'bg-[#E7EDFF] text-[#2D60FF]' : ''
              }`}>
                <ListTodo className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5">My Tickets</span>
              {stats.userTicketsCount > 0 && (
                <span className="absolute top-1.5 right-[28%] px-1.5 py-0.2 bg-[#2D60FF] text-white text-[10px] font-bold rounded-full min-w-4 text-center">
                  {stats.userTicketsCount}
                </span>
              )}
            </button>
          </>
        )}

        {role === 'technician' && (
          <div className="flex items-center justify-center w-full text-xs text-[#343C6A] font-semibold gap-2">
            <Wrench className="w-4 h-4 text-[#2D60FF]" />
            <span>Technician Resolution Mode</span>
          </div>
        )}

        {role === 'admin' && (
          <div className="flex items-center justify-center w-full text-xs text-[#343C6A] font-semibold gap-2">
            <Shield className="w-4 h-4 text-[#2D60FF]" />
            <span>Facilities Administration</span>
          </div>
        )}
      </div>
    </nav>
  );
}
