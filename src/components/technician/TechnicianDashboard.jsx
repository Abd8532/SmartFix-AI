import React, { useState, useMemo } from 'react';
import { useTickets } from '../../context/TicketContext';
import { 
  CheckCircle2, 
  Wrench, 
  Clock, 
  Filter, 
  Search, 
  MapPin, 
  User, 
  Loader2, 
  CheckCheck,
  Play
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { STATUS_CONFIG } from '../../types/mockData';

export default function TechnicianDashboard({ onSelectTicket }) {
  const { tickets, updateTicketStatus, handleTicketClosure, stats } = useTickets();

  const [activeSegment, setActiveSegment] = useState('active'); // 'active' | 'resolved' | 'all'
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingTicketId, setProcessingTicketId] = useState(null);

  // Filter tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const isResolved = ticket.status === 'Done' || ticket.status === 'Completed';
      if (activeSegment === 'active' && isResolved) return false;
      if (activeSegment === 'resolved' && !isResolved) return false;

      if (priorityFilter !== 'All' && ticket.priority !== priorityFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          ticket.id.toLowerCase().includes(q) ||
          ticket.title.toLowerCase().includes(q) ||
          ticket.description.toLowerCase().includes(q) ||
          (ticket.location && ticket.location.toLowerCase().includes(q)) ||
          ticket.category.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [tickets, activeSegment, priorityFilter, searchQuery]);

  const handleMarkAsDone = (ticketId, e) => {
    e.stopPropagation();
    setProcessingTicketId(ticketId);

    setTimeout(() => {
      updateTicketStatus(ticketId, 'Done', 'Inspected and resolved on-site by field technician.');
      setProcessingTicketId(null);

      try {
        confetti({
          particleCount: 40,
          spread: 50,
          origin: { y: 0.8 }
        });
      } catch (err) {}
    }, 400);
  };

  const handleStartProgress = (ticketId, e) => {
    e.stopPropagation();
    updateTicketStatus(ticketId, 'In Progress', 'Field technician arrived at location and commenced diagnosis.');
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-sky-600 mb-1">
            FIELD TECHNICIAN DESK
          </p>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Work Order Queue
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Review reported fault photos, diagnose on-site equipment, and mark completed jobs as Done.
          </p>
        </div>

        {/* Quick KPI stats */}
        <div className="flex items-center gap-2">
          <div className="px-3.5 py-2 rounded-2xl bg-white border border-slate-200/90 text-center shadow-2xs">
            <p className="text-[10px] text-slate-500 font-semibold uppercase">Pending</p>
            <p className="text-xl font-bold text-amber-700 font-mono">{stats.open}</p>
          </div>
          <div className="px-3.5 py-2 rounded-2xl bg-white border border-slate-200/90 text-center shadow-2xs">
            <p className="text-[10px] text-slate-500 font-semibold uppercase">In Progress</p>
            <p className="text-xl font-bold text-sky-700 font-mono">{stats.inProgress}</p>
          </div>
          <div className="px-3.5 py-2 rounded-2xl bg-white border border-slate-200/90 text-center shadow-2xs">
            <p className="text-[10px] text-slate-500 font-semibold uppercase">Resolved</p>
            <p className="text-xl font-bold text-emerald-700 font-mono">{stats.done}</p>
          </div>
        </div>
      </div>

      {/* Segment Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
          <button
            onClick={() => setActiveSegment('active')}
            className={`py-2 px-4 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              activeSegment === 'active'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Active Issues</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeSegment === 'active' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {stats.open + stats.inProgress}
            </span>
          </button>

          <button
            onClick={() => setActiveSegment('resolved')}
            className={`py-2 px-4 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              activeSegment === 'resolved'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Resolved Section</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeSegment === 'resolved' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {stats.done}
            </span>
          </button>

          <button
            onClick={() => setActiveSegment('all')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeSegment === 'all'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>All ({stats.total})</span>
          </button>
        </div>

        {/* Priority Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-slate-500 text-xs hidden sm:inline flex items-center gap-1">
            <Filter className="w-3 h-3" /> Priority:
          </span>
          {['All', 'Emergency', 'Urgent', 'Routine'].map((pr) => (
            <button
              key={pr}
              onClick={() => setPriorityFilter(pr)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                priorityFilter === pr
                  ? 'bg-slate-900 text-white shadow-2xs font-semibold'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              {pr}
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter queue by equipment, room, or issue description..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 shadow-2xs"
        />
      </div>

      {/* Ticket Cards Grid */}
      {filteredTickets.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center max-w-md mx-auto my-8 shadow-2xs">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-4">
            <CheckCheck className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">Queue Clear</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {activeSegment === 'active'
              ? 'No active maintenance issues currently in this queue. Great job!'
              : 'No tickets found matching the selected filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredTickets.map((ticket) => {
            const statusStyle = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.Open;
            const isProcessing = processingTicketId === ticket.id;
            const isDone = ticket.status === 'Done';

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
                className="bg-white hover:border-slate-400 rounded-2xl p-5 border border-slate-200/90 transition-all cursor-pointer group flex flex-col justify-between shadow-2xs relative"
              >
                <div>
                  {/* Card Header: Ticket ID & Status */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-sky-700">
                        #{ticket.id}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                        {ticket.category}
                      </span>
                      <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${priorityBadgeClass}`}>
                        {ticket.priority === 'Critical' ? 'Emergency' : ticket.priority === 'High' ? 'Urgent' : ticket.priority}
                      </span>
                      {ticket.isHazard && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-600 text-white">
                          HAZARD
                        </span>
                      )}
                    </div>

                    {/* Status Badge */}
                    <span className={`inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold ${statusStyle.pill}`}>
                      <span>{statusStyle.label}</span>
                    </span>
                  </div>

                  {/* Photo & Description Area */}
                  <div className="flex flex-col sm:flex-row gap-4 mb-4">
                    <div className="w-full sm:w-36 h-40 sm:h-36 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 relative">
                      {ticket.photo ? (
                        <img
                          src={ticket.photo}
                          alt="Reported equipment issue"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                          <Wrench className="w-8 h-8 mb-1" />
                          <span className="text-[10px]">No photo</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-base font-bold text-slate-900 group-hover:text-sky-700 transition-colors line-clamp-1 mb-1.5">
                        {ticket.title}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 mb-3">
                        {ticket.description}
                      </p>

                      <div className="space-y-1 text-[11px] text-slate-500">
                        {ticket.location && (
                          <div className="flex items-center gap-1.5 truncate">
                            <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                            <span className="truncate font-medium text-slate-700">{ticket.location}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Reported by: {ticket.reportedBy?.name || 'Campus Operator'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resolution notes if resolved */}
                  {ticket.resolutionNotes && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 mb-4 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-emerald-900">Resolution: </span>
                        <span>{ticket.resolutionNotes}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Actions: Primary action button */}
                <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1 self-start sm:self-auto">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  </span>

                  <div className="w-full sm:w-auto flex items-center gap-2">
                    {ticket.status === 'Completed' || ticket.status === 'Done' ? (
                      <div className="inline-flex items-center gap-1 text-xs text-emerald-800 font-semibold px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 w-full sm:w-auto justify-center">
                        <CheckCheck className="w-4 h-4 text-emerald-600" />
                        <span>Completed</span>
                      </div>
                    ) : (
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTicketClosure(ticket.id, 'technician');
                        }}
                        disabled={ticket.techConfirmed}
                        className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-xl transition-colors text-xs"
                      >
                        {ticket.techConfirmed ? "Sent for User Verification" : "Mark as Fixed"}
                      </button>
                    )}
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
