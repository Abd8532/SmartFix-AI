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
  CameraOff,
  ClipboardCheck,
  Trash2,
  Clock,
  ArrowUpDown,
  Layers,
  X,
  Filter
} from 'lucide-react';
import { STATUS_CONFIG } from '../../types/mockData';

// Priority ordering weights for sorting
const PRIORITY_WEIGHTS = {
  Emergency: 4,
  Critical: 4,
  Urgent: 3,
  High: 3,
  Routine: 2,
  Moderate: 2,
  Low: 1
};

// Lifecycle stage ordering for status sorting
const STATUS_WEIGHTS = {
  Assigned: 1,
  Open: 1,
  'In Progress': 2,
  'Pending User Verification': 2,
  'Awaiting Tech Sign-off': 2,
  Completed: 3,
  Resolved: 3,
  Done: 3
};

// Helper: Normalize and match ticket status against the selected tab
function matchesTabStatus(ticket, tabId) {
  if (tabId === 'All') return true;
  const s = String(ticket?.status || ticket?.Status || '').trim().toLowerCase();
  if (tabId === 'Assigned') {
    return s === 'assigned' || s === 'open' || !s;
  }
  if (tabId === 'In Progress') {
    return s === 'in progress' || s === 'pending user verification' || s === 'awaiting tech sign-off';
  }
  if (tabId === 'Resolved') {
    return s === 'completed' || s === 'resolved' || s === 'done';
  }
  return s === tabId.toLowerCase();
}

// Helper: Resilient multi-field search matcher across ID, keywords, room, location, and equipment
function matchesSearch(ticket, query) {
  if (!query || !query.trim()) return true;
  const q = query.trim().toLowerCase();
  const cleanQ = q.startsWith('#') ? q.slice(1).trim() : q;

  const idStr = String(ticket?.id || '').toLowerCase();
  const titleStr = String(ticket?.title || ticket?.Title || ticket?.complaint || ticket?.issue || '').toLowerCase();
  const descStr = String(ticket?.description || ticket?.Description || '').toLowerCase();
  const locStr = String(ticket?.location || ticket?.Location || ticket?.room || ticket?.building || '').toLowerCase();
  const catStr = String(ticket?.category || ticket?.Category || ticket?.specialty || '').toLowerCase();
  const prioStr = String(ticket?.priority || ticket?.urgency || ticket?.Urgency || '').toLowerCase();
  const statusStr = String(ticket?.status || ticket?.Status || '').toLowerCase();
  const assignedStr = String(ticket?.assignedTo || ticket?.assignedTechName || '').toLowerCase();

  return (
    idStr.includes(cleanQ) ||
    titleStr.includes(q) ||
    descStr.includes(q) ||
    locStr.includes(q) ||
    catStr.includes(q) ||
    prioStr.includes(q) ||
    statusStr.includes(q) ||
    assignedStr.includes(q)
  );
}

// Helper: Sort tickets array by selected sort criteria
function sortTickets(list, sortBy) {
  return [...list].sort((a, b) => {
    if (sortBy === 'newest') {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    }
    if (sortBy === 'oldest') {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    }
    if (sortBy === 'priority') {
      const pA = PRIORITY_WEIGHTS[a.priority] || PRIORITY_WEIGHTS[a.urgency] || 0;
      const pB = PRIORITY_WEIGHTS[b.priority] || PRIORITY_WEIGHTS[b.urgency] || 0;
      if (pB !== pA) return pB - pA;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    }
    if (sortBy === 'status') {
      const sA = STATUS_WEIGHTS[a.status] || 99;
      const sB = STATUS_WEIGHTS[b.status] || 99;
      if (sA !== sB) return sA - sB;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    }
    return 0;
  });
}

// Single Ticket Card Item Component
function TicketItem({ ticket, onSelectTicket, deleteTicket, handleTicketClosure }) {
  const statusStyle = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.Open || {
    label: ticket.status || 'Assigned',
    pill: 'bg-[#E7EDFF] text-[#2D60FF] border border-[#2D60FF]/20'
  };

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

  const imageUrl = ticket.image || ticket.photo || ticket.imageUrl;
  const isS3Key = imageUrl && (imageUrl.startsWith('uploads/') || imageUrl.startsWith('s3://'));

  return (
    <div
      onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
      className="bg-white rounded-3xl p-6 border border-[#E6EFF5] hover:border-[#2D60FF]/40 transition-all duration-200 active:scale-[0.98] cursor-pointer group flex flex-col justify-between shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] text-slate-900"
    >
      <div>
        {/* Top bar: ID, Date, Status pill, Delete */}
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

        {/* Thumbnail & Title/Description Body */}
        <div className="flex gap-4 mb-4">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-[#F5F7FA] border border-[#E6EFF5] shrink-0 relative flex items-center justify-center">
            {imageUrl && !isS3Key ? (
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
            ) : null}
            <div
              className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-1"
              style={{
                display: (!imageUrl || isS3Key) ? 'flex' : 'none'
              }}
            >
              <CameraOff className="w-6 h-6 mb-1 text-slate-400" />
              <span className="text-[10px] font-medium leading-none">No photo</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#2D60FF] transition-colors line-clamp-1 mb-1 font-['Plus_Jakarta_Sans']">
              {ticket.title || ticket.complaint || 'Maintenance Request'}
            </h4>
            <p className="text-xs text-slate-500 font-medium line-clamp-2 leading-relaxed">
              {ticket.description || ticket.complaint || 'No details provided'}
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
            {ticket.category || 'General'}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${priorityBadgeClass}`}>
            {ticket.priority === 'Critical' ? 'Emergency' : ticket.priority === 'High' ? 'Urgent' : ticket.priority || 'Routine'}
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
}

export default function MyTicketsList({ onSelectTicket }) {
  const { tickets, currentUser, setUserTab, handleTicketClosure, deleteTicket, stats } = useTickets();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'priority' | 'status'
  const [isGrouped, setIsGrouped] = useState(false); // toggle grouping by status sections

  // Dynamic user tickets list for current authenticated user
  const userTickets = useMemo(() => {
    return stats.userTickets || tickets.filter((t) => isUserTicket(t, currentUser));
  }, [stats.userTickets, tickets, currentUser]);

  // Live counts for status tab pills
  const tabCounts = useMemo(() => {
    return {
      All: userTickets.length,
      Assigned: userTickets.filter((t) => matchesTabStatus(t, 'Assigned')).length,
      'In Progress': userTickets.filter((t) => matchesTabStatus(t, 'In Progress')).length,
      Resolved: userTickets.filter((t) => matchesTabStatus(t, 'Resolved')).length
    };
  }, [userTickets]);

  // Filtered and sorted tickets based on active status tab, search query, and sort order
  const filteredAndSortedTickets = useMemo(() => {
    const matched = userTickets.filter((ticket) => {
      const matchesStatus = matchesTabStatus(ticket, statusFilter);
      const matchesText = matchesSearch(ticket, searchQuery);
      return matchesStatus && matchesText;
    });

    return sortTickets(matched, sortBy);
  }, [userTickets, statusFilter, searchQuery, sortBy]);

  // Grouped status sections when grouping is toggled on
  const groupedSections = useMemo(() => {
    if (!isGrouped && statusFilter !== 'All') return null;

    const assigned = filteredAndSortedTickets.filter((t) => matchesTabStatus(t, 'Assigned'));
    const inProgress = filteredAndSortedTickets.filter((t) => matchesTabStatus(t, 'In Progress'));
    const resolved = filteredAndSortedTickets.filter((t) => matchesTabStatus(t, 'Resolved'));

    const sections = [];
    if (assigned.length > 0) {
      sections.push({
        id: 'assigned',
        title: 'Assigned Work Orders',
        dotColor: 'bg-[#2D60FF]',
        badgeClass: 'bg-[#E7EDFF] text-[#2D60FF] border border-[#2D60FF]/30',
        tickets: assigned
      });
    }
    if (inProgress.length > 0) {
      sections.push({
        id: 'in-progress',
        title: 'In Progress & Verification',
        dotColor: 'bg-[#FFBB38]',
        badgeClass: 'bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/30',
        tickets: inProgress
      });
    }
    if (resolved.length > 0) {
      sections.push({
        id: 'resolved',
        title: 'Resolved & Completed',
        dotColor: 'bg-[#16DBCC]',
        badgeClass: 'bg-[#DCFAF8] text-[#16DBCC] border border-[#16DBCC]/30',
        tickets: resolved
      });
    }
    return sections;
  }, [filteredAndSortedTickets, isGrouped, statusFilter]);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setSortBy('newest');
    setIsGrouped(false);
  };

  const tabs = [
    { id: 'All', label: 'All', count: tabCounts.All },
    { id: 'Assigned', label: 'Assigned', count: tabCounts.Assigned },
    { id: 'In Progress', label: 'In Progress', count: tabCounts['In Progress'] },
    { id: 'Resolved', label: 'Resolved', count: tabCounts.Resolved }
  ];

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

      {/* Search Bar & Status Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        {/* Search Input with Clear Button */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets by ID, keyword, or room location..."
            className="w-full h-11 pl-11 pr-10 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2] text-xs sm:text-sm font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#2D60FF] focus:ring-2 focus:ring-[#2D60FF]/20 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)] transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-full transition-colors"
              title="Clear search"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Tab Pills with Live Count Badges */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`h-11 px-4 sm:px-5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all duration-200 active:scale-[0.98] flex items-center gap-2 ${
                statusFilter === tab.id
                  ? 'bg-[#2D60FF] text-white shadow-md shadow-[#2D60FF]/25 font-bold'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                statusFilter === tab.id ? 'bg-white/25 text-white' : 'bg-[#F5F7FA] text-slate-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Sorting & Grouping Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Results Counter / Filter status */}
        <div className="text-xs font-semibold text-slate-500 flex items-center gap-2">
          <span>
            Showing <strong className="text-slate-900">{filteredAndSortedTickets.length}</strong> of{' '}
            <strong className="text-slate-900">{userTickets.length}</strong> ticket{userTickets.length === 1 ? '' : 's'}
          </span>
          {(searchQuery || statusFilter !== 'All') && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[#2D60FF] hover:underline font-bold text-xs inline-flex items-center gap-1"
            >
              <span>Reset filters</span>
            </button>
          )}
        </div>

        {/* Sort and Group Options */}
        <div className="flex items-center gap-2.5">
          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 bg-white border border-[#E6EFF5] px-3 py-1.5 rounded-2xl shadow-xs text-xs font-semibold text-slate-700">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#2D60FF] shrink-0" />
            <span className="text-slate-400 font-medium hidden sm:inline">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-slate-800 font-bold outline-none cursor-pointer text-xs"
              aria-label="Sort tickets"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="priority">Highest Priority</option>
              <option value="status">Lifecycle Status</option>
            </select>
          </div>

          {/* Group by Status Toggle Button */}
          <button
            type="button"
            onClick={() => setIsGrouped(!isGrouped)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold border transition-all duration-200 active:scale-[0.98] ${
              isGrouped
                ? 'bg-[#E7EDFF] text-[#2D60FF] border-[#2D60FF]/30 font-bold shadow-xs'
                : 'bg-white text-slate-600 hover:text-slate-900 border-[#E6EFF5] hover:bg-[#F5F7FA]'
            }`}
            title="Group tickets by status section"
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Group by Status</span>
            <span className="sm:hidden">Group</span>
          </button>
        </div>
      </div>

      {/* Ticket Cards Grid or Grouped Sections */}
      {filteredAndSortedTickets.length === 0 ? (
        userTickets.length === 0 ? (
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
          <div className="bg-white rounded-3xl p-8 border border-[#E6EFF5] text-center shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-[#F5F7FA] text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Filter className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 font-['Plus_Jakarta_Sans']">No matching tickets</h3>
            <p className="text-xs text-slate-500 font-medium mt-1 max-w-sm mx-auto">
              No tickets found matching "{searchQuery}" under the "{statusFilter}" filter. Try adjusting your query or resetting filters.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 h-10 px-5 rounded-2xl bg-[#2D60FF] text-white text-xs font-bold shadow-md shadow-[#2D60FF]/25 transition-all duration-200 active:scale-[0.98]"
            >
              Reset All Filters
            </button>
          </div>
        )
      ) : isGrouped && groupedSections && groupedSections.length > 0 ? (
        /* Grouped View: Sections for Assigned, In Progress, Resolved */
        <div className="space-y-8">
          {groupedSections.map((section) => (
            <div key={section.id} className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#E6EFF5] pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${section.dotColor}`} />
                  <h3 className="text-sm font-bold text-slate-900 font-['Plus_Jakarta_Sans']">
                    {section.title}
                  </h3>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${section.badgeClass}`}>
                  {section.tickets.length} {section.tickets.length === 1 ? 'ticket' : 'tickets'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.tickets.map((ticket) => (
                  <TicketItem
                    key={ticket.id}
                    ticket={ticket}
                    onSelectTicket={onSelectTicket}
                    deleteTicket={deleteTicket}
                    handleTicketClosure={handleTicketClosure}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Standard Sorted Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAndSortedTickets.map((ticket) => (
            <TicketItem
              key={ticket.id}
              ticket={ticket}
              onSelectTicket={onSelectTicket}
              deleteTicket={deleteTicket}
              handleTicketClosure={handleTicketClosure}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { default as TicketCard } from '../tickets/TicketCard';
