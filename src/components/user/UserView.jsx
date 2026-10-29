import React from 'react';
import { useTickets } from '../../context/TicketContext';
import NewIssueForm from './NewIssueForm';
import MyTicketsList from './MyTicketsList';
import { PlusCircle, ListTodo } from 'lucide-react';

export default function UserView({ onSelectTicket }) {
  const { userTab, setUserTab, stats } = useTickets();

  return (
    <div className="w-full">
      {/* Mobile Tab Switcher at top */}
      <div className="md:hidden flex rounded-xl bg-slate-200/80 p-1 mb-6 border border-slate-200">
        <button
          onClick={() => setUserTab('new-issue')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            userTab === 'new-issue'
              ? 'bg-white text-slate-900 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <PlusCircle className="w-4 h-4 text-slate-800" />
          <span>New Issue</span>
        </button>
        <button
          onClick={() => setUserTab('my-tickets')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all relative ${
            userTab === 'my-tickets'
              ? 'bg-white text-slate-900 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ListTodo className="w-4 h-4 text-slate-800" />
          <span>My Tickets</span>
          {stats.userTicketsCount > 0 && (
            <span className="px-1.5 py-0.2 bg-slate-900 text-white text-[10px] font-bold rounded-full">
              {stats.userTicketsCount}
            </span>
          )}
        </button>
      </div>

      {userTab === 'new-issue' ? (
        <NewIssueForm onTicketCreated={() => setUserTab('my-tickets')} />
      ) : (
        <MyTicketsList onSelectTicket={onSelectTicket} />
      )}
    </div>
  );
}
