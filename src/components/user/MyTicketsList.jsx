import React, { useState, useMemo } from 'react';
import { useTickets, isUserTicket } from '../../context/TicketContext';
import { 
  Search, 
  Calendar, 
  MapPin, 
  PlusCircle, 
  CheckCircle2, 
  ExternalLink,
  ImageIcon
} from 'lucide-react';
import { STATUS_CONFIG } from '../../types/mockData';

export default function MyTicketsList({ onSelectTicket }) {
  const { tickets, currentUser, setUserTab, handleTicketClosure, stats } = useTickets();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const userTickets = useMemo(() => {
    return stats.userTickets || tickets.filter((t) => isUserTicket(t, currentUser));
  }, [stats.userTickets, tickets, currentUser]);

  const filteredTickets = useMemo(() => {
    return userTickets.filter((ticket) => {
      const matchesStatus = statusFilter === 'All' || ticket.status === statusFilter;
      const matchesSearch =
        ticket.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ticket.location && ticket.location.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (ticket.category && ticket.category.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesStatus && matchesSearch;
    });
  }, [userTickets, statusFilter, searchQuery]);

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-sky-600 mb-1">
            CAMPUS DISPATCH
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            My Maintenance Tickets
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Track status updates and resolution logs for issues you reported.
          </p>
        </div>

        <button
          onClick={() => setUserTab('new-issue')}
          className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Report New Fault</span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets by ID, keyword, or room location..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {['All', 'Open', 'In Progress', 'Done'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                statusFilter === st
                  ? 'bg-slate-900 text-white shadow-2xs font-semibold'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              {st === 'Done' ? 'Resolved' : st === 'Open' ? 'Assigned' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket Cards */}
      {filteredTickets.length === 0 ? (
        <div className="bg-white p-8 sm:p-12 rounded-2xl border border-slate-200 text-center max-w-md mx-auto my-6 shadow-2xs">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">No Tickets Found</h3>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            {searchQuery || statusFilter !== 'All'
              ? 'No tickets match your filter. Try adjusting your search query.'
              : 'You have not reported any equipment faults or maintenance issues yet.'}
          </p>
          <button
            onClick={() => setUserTab('new-issue')}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-all inline-flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Raise Your First Issue</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTickets.map((ticket) => {
            const statusStyle = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.Open;
            const dateStr = new Date(ticket.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            let priorityBadgeClass = "bg-[#047857] text-white";
            if (ticket.priority === 'Emergency' || ticket.priority === 'Critical') {
              priorityBadgeClass = "bg-[#b91c1c] text-white";
            } else if (ticket.priority === 'Urgent' || ticket.priority === 'High') {
              priorityBadgeClass = "bg-[#b45309] text-white";
            }

            return (
              <div
                key={ticket.id}
                onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
                className="bg-white hover:border-slate-400 rounded-2xl p-4 border border-slate-200/90 transition-all cursor-pointer group flex flex-col justify-between shadow-2xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-sky-700">
                        #{ticket.id}
                      </span>
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{dateStr}</span>
                      </span>
                    </div>

                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle.pill}`}>
                      <span>{statusStyle.label}</span>
                    </span>
                  </div>

                  <div className="flex gap-3 mb-3">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 relative">
                      {ticket.photo ? (
                        <img
                          src={ticket.photo}
                          alt="Ticket preview"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                          <ImageIcon className="w-6 h-6 mb-1 text-slate-400" />
                          <span className="text-[9px]">No photo</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-sky-700 transition-colors line-clamp-1 mb-1">
                        {ticket.title}
                      </h4>
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {ticket.description}
                      </p>

                      {ticket.location && (
                        <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-2 truncate">
                          <MapPin className="w-3 h-3 text-sky-600 shrink-0" />
                          <span className="truncate font-medium">{ticket.location}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dual-approval resolution verification */}
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-100">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold 
                    ${ticket.status === 'Completed' ? 'bg-green-100 text-green-700' : 
                      ticket.status === 'Pending User Verification' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}
                  >
                    {ticket.status}
                  </span>

                  {ticket.status === 'Pending User Verification' && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTicketClosure(ticket.id, 'user');
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition-colors shadow-2xs"
                    >
                      Confirm Issue Resolved
                    </button>
                  )}
                </div>

                <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                      {ticket.category}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${priorityBadgeClass}`}>
                      {ticket.priority === 'Critical' ? 'Emergency' : ticket.priority === 'High' ? 'Urgent' : ticket.priority}
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1 text-slate-800 font-semibold group-hover:translate-x-0.5 transition-transform">
                    <span>Details</span>
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
