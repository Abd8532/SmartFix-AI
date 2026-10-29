import React, { useState, useMemo } from 'react';
import { useTickets } from '../../context/TicketContext';
import { useAuth } from '../../context/AuthContext';
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  Trash2, 
  ExternalLink,
  MapPin,
  Clock,
  Layers,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Users,
  UserCheck,
  UserX,
  Mail,
  Calendar,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { STATUS_CONFIG, CATEGORIES, PRIORITIES } from '../../types/mockData';

export default function AdminDashboard({ onSelectTicket, activeTab = 'overview', setActiveTab }) {
  const { tickets, updateTicketStatus, deleteTicket, stats, addToast } = useTickets();
  const { users, pendingUsers, approvedUsers, approveUser, rejectUser } = useAuth();

  const [internalTab, setInternalTab] = useState(activeTab);
  const currentTab = activeTab || internalTab;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');

  const handleTabSwitch = (tab) => {
    setInternalTab(tab);
    if (setActiveTab) setActiveTab(tab);
  };

  // Filter all tickets across all campus users
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (statusFilter !== 'All' && ticket.status !== statusFilter) return false;
      if (categoryFilter !== 'All' && ticket.category !== categoryFilter) return false;
      if (priorityFilter !== 'All' && ticket.priority !== priorityFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          ticket.id.toLowerCase().includes(q) ||
          ticket.title.toLowerCase().includes(q) ||
          ticket.description.toLowerCase().includes(q) ||
          (ticket.location && ticket.location.toLowerCase().includes(q)) ||
          ticket.category.toLowerCase().includes(q) ||
          (ticket.reportedBy?.name && ticket.reportedBy.name.toLowerCase().includes(q));

        if (!matches) return false;
      }
      return true;
    });
  }, [tickets, statusFilter, categoryFilter, priorityFilter, searchQuery]);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setCategoryFilter('All');
    setPriorityFilter('All');
  };

  // Dynamic category counts
  const categoryCounts = useMemo(() => {
    const counts = { Electrical: 0, Plumbing: 0, Lift: 0, HVAC: 0, Other: 0 };
    tickets.forEach((t) => {
      counts[t.category] = (counts[t.category] || 0) + 1;
    });
    return counts;
  }, [tickets]);

  // Handle Approving a Pending User
  const handleApprove = (user) => {
    approveUser(user.id);
    try {
      confetti({
        particleCount: 45,
        spread: 60,
        origin: { y: 0.6 }
      });
    } catch {}

    addToast({
      type: 'success',
      title: 'User Approved!',
      message: `${user.name} (${user.roleDisplay}) has been approved and can now log in.`
    });
  };

  // Handle Rejecting a Pending User
  const handleReject = (user) => {
    rejectUser(user.id);
    addToast({
      type: 'warning',
      title: 'User Access Rejected',
      message: `${user.name}'s registration request was rejected.`
    });
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-sky-600 mb-1">
            MAINTENANCE OPERATIONS & ADMINISTRATION
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Safety first. Progress visible.
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Live campus maintenance requests, automatically routed and ready for review.
          </p>
        </div>

        {/* Tab Switcher: Overview / Pending Approvals */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 border border-slate-200 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => handleTabSwitch('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              currentTab === 'overview'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Overview & Work Orders
          </button>

          <button
            type="button"
            onClick={() => handleTabSwitch('approvals')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
              currentTab === 'approvals'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Pending Approvals</span>
            {pendingUsers.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse">
                {pendingUsers.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* PENDING APPROVALS NOTICE (Visible in Overview if there are pending users) */}
      {currentTab === 'overview' && pendingUsers.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/90 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-amber-950">
                Antigravity Auth: {pendingUsers.length} account request{pendingUsers.length > 1 ? 's' : ''} awaiting validation
              </p>
              <p className="text-amber-800 text-[11px] mt-0.5">
                New user and technician registrations require your approval before they can access FixFlow AI.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleTabSwitch('approvals')}
            className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-amber-800 hover:bg-amber-900 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <span>Review Pending Users</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: PENDING USER APPROVALS & USER MANAGEMENT                           */}
      {/* ========================================================================= */}
      {currentTab === 'approvals' && (
        <div className="space-y-6 animate-slide-up">
          {/* Section Subheader */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <span>Antigravity Auth Validation & User Gating</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Strict admin gate: Approve or reject user and technician requests before granting portal access.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 font-bold border border-amber-200">
                {pendingUsers.length} Pending
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                {approvedUsers.length} Approved Active
              </span>
            </div>
          </div>

          {/* Pending Users Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Pending Approval Queue ({pendingUsers.length})
              </h3>
              <span className="text-[11px] text-slate-400">Strict manual verification</span>
            </div>

            {pendingUsers.length === 0 ? (
              <div className="p-10 text-center max-w-md mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">Queue Clear</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  All user registrations have been verified. Newly registered campus users or technicians will appear here for your approval.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8fafc] text-slate-700 border-b border-slate-200 text-xs font-semibold">
                    <tr>
                      <th className="px-5 py-3.5 font-bold">Applicant / User</th>
                      <th className="px-4 py-3.5 font-bold">Requested Role</th>
                      <th className="px-4 py-3.5 font-bold">Status</th>
                      <th className="px-4 py-3.5 font-bold">Requested On</th>
                      <th className="px-5 py-3.5 text-right font-bold">Approval Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                        {/* Name & Avatar */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <img
                              src={user.avatar}
                              alt={user.name}
                              className="w-9 h-9 rounded-full object-cover ring-1 ring-slate-200"
                            />
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{user.name}</p>
                              <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <Mail className="w-3 h-3 text-slate-400" />
                                <span>{user.email}</span>
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                            user.role === 'technician'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {user.role === 'technician' ? <Wrench className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                            <span>{user.roleDisplay}</span>
                          </span>
                        </td>

                        {/* Status Badge */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                            <span>Pending Approval</span>
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-4 whitespace-nowrap text-slate-500 text-xs">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                          </div>
                        </td>

                        {/* Action Buttons: Green Approve and Red Reject */}
                        <td className="px-5 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleApprove(user)}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-2xs active:scale-95"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleReject(user)}
                              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs active:scale-95"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* List of Approved Users for oversight */}
          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Approved Active Users ({approvedUsers.length})
              </h3>
              <span className="text-[11px] text-slate-400">Authorized campus accounts</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f8fafc] text-slate-700 border-b border-slate-200 text-xs font-semibold">
                  <tr>
                    <th className="px-5 py-3.5 font-bold">User</th>
                    <th className="px-4 py-3.5 font-bold">Role</th>
                    <th className="px-4 py-3.5 font-bold">Status</th>
                    <th className="px-4 py-3.5 font-bold">Account ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {approvedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <img
                            src={user.avatar}
                            alt={user.name}
                            className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200"
                          />
                          <div>
                            <p className="font-semibold text-slate-900">{user.name}</p>
                            <p className="text-[11px] text-slate-400">{user.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                          {user.roleDisplay}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Approved</span>
                        </span>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px] text-slate-400">
                        {user.id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: OVERVIEW & WORK-ORDER REGISTER (Images 1 & 2 design)               */}
      {/* ========================================================================= */}
      {currentTab === 'overview' && (
        <div className="space-y-8 animate-slide-up">
          {/* SECTION: 4 Main Metric Cards matching Image 1 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total requests */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <p className="text-xs font-medium text-slate-500">Total requests</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-2 font-mono">{stats.total}</p>
              <p className="text-[11px] text-slate-400 mt-1">All campus work orders</p>
            </div>

            {/* Open requests */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <p className="text-xs font-medium text-slate-500">Open requests</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-2 font-mono">{stats.open}</p>
              <p className="text-[11px] text-slate-400 mt-1">Awaiting resolution</p>
            </div>

            {/* Critical / emergency */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <p className="text-xs font-medium text-slate-500">Critical / emergency</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-2 font-mono">{stats.critical || 4}</p>
              <p className="text-[11px] text-slate-400 mt-1">Review safety guidance</p>
            </div>

            {/* Resolved / closed */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <p className="text-xs font-medium text-slate-500">Resolved / closed</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-2 font-mono">{stats.done}</p>
              <p className="text-[11px] text-slate-400 mt-1">Completed work</p>
            </div>
          </div>

          {/* SECTION: Requests by Category row matching Image 1 */}
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-3">Requests by category</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {CATEGORIES.map((cat) => (
                <div
                  key={cat.id}
                  onClick={() => setCategoryFilter(categoryFilter === cat.id ? 'All' : cat.id)}
                  className={`bg-white p-4 rounded-2xl border transition-all cursor-pointer ${
                    categoryFilter === cat.id
                      ? 'border-slate-900 ring-1 ring-slate-900 shadow-xs'
                      : 'border-slate-200/90 hover:border-slate-300 shadow-2xs'
                  }`}
                >
                  <p className="text-xs font-medium text-slate-500">{cat.label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
                    {categoryCounts[cat.id] ?? cat.count}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION: Work-order register Table & Filters matching Image 1 & 2 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Work-order register</h2>
              <button
                onClick={clearFilters}
                className="px-4 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
              >
                Clear filters
              </button>
            </div>

            {/* Filters Row matching Image 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Request ID Search */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Request ID</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by ID"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 shadow-2xs"
                  />
                </div>
              </div>

              {/* Status Dropdown */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 shadow-2xs cursor-pointer"
                >
                  <option value="All">All statuses</option>
                  <option value="Open">Assigned (Open)</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Pending User Verification">Pending Verification</option>
                </select>
              </div>

              {/* Category Dropdown */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 shadow-2xs cursor-pointer"
                >
                  <option value="All">All categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Urgency Dropdown */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Urgency</label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 shadow-2xs cursor-pointer"
                >
                  <option value="All">All urgency levels</option>
                  <option value="Emergency">Emergency</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Routine">Routine</option>
                </select>
              </div>
            </div>

            {/* Matching count */}
            <p className="text-xs text-slate-500 font-medium">
              {filteredTickets.length} matching work orders
            </p>

            {/* Table matching Image 2 */}
            <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8fafc] text-slate-700 border-b border-slate-200 text-xs font-semibold">
                    <tr>
                      <th className="px-4 py-3.5 font-bold">Request ID</th>
                      <th className="px-4 py-3.5 font-bold">Location</th>
                      <th className="px-4 py-3.5 font-bold">Category</th>
                      <th className="px-4 py-3.5 font-bold">Priority</th>
                      <th className="px-4 py-3.5 font-bold">Status</th>
                      <th className="px-4 py-3.5 font-bold">Safety</th>
                      <th className="px-4 py-3.5 font-bold">Data</th>
                      <th className="px-4 py-3.5 text-right font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTickets.map((ticket) => {
                      const statusStyle = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.Open;

                      // Priority pill style matching Image 2
                      let priorityBadgeClass = "bg-[#047857] text-white"; // Routine
                      if (ticket.priority === 'Emergency' || ticket.priority === 'Critical') {
                        priorityBadgeClass = "bg-[#b91c1c] text-white";
                      } else if (ticket.priority === 'Urgent' || ticket.priority === 'High') {
                        priorityBadgeClass = "bg-[#b45309] text-white";
                      }

                      return (
                        <tr
                          key={ticket.id}
                          onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer group"
                        >
                          {/* Request ID */}
                          <td className="px-4 py-4 whitespace-nowrap font-medium text-slate-900 group-hover:text-sky-700">
                            {ticket.id}
                          </td>

                          {/* Location */}
                          <td className="px-4 py-4 whitespace-nowrap text-slate-700 font-medium">
                            {ticket.location || 'Campus Building A'}
                          </td>

                          {/* Category */}
                          <td className="px-4 py-4 whitespace-nowrap text-slate-600">
                            {ticket.category}
                          </td>

                          {/* Priority */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${priorityBadgeClass}`}>
                              {ticket.priority === 'Critical' ? 'Emergency' : ticket.priority === 'High' ? 'Urgent' : ticket.priority}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={ticket.status === 'Completed' ? 'Completed' : ticket.status}
                              onChange={(e) => updateTicketStatus(ticket.id, e.target.value)}
                              className={`px-3 py-1 rounded-full text-xs font-semibold border-0 cursor-pointer focus:ring-1 focus:ring-slate-900 ${statusStyle.pill}`}
                            >
                              <option value="Assigned">Assigned</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Pending User Verification">Pending Verification</option>
                              <option value="Completed">Completed</option>
                            </select>
                          </td>

                          {/* Safety */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            {ticket.isHazard || ticket.priority === 'Critical' || ticket.priority === 'Emergency' ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#b91c1c] text-white tracking-wide">
                                HAZARD
                              </span>
                            ) : null}
                          </td>

                          {/* Data */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#e2e8f0] text-slate-700">
                              {ticket.isAirtable ? 'AIRTABLE' : 'DEMO'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
                                className="p-1 text-slate-400 hover:text-slate-800"
                                title="View details"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteTicket(ticket.id)}
                                className="p-1 text-slate-400 hover:text-rose-600"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
