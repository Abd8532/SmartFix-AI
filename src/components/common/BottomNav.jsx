import React from 'react';
import { useTickets } from '../../context/TicketContext';
import { PlusCircle, ListTodo, Wrench, Shield } from 'lucide-react';

export default function BottomNav() {
  const { role, userTab, setUserTab, stats } = useTickets();

  if (!role) return null;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#18181c] border-t border-[#2a2a32] pb-safe text-zinc-400">
      <div className="flex items-center justify-around h-14 px-2">
        {role === 'user' && (
          <>
            <button
              onClick={() => setUserTab('new-issue')}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition ${
                userTab === 'new-issue'
                  ? 'text-indigo-400 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span className="text-[10px] mt-0.5">New Issue</span>
            </button>

            <button
              onClick={() => setUserTab('my-tickets')}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition relative ${
                userTab === 'my-tickets'
                  ? 'text-indigo-400 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <ListTodo className="w-4 h-4" />
              <span className="text-[10px] mt-0.5">My Tickets</span>
              {stats?.userTicketsCount > 0 && (
                <span className="absolute top-1 right-[28%] px-1.5 py-0.2 bg-indigo-600 text-white text-[9px] font-bold rounded-full min-w-4 text-center">
                  {stats.userTicketsCount}
                </span>
              )}
            </button>
          </>
        )}

        {role === 'technician' && (
          <div className="flex-1 text-center py-2 text-xs text-indigo-400 font-semibold flex items-center justify-center gap-1.5">
            <Wrench className="w-4 h-4" />
            <span>Field Technician Workspace</span>
          </div>
        )}

        {role === 'admin' && (
          <div className="flex-1 text-center py-2 text-xs text-indigo-400 font-semibold flex items-center justify-center gap-1.5">
            <Shield className="w-4 h-4" />
            <span>Facilities Admin Portal</span>
          </div>
        )}
      </div>
    </nav>
  );
}
