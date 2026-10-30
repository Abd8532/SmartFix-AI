import React, { useState, useMemo } from 'react';
import { useTickets, isUserTicket } from '../../context/TicketContext';
import EmptyState from '../common/EmptyState';
import { 
  Search, 
  Calendar, 
  MapPin, 
  PlusCircle, 
  CheckCircle2, 
  ExternalLink,
  ImageIcon,
  CameraOff,
  ClipboardCheck,
  Trash2,
  Clock
} from 'lucide-react';
import { STATUS_CONFIG } from '../../types/mockData';

export default function MyTicketsList({ onSelectTicket }) {
  const { tickets, currentUser, setUserTab, handleTicketClosure, deleteTicket, stats } = useTickets();

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
    <div className="space-y-6 pb-16 text-slate-900">
      {/* Header - Center Aligned Hero Section */}
      <div className="text-center max-w-2xl mx-auto mb-8">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
          CAMPUS DISPATCH
        </p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-['Plus_Jakarta_Sans']">
          My Maintenance Tickets
        </h2>
        <p className="text-sm font-medium text-slate-500 mt-1.5">
          Track status updates and resolution logs for issues you reported.
        </p>
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setUserTab('new-issue')}
            className="h-11 px-6 rounded-2xl bg-[#2D60FF] hover:bg-[#1814F3] text-white text-xs font-bold shadow-md shadow-[#2D60FF]/25 transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Report New Fault</span>
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets by ID, keyword, or room location..."
            className="w-full h-11 pl-11 pr-4 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2] text-xs sm:text-sm font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#2D60FF] focus:ring-2 focus:ring-[#2D60FF]/20 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)] transition-all"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {['All', 'Open', 'In Progress', 'Done'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`h-11 px-5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all duration-200 active:scale-[0.98] ${
                statusFilter === st
                  ? 'bg-[#2D60FF] text-white shadow-md shadow-[#2D60FF]/25 font-bold'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]'
              }`}
            >
              {st === 'Done' ? 'Resolved' : st === 'Open' ? 'Assigned' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket Cards */}
      {filteredTickets.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Queue is clear"
          subtitle="Great job, all maintenance requests are resolved."
          action={
            <button
              onClick={() => setUserTab('new-issue')}
              className="h-11 px-6 rounded-2xl bg-[#2D60FF] hover:bg-[#1814F3] text-white text-xs font-bold shadow-md shadow-[#2D60FF]/25 transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Raise Your First Issue</span>
            </button>
          }
        />
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

            let priorityBadgeClass = "bg-[#DCFAF8] text-[#16DBCC] border border-[#16DBCC]/30";
            if (ticket.priority === 'Emergency' || ticket.priority === 'Critical') {
              priorityBadgeClass = "bg-[#FFE0EB] text-[#FF4B4A] border border-[#FF4B4A]/30";
            } else if (ticket.priority === 'Urgent' || ticket.priority === 'High') {
              priorityBadgeClass = "bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/30";
            }

            return (
              <div
                key={ticket.id}
                onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
                className="bg-white rounded-3xl p-6 border border-[#E6EFF5] hover:border-[#2D60FF]/40 transition-all duration-200 active:scale-[0.98] cursor-pointer group flex flex-col justify-between shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] text-slate-900"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-[#2D60FF] transition-colors">
                        #{ticket.id}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{dateStr}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusStyle.pill}`}>
                        <span>{statusStyle.label}</span>
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete ticket #${ticket.id}? This action cannot be undone.`)) {
                            deleteTicket(ticket.id);
                          }
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all duration-200 active:scale-[0.98]"
                        title="Delete ticket"
                        aria-label="Delete ticket"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-4 mb-4">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-[#F5F7FA] border border-[#E6EFF5] shrink-0 relative flex items-center justify-center">
                      {(() => {
                        const imageUrl = ticket.image || ticket.photo || ticket.imageUrl;
                        const isS3Key = imageUrl && (imageUrl.startsWith('uploads/') || imageUrl.startsWith('s3://'));
                        if (imageUrl && !isS3Key) {
                          return (
                            <img
                              src={imageUrl}
                              alt="Fault"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                if (e.currentTarget.nextElementSibling) {
                                  e.currentTarget.nextElementSibling.style.display = 'flex';
                                }
                              }}
                            />
                          );
                        }
                        return null;
                      })()}
                      <div
                        className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-1"
                        style={{
                          display:
                            (!ticket.image && !ticket.photo && !ticket.imageUrl) ||
                            (ticket.photo && (ticket.photo.startsWith('uploads/') || ticket.photo.startsWith('s3://')))
                              ? 'flex'
                              : 'none'
                        }}
                      >
                        <CameraOff className="w-6 h-6 mb-1 text-slate-400" />
                        <span className="text-[10px] font-medium leading-none">No photo</span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#2D60FF] transition-colors line-clamp-1 mb-1 font-['Plus_Jakarta_Sans']">
                        {ticket.title}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium line-clamp-2 leading-relaxed">
                        {ticket.description}
                      </p>

                      {ticket.location && (
                        <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-2 truncate">
                          <MapPin className="w-3.5 h-3.5 text-[#2D60FF] shrink-0" />
                          <span className="truncate font-semibold text-slate-800">{ticket.location}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dual-approval interactive action bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-[#E6EFF5]">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">Sign-off:</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      ticket.userConfirmed ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                    }`}>
                      User {ticket.userConfirmed ? '✓' : '—'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      ticket.techConfirmed ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                    }`}>
                      Tech {ticket.techConfirmed ? '✓' : '—'}
                    </span>
                  </div>

                  <div>
                    {!ticket.userConfirmed ? (
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTicketClosure(ticket.id, 'user');
                        }}
                        className={`h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-200 active:scale-[0.98] shadow-sm ${
                          ticket.techConfirmed
                            ? 'bg-[#16DBCC] hover:bg-emerald-600 text-white shadow-emerald-500/25'
                            : 'bg-[#2D60FF] hover:bg-[#1814F3] text-white shadow-[#2D60FF]/25'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{ticket.techConfirmed ? 'Verify & Complete' : 'Mark Complete'}</span>
                      </button>
                    ) : !ticket.techConfirmed ? (
                      <div className="h-10 px-3.5 rounded-xl bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/30 text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-default">
                        <Clock className="w-3.5 h-3.5 text-[#FFBB38]" />
                        <span>Marked Done (Waiting for Tech)</span>
                      </div>
                    ) : (
                      <div className="h-10 px-3.5 rounded-xl bg-[#DCFAF8] text-[#16DBCC] border border-[#16DBCC]/30 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                        <CheckCircle2 className="w-4 h-4 text-[#16DBCC]" />
                        <span>Completed ✓</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-[#E6EFF5] flex items-center justify-between text-xs text-slate-500 font-medium">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-[#F5F7FA] text-slate-600 border border-[#E6EFF5] font-semibold text-xs">
                      {ticket.category}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${priorityBadgeClass}`}>
                      {ticket.priority === 'Critical' ? 'Emergency' : ticket.priority === 'High' ? 'Urgent' : ticket.priority}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete ticket #${ticket.id}? This action cannot be undone.`)) {
                          deleteTicket(ticket.id);
                        }
                      }}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 font-semibold transition-all duration-200 active:scale-[0.98]"
                      title="Delete ticket"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>

                    <span className="inline-flex items-center gap-1 text-slate-900 font-bold group-hover:text-[#2D60FF] group-hover:translate-x-0.5 transition-all">
                      <span>Details</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { default as TicketCard } from '../tickets/TicketCard';
