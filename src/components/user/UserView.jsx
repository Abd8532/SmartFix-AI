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
      <div className="md:hidden flex rounded-2xl bg-white p-1.5 mb-6 border border-[#E6EFF5] shadow-xs">
        <button
          onClick={() => setUserTab('new-issue')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            userTab === 'new-issue'
              ? 'bg-[#2D60FF] text-white shadow-md shadow-[#2D60FF]/25 font-bold'
              : 'text-[#718EBF] hover:text-[#343C6A]'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Issue</span>
        </button>
        <button
          onClick={() => setUserTab('my-tickets')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all relative ${
            userTab === 'my-tickets'
              ? 'bg-[#2D60FF] text-white shadow-md shadow-[#2D60FF]/25 font-bold'
              : 'text-[#718EBF] hover:text-[#343C6A]'
          }`}
        >
          <ListTodo className="w-4 h-4" />
          <span>My Tickets</span>
          {stats.userTicketsCount > 0 && (
            <span className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full ${
              userTab === 'my-tickets' ? 'bg-white/20 text-white' : 'bg-[#2D60FF] text-white'
            }`}>
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
