import React, { useState, useMemo } from 'react';
import { useTickets } from '../../context/TicketContext';
import { useAuth } from '../../context/AuthContext';
import EmptyState from '../common/EmptyState';
import TicketSkeleton from '../common/TicketSkeleton';
import { 
  CheckCircle2, 
  Wrench, 
  Clock, 
  Filter, 
  Search, 
  MapPin, 
  User, 
  CheckCheck,
  ClipboardCheck,
  CameraOff
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { STATUS_CONFIG } from '../../types/mockData';

export default function TechnicianDashboard({ onSelectTicket }) {
  const { tickets, updateTicketStatus, handleTicketClosure, stats } = useTickets();
  const { currentUser } = useAuth();

  const [activeSegment, setActiveSegment] = useState('active'); // 'active' | 'resolved' | 'all'
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingTicketId, setProcessingTicketId] = useState(null);

  // Strict Department Queue Filtering & Priority Scoring
  const myDepartmentTickets = useMemo(() => {
    const deptFiltered = tickets.filter((ticket) => {
      if (!currentUser?.specialty) return true;
      const spec = currentUser.specialty.toLowerCase();
      const cat = (ticket.category || '').toLowerCase();
      const assigned = (ticket.assignedTo || '').toLowerCase();
      return cat === spec || assigned.includes(spec);
    });

    return [...deptFiltered].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
  }, [tickets, currentUser]);

  // Department-specific KPI stats calculated strictly over myDepartmentTickets
  const deptStats = useMemo(() => {
    let open = 0;
    let inProgress = 0;
    let done = 0;

    myDepartmentTickets.forEach((t) => {
      const isResolved = t.status === 'Completed' || t.status === 'Done';
      if (isResolved) {
        done++;
      } else if (
        t.status === 'In Progress' || 
        t.status === 'Awaiting Tech Sign-off' || 
        t.status === 'Pending User Verification'
      ) {
        inProgress++;
      } else {
        open++;
      }
    });

    return {
      open,
      inProgress,
      done,
      total: myDepartmentTickets.length
    };
  }, [myDepartmentTickets]);

  // Filter tickets for active view & search within the department queue
  const filteredTickets = useMemo(() => {
    return myDepartmentTickets.filter((ticket) => {
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
  }, [myDepartmentTickets, activeSegment, priorityFilter, searchQuery]);

  return (
    <div className="space-y-6 sm:space-y-8 pb-16 text-slate-900">
      {/* Top Banner - Center Aligned Hero Section with Strict 8pt Grid & Typography Hierarchy */}
      <div className="text-center max-w-2xl mx-auto mb-8">
        {/* Department Queue Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#E7EDFF] border border-[#2D60FF]/20 text-[#2D60FF] text-xs font-bold mb-3 shadow-2xs">
          <Wrench className="w-3.5 h-3.5 text-[#2D60FF]" />
          <span>Department Queue: {currentUser?.specialty || 'General'} Specialist</span>
        </div>

        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          FIELD TECHNICIAN DESK
        </p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-['Plus_Jakarta_Sans']">
          Work Order Queue
        </h2>
        <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
          Review reported fault photos, diagnose on-site equipment, and mark completed jobs as Done.
        </p>

        {/* Quick KPI stats centered with Layered Depth & Tactile Micro-Interactions */}
        <div className="flex items-center justify-center gap-4 mt-6">
          <div className="px-6 py-4 rounded-3xl bg-white border border-[#E6EFF5] text-center shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] min-w-32 transition-transform duration-200 hover:-translate-y-0.5">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Pending</p>
            <p className="text-2xl font-extrabold text-[#FFBB38] font-['Plus_Jakarta_Sans'] mt-1">{deptStats.open}</p>
          </div>
          <div className="px-6 py-4 rounded-3xl bg-white border border-[#E6EFF5] text-center shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] min-w-32 transition-transform duration-200 hover:-translate-y-0.5">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">In Progress</p>
            <p className="text-2xl font-extrabold text-[#2D60FF] font-['Plus_Jakarta_Sans'] mt-1">{deptStats.inProgress}</p>
          </div>
          <div className="px-6 py-4 rounded-3xl bg-white border border-[#E6EFF5] text-center shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] min-w-32 transition-transform duration-200 hover:-translate-y-0.5">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Resolved</p>
            <p className="text-2xl font-extrabold text-[#16DBCC] font-['Plus_Jakarta_Sans'] mt-1">{deptStats.done}</p>
          </div>
        </div>
      </div>

      {/* Segment Switcher & Filter Controls with Touch-Friendly Targets (h-11) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div className="flex rounded-2xl bg-white p-1.5 border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)]">
          <button
            onClick={() => setActiveSegment('active')}
            className={`h-11 px-4 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all duration-200 active:scale-[0.98] ${
              activeSegment === 'active'
                ? 'bg-[#2D60FF] text-white shadow-md shadow-[#2D60FF]/25 font-bold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Active Issues</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeSegment === 'active' ? 'bg-white/20 text-white' : 'bg-[#F5F7FA] text-slate-600'
            }`}>
              {deptStats.open + deptStats.inProgress}
            </span>
          </button>

          <button
            onClick={() => setActiveSegment('resolved')}
            className={`h-11 px-4 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all duration-200 active:scale-[0.98] ${
              activeSegment === 'resolved'
                ? 'bg-[#2D60FF] text-white shadow-md shadow-[#2D60FF]/25 font-bold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Resolved Section</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeSegment === 'resolved' ? 'bg-white/20 text-white' : 'bg-[#F5F7FA] text-slate-600'
            }`}>
              {deptStats.done}
            </span>
          </button>

          <button
            onClick={() => setActiveSegment('all')}
            className={`h-11 px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 active:scale-[0.98] ${
              activeSegment === 'all'
                ? 'bg-[#2D60FF] text-white shadow-md shadow-[#2D60FF]/25 font-bold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <span>All ({deptStats.total})</span>
          </button>
        </div>

        {/* Priority Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-slate-400 text-xs hidden sm:inline flex items-center gap-1 font-semibold">
            <Filter className="w-3.5 h-3.5 text-slate-400" /> Priority:
          </span>
          {['All', 'Emergency', 'Urgent', 'Routine'].map((pr) => (
            <button
              key={pr}
              onClick={() => setPriorityFilter(pr)}
              className={`h-11 px-4 rounded-2xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
                priorityFilter === pr
                  ? 'bg-[#2D60FF] text-white shadow-[0_2px_8px_-2px_rgba(45,96,255,0.4)]'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]'
              }`}
            >
              {pr}
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar - Touch Target h-12 with Layered Shadow */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter queue by equipment, room, or issue description..."
          className="w-full h-12 pl-11 pr-4 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2] text-xs sm:text-sm font-medium text-slate-900 placeholder-slate-400 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)] focus:bg-white focus:outline-none focus:border-[#2D60FF] focus:ring-2 focus:ring-[#2D60FF]/20 transition-all"
        />
      </div>

      {/* Empty State vs Ticket Cards Grid */}
      {filteredTickets.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Queue is clear"
          subtitle="Great job, all maintenance requests are resolved."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredTickets.map((ticket) => {
            const statusStyle = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.Open;
            const isProcessing = processingTicketId === ticket.id;
            const isDone = ticket.status === 'Done';

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
                className="bg-white rounded-3xl p-6 border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] hover:border-[#2D60FF]/40 hover:shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08),_0_8px_24px_-4px_rgba(0,0,0,0.08)] transition-all duration-200 active:scale-[0.98] cursor-pointer group flex flex-col justify-between relative text-slate-900"
              >
                <div>
                  {/* Card Header: Ticket ID & Status */}
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-[#2D60FF] transition-colors">
                        #{ticket.id}
                      </span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#F5F7FA] text-slate-600 border border-[#E6EFF5] font-semibold">
                        {ticket.category}
                      </span>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${priorityBadgeClass}`}>
                        {ticket.priority === 'Critical' ? 'Emergency' : ticket.priority === 'High' ? 'Urgent' : ticket.priority}
                      </span>
                      {ticket.isHazard && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#FFE0EB] text-[#FF4B4A] border border-[#FF4B4A]/30">
                          HAZARD
                        </span>
                      )}
                    </div>

                    {/* Status Badge */}
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusStyle.pill}`}>
                      <span>{statusStyle.label}</span>
                    </span>
                  </div>

                  {/* Photo & Description Area with Strict 8pt Spacing */}
                  <div className="flex flex-col sm:flex-row gap-4 mb-4">
                    <div className="w-full sm:w-36 h-40 sm:h-36 rounded-2xl overflow-hidden bg-[#F5F7FA] border border-[#E6EFF5] shrink-0 relative flex items-center justify-center">
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
                        className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-2"
                        style={{
                          display:
                            (!ticket.image && !ticket.photo && !ticket.imageUrl) ||
                            (ticket.photo && (ticket.photo.startsWith('uploads/') || ticket.photo.startsWith('s3://')))
                              ? 'flex'
                              : 'none'
                        }}
                      >
                        <CameraOff className="w-7 h-7 mb-1 text-slate-400" />
                        <span className="text-[10px] font-medium">No photo</span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-base font-bold text-slate-900 group-hover:text-[#2D60FF] transition-colors line-clamp-1 mb-1 font-['Plus_Jakarta_Sans'] tracking-tight">
                        {ticket.title}
                      </h4>
                      <p className="text-sm text-slate-600 leading-relaxed line-clamp-2 mb-3 font-normal">
                        {ticket.description}
                      </p>

                      <div className="space-y-1 text-xs text-slate-500 font-medium">
                        {ticket.location && (
                          <div className="flex items-center gap-1.5 truncate">
                            <MapPin className="w-3.5 h-3.5 text-[#2D60FF] shrink-0" />
                            <span className="truncate font-semibold text-slate-800">{ticket.location}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Reported by: <strong className="text-slate-800 font-semibold">{ticket.reportedBy?.name || 'Campus Operator'}</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resolution notes if resolved */}
                  {ticket.resolutionNotes && (
                    <div className="p-4 rounded-2xl bg-[#DCFAF8] border border-[#16DBCC]/30 text-xs text-[#16DBCC] mb-4 flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-[#16DBCC] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-slate-900">Resolution: </span>
                        <span className="text-slate-800">{ticket.resolutionNotes}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Actions: Primary action button with tactile tap and touch target h-11 */}
                <div className="pt-4 border-t border-[#E6EFF5] flex flex-col sm:flex-row items-center justify-between gap-3">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5 self-start sm:self-auto font-medium">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  </span>

                  <div className="w-full sm:w-auto flex items-center gap-2">
                    {ticket.status === 'Completed' || ticket.status === 'Done' ? (
                      <div className="inline-flex items-center gap-1.5 text-xs text-[#16DBCC] font-bold h-11 px-5 rounded-2xl bg-[#DCFAF8] border border-[#16DBCC]/30 w-full sm:w-auto justify-center shadow-xs">
                        <CheckCheck className="w-4 h-4 text-[#16DBCC]" />
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
                        className={`w-full sm:w-auto font-bold h-11 px-6 rounded-2xl transition-all duration-200 active:scale-[0.98] text-xs shadow-md ${
                          ticket.techConfirmed
                            ? "bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/30 cursor-default"
                            : "bg-[#2D60FF] hover:bg-[#1814F3] text-white shadow-[#2D60FF]/25"
                        }`}
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
