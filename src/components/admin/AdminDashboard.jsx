import React, { useState, useMemo, useEffect } from 'react';
import { useTickets } from '../../context/TicketContext';
import { useAuth } from '../../context/AuthContext';
import TicketSkeleton from '../common/TicketSkeleton';
import EmptyState from '../common/EmptyState';
import { 
  Select, 
  SelectTrigger, 
  SelectValue, 
  SelectContent, 
  SelectItem 
} from '../ui/select';
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
  ArrowRight,
  ListFilter,
  Settings as SettingsIcon,
  Flame,
  ShieldAlert,
  Database,
  Key,
  RefreshCw,
  Download,
  Check,
  Eye,
  EyeOff,
  Sliders,
  AlertOctagon,
  Zap,
  SlidersHorizontal,
  FileText,
  ClipboardCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { STATUS_CONFIG, CATEGORIES, PRIORITIES } from '../../types/mockData';

export default function AdminDashboard({ onSelectTicket, activeTab = 'overview', setActiveTab }) {
  const { 
    tickets, 
    updateTicketStatus, 
    deleteTicket, 
    stats, 
    addToast,
    fetchTickets,
    resetMockData,
    fetchAuditLogs,
    isLoading
  } = useTickets();
  const { users = [], pendingUsers = [], approvedUsers = [], approveUser, rejectUser } = useAuth();

  const [internalTab, setInternalTab] = useState(activeTab);
  const currentTab = activeTab || internalTab;

  useEffect(() => {
    setInternalTab(activeTab);
  }, [activeTab]);

  // Request Queue / Overview filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');

  // Hazard Queue specific filter
  const [hazardFilter, setHazardFilter] = useState('All'); // 'All' | 'Critical' | 'Urgent'

  // Audit Trail State
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const loadAuditLogs = async () => {
    if (typeof fetchAuditLogs === 'function') {
      setLoadingAudit(true);
      try {
        const logs = await fetchAuditLogs();
        setAuditLogs(logs);
      } finally {
        setLoadingAudit(false);
      }
    }
  };

  useEffect(() => {
    if (currentTab === 'audit') {
      loadAuditLogs();
    }
  }, [currentTab]);

  // Operational Policies State
  const [policies, setPolicies] = useState({
    strictGating: true,
    dualApproval: true,
    autoRouting: true
  });

  const handleTabSwitch = (tab) => {
    setInternalTab(tab);
    if (typeof setActiveTab === 'function') {
      setActiveTab(tab);
    }
  };

  // Filter all tickets across all campus users for Overview and Request Queue
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (statusFilter !== 'All' && ticket.status !== statusFilter) return false;
      if (categoryFilter !== 'All' && ticket.category !== categoryFilter) return false;
      if (priorityFilter !== 'All' && ticket.priority !== priorityFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const cleanQ = q.startsWith('#') ? q.slice(1).trim() : q;
        const idStr = String(ticket?.id || '').toLowerCase();
        const titleStr = String(ticket?.title || ticket?.Title || ticket?.complaint || ticket?.issue || '').toLowerCase();
        const descStr = String(ticket?.description || ticket?.Description || '').toLowerCase();
        const locStr = String(ticket?.location || ticket?.Location || ticket?.room || '').toLowerCase();
        const catStr = String(ticket?.category || ticket?.Category || '').toLowerCase();
        const repStr = String(ticket?.reportedBy?.name || ticket?.reporterName || '').toLowerCase();

        const matches =
          idStr.includes(cleanQ) ||
          titleStr.includes(q) ||
          descStr.includes(q) ||
          locStr.includes(q) ||
          catStr.includes(q) ||
          repStr.includes(q);

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

  // All Hazard tickets (Active/Unresolved)
  const hazardTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (t.status === 'Completed' || t.status === 'Done') return false;
      return (
        t.isHazard === true ||
        t.priority === 'Critical' ||
        t.priority === 'Emergency' ||
        t.Urgency === 'Emergency' ||
        t.urgency === 'Emergency' ||
        (t.priority === 'Urgent' && (t.category === 'Electrical' || t.category === 'Plumbing'))
      );
    });
  }, [tickets]);

  // Filtered Hazard tickets
  const filteredHazards = useMemo(() => {
    return hazardTickets.filter((t) => {
      if (hazardFilter === 'Critical') {
        return t.isHazard || t.priority === 'Critical' || t.priority === 'Emergency' || t.Urgency === 'Emergency' || t.urgency === 'Emergency';
      }
      if (hazardFilter === 'Urgent') {
        return t.priority === 'Urgent' || t.Urgency === 'Urgent' || t.urgency === 'Urgent';
      }
      return true;
    });
  }, [hazardTickets, hazardFilter]);

  // Handle Approving a Pending User
  const handleApprove = async (user) => {
    await approveUser(user.id);
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
  const handleReject = async (user) => {
    await rejectUser(user.id);
    addToast({
      type: 'warning',
      title: 'User Access Rejected',
      message: `${user.name}'s registration request was rejected.`
    });
  };

  // Export Tickets as JSON file
  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tickets, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `smartfixflow-workorders-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    addToast({
      type: 'success',
      title: 'Export Complete',
      message: `Exported ${tickets.length} work orders to JSON file.`
    });
  };

  // Export Audit Trail as JSON file
  const handleExportAuditJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `smartfixflow-audit-trail-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    addToast({
      type: 'success',
      title: 'Audit Export Complete',
      message: `Exported ${auditLogs.length} audit records to JSON file.`
    });
  };

  // Clear all maintenance work orders
  const handleResetData = () => {
    if (window.confirm('Are you sure you want to clear all maintenance work orders from the database?')) {
      if (resetMockData) resetMockData();
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-16 text-slate-900">
      {/* Top Banner & Header - Center Aligned Hero Section */}
      <div className="text-center max-w-3xl mx-auto mb-8">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          MAINTENANCE OPERATIONS & ADMINISTRATION
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-['Plus_Jakarta_Sans']">
          Safety first. Progress visible.
        </h1>
        <p className="text-sm text-slate-500 font-medium mt-2 max-w-xl mx-auto leading-relaxed">
          Live campus maintenance requests, automatically routed and ready for review.
        </p>
      </div>

      {/* PENDING APPROVALS NOTICE (Visible in Overview if there are pending users) */}
      {currentTab === 'overview' && (pendingUsers?.length || 0) > 0 && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#FFF5D9] border border-[#FFBB38]/30 text-slate-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] animate-slide-up">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white text-[#FFBB38] border border-[#FFBB38]/30 flex items-center justify-center shrink-0 shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">
                Account Approvals: {pendingUsers.length} account request{pendingUsers.length > 1 ? 's' : ''} awaiting validation
              </p>
              <p className="text-slate-600 text-xs font-medium mt-0.5">
                New user and technician registrations require your approval before they can access SmartFixFlow - AI.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleTabSwitch('approvals')}
            className="self-start sm:self-auto h-11 px-5 rounded-2xl bg-[#2D60FF] hover:bg-[#1814F3] text-white font-bold text-xs transition-all duration-200 active:scale-[0.98] flex items-center gap-2 shadow-md shadow-[#2D60FF]/25"
          >
            <span>Review Pending Users</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: PENDING USER APPROVALS & USER MANAGEMENT                           */}
      {/* ========================================================================= */}
      {currentTab === 'approvals' && (
        <div className="space-y-6 sm:space-y-8 animate-slide-up">
          {/* Section Subheader */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5 font-['Plus_Jakarta_Sans']">
                <ShieldCheck className="w-6 h-6 text-[#2D60FF]" />
                <span>Admin Auth Validation & User Gating</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                Strict admin gate: Approve or reject user and technician requests before granting portal access.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="px-4 py-2 rounded-2xl bg-[#FFF5D9] text-[#FFBB38] font-bold border border-[#FFBB38]/30 shadow-2xs">
                {pendingUsers.length} Pending
              </span>
              <span className="px-4 py-2 rounded-2xl bg-[#DCFAF8] text-[#16DBCC] font-bold border border-[#16DBCC]/30 shadow-2xs">
                {approvedUsers.length} Approved Active
              </span>
            </div>
          </div>

          {/* Pending Users Table with Layered Depth */}
          <div className="bg-white rounded-3xl border border-[#E6EFF5] overflow-hidden shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] text-slate-900">
            <div className="px-6 py-4 border-b border-[#E6EFF5] bg-white flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 font-['Plus_Jakarta_Sans']">
                Pending Approval Queue ({pendingUsers.length})
              </h3>
              <span className="text-xs text-slate-400 font-medium">Strict manual verification</span>
            </div>

            {pendingUsers.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Queue is clear"
                subtitle="All user registrations have been verified. Newly registered campus users or technicians will appear here for your approval."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F5F7FA] text-slate-500 border-b border-[#E6EFF5] text-xs font-semibold">
                    <tr>
                      <th className="px-6 py-4 font-bold">Applicant / User</th>
                      <th className="px-4 py-4 font-bold">Requested Role</th>
                      <th className="px-4 py-4 font-bold">Status</th>
                      <th className="px-4 py-4 font-bold">Requested On</th>
                      <th className="px-6 py-4 text-right font-bold">Approval Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6EFF5]">
                    {pendingUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-[#F5F7FA]/75 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <img
                              src={user.avatar}
                              alt={user.name}
                              className="w-10 h-10 rounded-full object-cover ring-2 ring-[#E6EFF5]"
                            />
                            <div>
                              <p className="font-bold text-slate-900 text-sm font-['Plus_Jakarta_Sans']">{user.name}</p>
                              <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                <span>{user.email}</span>
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                            user.role === 'technician'
                              ? 'bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/30'
                              : 'bg-[#E7EDFF] text-[#2D60FF] border border-[#2D60FF]/30'
                          }`}>
                            {user.role === 'technician' ? <Wrench className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                            <span>{user.role === 'technician' ? `Technician • ${user.specialty || 'General'}` : user.roleDisplay}</span>
                          </span>
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FFBB38] animate-ping" />
                            <span>Pending Approval</span>
                          </span>
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap text-slate-500 text-xs font-medium">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleApprove(user)}
                              className="h-11 px-5 rounded-2xl bg-[#2D60FF] hover:bg-[#1814F3] text-white font-bold text-xs transition-all duration-200 active:scale-[0.98] flex items-center gap-1.5 shadow-md shadow-[#2D60FF]/25"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Approve</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleReject(user)}
                              className="h-11 px-4 rounded-2xl bg-white hover:bg-rose-50 border border-rose-200 text-[#FF4B4A] font-semibold text-xs transition-all duration-200 active:scale-[0.98] flex items-center gap-1 shadow-2xs"
                            >
                              <XCircle className="w-4 h-4" />
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
          <div className="bg-white rounded-3xl border border-[#E6EFF5] overflow-hidden shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] text-slate-900">
            <div className="px-6 py-4 border-b border-[#E6EFF5] bg-white flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 font-['Plus_Jakarta_Sans']">
                Approved Active Users ({approvedUsers.length})
              </h3>
              <span className="text-xs text-slate-400 font-medium">Authorized campus accounts</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F5F7FA] text-slate-500 border-b border-[#E6EFF5] text-xs font-semibold">
                  <tr>
                    <th className="px-6 py-4 font-bold">User</th>
                    <th className="px-4 py-4 font-bold">Role</th>
                    <th className="px-4 py-4 font-bold">Status</th>
                    <th className="px-4 py-4 font-bold">Account ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6EFF5]">
                  {approvedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-[#F5F7FA]/75 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <img
                            src={user.avatar}
                            alt={user.name}
                            className="w-9 h-9 rounded-full object-cover ring-2 ring-[#E6EFF5]"
                          />
                          <div>
                            <p className="font-semibold text-slate-900 font-['Plus_Jakarta_Sans']">{user.name}</p>
                            <p className="text-xs text-slate-500 font-medium">{user.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                          user.role === 'technician'
                            ? 'bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/30'
                            : user.role === 'admin'
                            ? 'bg-[#E7EDFF] text-[#2D60FF] border border-[#2D60FF]/30'
                            : 'bg-[#F5F7FA] text-slate-700 border border-[#E6EFF5]'
                        }`}>
                          {user.role === 'technician' ? <Wrench className="w-3 h-3" /> : user.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                          <span>{user.role === 'technician' ? `Technician • ${user.specialty || 'General'}` : user.roleDisplay}</span>
                        </span>
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#16DBCC] bg-[#DCFAF8] px-3 py-1 rounded-full border border-[#16DBCC]/30">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#16DBCC]" />
                          <span>Approved</span>
                        </span>
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap font-mono text-xs text-slate-400 font-medium">
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
      {/* TAB 2: OVERVIEW & WORK-ORDER REGISTER (Strict 8pt Grid & Layered Depth)   */}
      {/* ========================================================================= */}
      {currentTab === 'overview' && (
        <div className="space-y-6 sm:space-y-8 animate-slide-up text-slate-900">
          {/* SECTION: 4 Main Metric Cards with Layered Depth & Tactile Micro-Interactions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {/* Card 1: BankDash Cobalt Gradient "My Cards" Card */}
            <div className="bg-gradient-to-r from-[#2D60FF] to-[#1814F3] text-white p-6 rounded-3xl shadow-[0_8px_24px_-4px_rgba(45,96,255,0.35)] flex flex-col justify-between relative overflow-hidden transition-transform duration-200 active:scale-[0.98] hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-white/80">Total requests</p>
                  <p className="text-3xl font-extrabold text-white mt-2 font-['Plus_Jakarta_Sans'] tracking-tight">{stats.total}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-xs">
                  <FileText className="w-6 h-6" />
                </div>
              </div>
              <p className="text-xs text-white/80 mt-4 font-medium">All campus work orders</p>
            </div>

            {/* Card 2: Open requests */}
            <div className="bg-white p-6 rounded-3xl border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] flex flex-col justify-between transition-transform duration-200 active:scale-[0.98] hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-400">Open requests</p>
                  <p className="text-3xl font-extrabold text-slate-900 mt-2 font-['Plus_Jakarta_Sans'] tracking-tight">{stats.open}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-[#FFF5D9] flex items-center justify-center text-[#FFBB38]">
                  <Clock className="w-6 h-6" />
                </div>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-4">Awaiting resolution</p>
            </div>

            {/* Card 3: Critical / Emergency */}
            <div 
              onClick={() => handleTabSwitch('hazards')}
              className="bg-white p-6 rounded-3xl border border-[#E6EFF5] hover:border-[#FF4B4A]/50 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] flex flex-col justify-between cursor-pointer group transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#FF4B4A] flex items-center gap-1.5">
                    <span>Critical / emergency</span>
                  </p>
                  <p className="text-3xl font-extrabold text-[#FF4B4A] mt-2 font-['Plus_Jakarta_Sans'] tracking-tight">{stats.critical}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-[#FFE0EB] flex items-center justify-center text-[#FF4B4A] group-hover:scale-105 transition-transform">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              </div>
              <p className="text-xs text-[#FF4B4A] mt-4 flex items-center gap-1 font-semibold">
                <span>Review safety guidance</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </p>
            </div>

            {/* Card 4: Resolved / Closed */}
            <div className="bg-white p-6 rounded-3xl border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] flex flex-col justify-between transition-transform duration-200 active:scale-[0.98] hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-400">Resolved / closed</p>
                  <p className="text-3xl font-extrabold text-slate-900 mt-2 font-['Plus_Jakarta_Sans'] tracking-tight">{stats.done}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-[#DCFAF8] flex items-center justify-center text-[#16DBCC]">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-4">Completed work</p>
            </div>
          </div>

          {/* SECTION: Requests by Category */}
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-3 font-['Plus_Jakarta_Sans'] tracking-tight">Requests by category</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {CATEGORIES.map((cat) => (
                <div
                  key={cat.id}
                  onClick={() => setCategoryFilter(categoryFilter === cat.id ? 'All' : cat.id)}
                  className={`p-5 rounded-3xl border transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                    categoryFilter === cat.id
                      ? 'border-[#2D60FF] ring-2 ring-[#2D60FF]/20 bg-[#E7EDFF]/30 shadow-md'
                      : 'border-[#E6EFF5] hover:border-[#2D60FF]/40 bg-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)]'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-400">{cat.label}</p>
                  <p className="text-2xl font-extrabold text-slate-900 mt-1.5 font-['Plus_Jakarta_Sans']">
                    {categoryCounts[cat.id] || 0}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION: Work-order register Table & shadcn/ui Select Filters */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 font-['Plus_Jakarta_Sans'] tracking-tight">Work-order register</h2>
              <button
                onClick={clearFilters}
                className="h-11 px-5 rounded-2xl border border-[#E6EFF5] bg-white hover:bg-[#F5F7FA] text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all duration-200 active:scale-[0.98] shadow-2xs"
              >
                Clear filters
              </button>
            </div>

            {/* Filters Row with shadcn/ui Select components */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Request ID</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by ID"
                  className="w-full h-11 px-4 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2] text-xs sm:text-sm font-medium text-slate-900 placeholder-slate-400 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)] focus:bg-white focus:outline-none focus:border-[#2D60FF] focus:ring-2 focus:ring-[#2D60FF]/20 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Status</label>
                <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All statuses</SelectItem>
                    <SelectItem value="Assigned">Assigned (Open)</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Pending User Verification">Pending Verification</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Category</label>
                <Select value={categoryFilter} onValueChange={(val) => setCategoryFilter(val)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All categories</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Urgency</label>
                <Select value={priorityFilter} onValueChange={(val) => setPriorityFilter(val)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="All urgency levels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All urgency levels</SelectItem>
                    <SelectItem value="Emergency">Emergency</SelectItem>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                    <SelectItem value="Routine">Routine</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-xs text-slate-500 font-medium">
              {filteredTickets.length} matching work orders
            </p>

            {/* Skeleton Loader during active backend syncing */}
            {isLoading ? (
              <div className="py-4">
                <p className="text-xs font-semibold text-slate-500 mb-3 animate-pulse">Syncing work orders from secure backend database...</p>
                <TicketSkeleton count={4} />
              </div>
            ) : filteredTickets.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="Queue is clear"
                subtitle="No work orders match the selected filters or search query."
              />
            ) : (
              /* Table with Layered Depth */
              <div className="bg-white rounded-3xl border border-[#E6EFF5] overflow-hidden shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] text-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F5F7FA] text-slate-500 border-b border-[#E6EFF5] text-xs font-semibold">
                      <tr>
                        <th className="px-5 py-4 font-bold">Request ID</th>
                        <th className="px-5 py-4 font-bold">Location</th>
                        <th className="px-4 py-4 font-bold">Category</th>
                        <th className="px-4 py-4 font-bold">Priority</th>
                        <th className="px-4 py-4 font-bold">Status</th>
                        <th className="px-4 py-4 font-bold">Safety</th>
                        <th className="px-4 py-4 font-bold">Data</th>
                        <th className="px-5 py-4 text-right font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E6EFF5]">
                      {filteredTickets.map((ticket) => {
                        const statusStyle = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.Open;

                        let priorityBadgeClass = "bg-[#DCFAF8] text-[#16DBCC] border border-[#16DBCC]/30";
                        if (ticket.priority === 'Emergency' || ticket.priority === 'Critical') {
                          priorityBadgeClass = "bg-[#FFE0EB] text-[#FF4B4A] border border-[#FF4B4A]/30";
                        } else if (ticket.priority === 'Urgent' || ticket.priority === 'High') {
                          priorityBadgeClass = "bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/30";
                        }

                        return (
                          <tr
                            key={ticket.id}
                            onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
                            className="hover:bg-[#F5F7FA]/75 transition-colors cursor-pointer group"
                          >
                            <td className="px-5 py-4 whitespace-nowrap font-bold text-slate-900 group-hover:text-[#2D60FF] transition-colors">
                              {ticket.id}
                            </td>

                            <td className="px-5 py-4 whitespace-nowrap text-slate-700 font-medium">
                              {ticket.location || 'Campus Building A'}
                            </td>

                            <td className="px-4 py-4 whitespace-nowrap text-slate-500 font-medium">
                              {ticket.category}
                            </td>

                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${priorityBadgeClass}`}>
                                {ticket.priority === 'Critical' ? 'Emergency' : ticket.priority === 'High' ? 'Urgent' : ticket.priority}
                              </span>
                            </td>

                            <td className="px-4 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={ticket.status === 'Completed' ? 'Completed' : ticket.status}
                                onChange={(e) => updateTicketStatus(ticket.id, e.target.value)}
                                className={`px-3 py-1 rounded-full text-xs font-semibold border-0 cursor-pointer focus:ring-2 focus:ring-[#2D60FF]/20 ${statusStyle.pill}`}
                              >
                                <option value="Assigned">Assigned</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Pending User Verification">Pending Verification</option>
                                <option value="Completed">Completed</option>
                              </select>
                            </td>

                            <td className="px-4 py-4 whitespace-nowrap">
                              {ticket.isHazard || ticket.priority === 'Critical' || ticket.priority === 'Emergency' ? (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#FFE0EB] text-[#FF4B4A] border border-[#FF4B4A]/30 tracking-wide">
                                  HAZARD
                                </span>
                              ) : null}
                            </td>

                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#DCFAF8] text-[#16DBCC] border border-[#16DBCC]/30 font-mono">
                                AUTHORITATIVE
                              </span>
                            </td>

                            <td className="px-5 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
                                  className="p-2 text-slate-400 hover:text-[#2D60FF] rounded-xl hover:bg-[#F5F7FA] transition-colors"
                                  title="View details"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => deleteTicket(ticket.id)}
                                  className="p-2 text-slate-400 hover:text-[#FF4B4A] rounded-xl hover:bg-rose-50 transition-colors"
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
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: REQUEST QUEUE (Dedicated All Requests View)                        */}
      {/* ========================================================================= */}
      {currentTab === 'requests' && (
        <div className="space-y-6 animate-slide-up text-slate-900">
          {/* Subheader */}
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5 font-['Plus_Jakarta_Sans']">
              <ListFilter className="w-6 h-6 text-[#2D60FF]" />
              <span>Work-Order Request Queue</span>
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-1">
              Centralized queue of all campus maintenance work orders logged via web portal and Voiceflow AI.
            </p>
          </div>

          {/* Quick Filter Status Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { id: 'All', label: 'All Requests', count: tickets.length },
              { id: 'Assigned', label: 'Assigned (Open)', count: stats.open },
              { id: 'In Progress', label: 'In Progress', count: stats.inProgress },
              { id: 'Pending User Verification', label: 'Pending Verification', count: tickets.filter(t => t.status === 'Pending User Verification').length },
              { id: 'Completed', label: 'Completed', count: stats.done }
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStatusFilter(pill.id)}
                className={`h-11 px-5 rounded-2xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] whitespace-nowrap flex items-center gap-2 ${
                  statusFilter === pill.id
                    ? 'bg-[#2D60FF] text-white shadow-md shadow-[#2D60FF]/25 font-bold'
                    : 'bg-white hover:bg-[#F5F7FA] text-slate-600 border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)]'
                }`}
              >
                <span>{pill.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  statusFilter === pill.id ? 'bg-white/20 text-white' : 'bg-[#F5F7FA] text-slate-500'
                }`}>
                  {pill.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search & Filter Controls with shadcn/ui Select */}
          <div className="p-6 rounded-3xl bg-white border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by ID, title, complaint, or location..."
                  className="w-full h-11 pl-11 pr-4 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2] text-xs sm:text-sm font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#2D60FF] focus:ring-2 focus:ring-[#2D60FF]/20 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)] transition-all"
                />
              </div>

              <div>
                <Select value={categoryFilter} onValueChange={(val) => setCategoryFilter(val)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Categories</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select value={priorityFilter} onValueChange={(val) => setPriorityFilter(val)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="All Urgency Levels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Urgency Levels</SelectItem>
                    <SelectItem value="Emergency">Emergency</SelectItem>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                    <SelectItem value="Routine">Routine</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Request Queue Table or Skeletons or Empty State */}
          {isLoading ? (
            <div className="py-4">
              <p className="text-xs font-semibold text-slate-500 mb-3 animate-pulse">Syncing work orders from secure backend database...</p>
              <TicketSkeleton count={4} />
            </div>
          ) : filteredTickets.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Queue is clear"
              subtitle="Great job, all maintenance requests are resolved."
            />
          ) : (
            <div className="bg-white rounded-3xl border border-[#E6EFF5] overflow-hidden shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] text-slate-900">
              <div className="px-6 py-4 border-b border-[#E6EFF5] bg-white flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900 font-['Plus_Jakarta_Sans']">
                  {filteredTickets.length} Work Orders in Queue
                </span>
                <span className="text-xs font-medium text-slate-500">Live operational dispatch</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F5F7FA] text-slate-500 border-b border-[#E6EFF5] text-xs font-semibold">
                    <tr>
                      <th className="px-5 py-4 font-bold">Request ID</th>
                      <th className="px-5 py-4 font-bold">Location</th>
                      <th className="px-4 py-4 font-bold">Category</th>
                      <th className="px-4 py-4 font-bold">Priority</th>
                      <th className="px-4 py-4 font-bold">Status</th>
                      <th className="px-4 py-4 font-bold">Safety</th>
                      <th className="px-4 py-4 font-bold">Assigned Tech</th>
                      <th className="px-5 py-4 text-right font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6EFF5]">
                    {filteredTickets.map((ticket) => {
                      const statusStyle = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.Open;
                      let priorityBadgeClass = "bg-[#DCFAF8] text-[#16DBCC] border border-[#16DBCC]/30";
                      if (ticket.priority === 'Emergency' || ticket.priority === 'Critical') {
                        priorityBadgeClass = "bg-[#FFE0EB] text-[#FF4B4A] border border-[#FF4B4A]/30";
                      } else if (ticket.priority === 'Urgent' || ticket.priority === 'High') {
                        priorityBadgeClass = "bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/30";
                      }

                      return (
                        <tr
                          key={ticket.id}
                          onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
                          className="hover:bg-[#F5F7FA]/75 transition-colors cursor-pointer group"
                        >
                          <td className="px-5 py-4 whitespace-nowrap">
                            <p className="font-bold text-slate-900 group-hover:text-[#2D60FF] transition-colors">{ticket.id}</p>
                            <p className="text-xs font-medium text-slate-500 mt-0.5 line-clamp-1 max-w-[200px]">{ticket.title}</p>
                          </td>

                          <td className="px-5 py-4 whitespace-nowrap text-slate-700 font-medium">
                            {ticket.location || 'Campus Facilities'}
                          </td>

                          <td className="px-4 py-4 whitespace-nowrap text-slate-500 font-medium">
                            {ticket.category}
                          </td>

                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${priorityBadgeClass}`}>
                              {ticket.priority === 'Critical' ? 'Emergency' : ticket.priority === 'High' ? 'Urgent' : ticket.priority}
                            </span>
                          </td>

                          <td className="px-4 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={ticket.status === 'Completed' ? 'Completed' : ticket.status}
                              onChange={(e) => updateTicketStatus(ticket.id, e.target.value)}
                              className={`px-3 py-1 rounded-full text-xs font-semibold border-0 cursor-pointer focus:ring-2 focus:ring-[#2D60FF]/20 ${statusStyle.pill}`}
                            >
                              <option value="Assigned">Assigned</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Pending User Verification">Pending Verification</option>
                              <option value="Completed">Completed</option>
                            </select>
                          </td>

                          <td className="px-4 py-4 whitespace-nowrap">
                            {ticket.isHazard || ticket.priority === 'Critical' || ticket.priority === 'Emergency' ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#FFE0EB] text-[#FF4B4A] border border-[#FF4B4A]/30 tracking-wide">
                                HAZARD
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-slate-400">Normal</span>
                            )}
                          </td>

                          <td className="px-4 py-4 whitespace-nowrap text-slate-700 font-medium">
                            {ticket.assignedTo || 'Unassigned'}
                          </td>

                          <td className="px-5 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
                                className="p-2 text-slate-400 hover:text-[#2D60FF] rounded-xl hover:bg-[#F5F7FA] transition-colors"
                                title="Inspect ticket details"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteTicket(ticket.id)}
                                className="p-2 text-slate-400 hover:text-[#FF4B4A] rounded-xl hover:bg-rose-50 transition-colors"
                                title="Delete ticket"
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
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: HAZARD QUEUE (High-Priority Life Safety & Risk Management)         */}
      {/* ========================================================================= */}
      {currentTab === 'hazards' && (
        <div className="space-y-6 animate-slide-up text-slate-900">
          {/* High-Impact Emergency Header */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-rose-50 via-white to-rose-50 border border-[#FF4B4A]/30 text-slate-900 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#FFE0EB] border border-[#FF4B4A]/30 text-[#FF4B4A] text-xs font-bold mb-2">
                  <Flame className="w-3.5 h-3.5 text-[#FF4B4A] animate-pulse" />
                  <span>EMERGENCY DISPATCH COMMAND CENTER</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-['Plus_Jakarta_Sans']">
                  Critical Facility Hazard Queue
                </h2>
                <p className="text-sm font-medium text-slate-500 mt-1 max-w-xl">
                  High-voltage electrical faults, burst pressurized piping, structural risks, and lift failures requiring immediate on-site technician containment.
                </p>
              </div>

              {/* Emergency Summary Numbers */}
              <div className="flex items-center gap-3">
                <div className="p-4 rounded-2xl bg-white border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] text-center min-w-24">
                  <p className="text-xs font-semibold text-[#FF4B4A]">Critical Alerts</p>
                  <p className="text-2xl font-black text-[#FF4B4A] mt-0.5 font-['Plus_Jakarta_Sans']">{stats.critical}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] text-center min-w-24">
                  <p className="text-xs font-semibold text-slate-500">Total Hazards</p>
                  <p className="text-2xl font-black text-slate-900 mt-0.5 font-['Plus_Jakarta_Sans']">{hazardTickets.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Safety Guidelines Triage Callouts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 rounded-2xl bg-white border border-[#E6EFF5] text-slate-900 text-xs flex items-start gap-3 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)]">
              <div className="w-9 h-9 rounded-xl bg-[#FFF5D9] text-[#FFBB38] flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">⚡ Electrical Shock Risk</p>
                <p className="text-slate-500 text-xs font-medium mt-1">Isolate main branch breakers before technician touches wiring.</p>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-[#E6EFF5] text-slate-900 text-xs flex items-start gap-3 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)]">
              <div className="w-9 h-9 rounded-xl bg-[#DCFAF8] text-[#16DBCC] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">💧 Water Flooding Risk</p>
                <p className="text-slate-500 text-xs font-medium mt-1">Shut off building riser valve; inspect adjacent electrical sockets.</p>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-[#E6EFF5] text-slate-900 text-xs flex items-start gap-3 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)]">
              <div className="w-9 h-9 rounded-xl bg-[#FFE0EB] text-[#FF4B4A] flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">🛗 Lift / Elevator Lockout</p>
                <p className="text-slate-500 text-xs font-medium mt-1">Park cabin at ground level, turn off auto-recall and post physical notices.</p>
              </div>
            </div>
          </div>

          {/* Hazard Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setHazardFilter('All')}
              className={`h-11 px-5 rounded-2xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] whitespace-nowrap ${
                hazardFilter === 'All'
                  ? 'bg-[#FF4B4A] text-white shadow-md shadow-[#FF4B4A]/25'
                  : 'bg-white hover:bg-[#F5F7FA] text-slate-600 border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)]'
              }`}
            >
              All Hazard Work Orders ({hazardTickets.length})
            </button>
            <button
              type="button"
              onClick={() => setHazardFilter('Critical')}
              className={`h-11 px-5 rounded-2xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] whitespace-nowrap ${
                hazardFilter === 'Critical'
                  ? 'bg-[#FF4B4A] text-white shadow-md shadow-[#FF4B4A]/25'
                  : 'bg-white hover:bg-[#F5F7FA] text-slate-600 border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)]'
              }`}
            >
              Critical / Emergency Only ({hazardTickets.filter(t => t.isHazard || t.priority === 'Critical' || t.priority === 'Emergency' || t.Urgency === 'Emergency' || t.urgency === 'Emergency').length})
            </button>
            <button
              type="button"
              onClick={() => setHazardFilter('Urgent')}
              className={`h-11 px-5 rounded-2xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] whitespace-nowrap ${
                hazardFilter === 'Urgent'
                  ? 'bg-[#FF4B4A] text-white shadow-md shadow-[#FF4B4A]/25'
                  : 'bg-white hover:bg-[#F5F7FA] text-slate-600 border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)]'
              }`}
            >
              Urgent Priority Only ({hazardTickets.filter(t => t.priority === 'Urgent' || t.Urgency === 'Urgent').length})
            </button>
          </div>

          {/* Hazard Cards Grid or Empty State */}
          {filteredHazards.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Queue is clear"
              subtitle="Great job, all maintenance requests are resolved."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredHazards.map((ticket) => (
                <div 
                  key={ticket.id}
                  onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
                  className="bg-white rounded-3xl p-6 border border-[#FFE0EB] hover:border-[#FF4B4A]/50 transition-all duration-200 active:scale-[0.98] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] cursor-pointer flex flex-col justify-between space-y-4 group"
                >
                  <div>
                    {/* Header: Hazard Tag & Status */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold bg-[#FFE0EB] text-[#FF4B4A] border border-[#FF4B4A]/30 tracking-wide">
                          <Flame className="w-3 h-3 text-[#FF4B4A]" />
                          <span>HAZARD</span>
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-900">
                          #{ticket.id}
                        </span>
                      </div>

                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/30">
                        {ticket.status}
                      </span>
                    </div>

                    {/* Image & Fault Summary */}
                    <div className="flex gap-4 mt-3">
                      {(() => {
                        const imageUrl = ticket.image || ticket.photo || ticket.imageUrl;
                        const isS3Key = imageUrl && (imageUrl.startsWith('uploads/') || imageUrl.startsWith('s3://'));
                        if (imageUrl && !isS3Key) {
                          return (
                            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-[#F5F7FA] border border-[#E6EFF5] shrink-0 relative group-hover:scale-105 transition-transform">
                              <img
                                src={imageUrl}
                                alt="Hazard photo"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  if (e.currentTarget.parentElement) {
                                    e.currentTarget.parentElement.style.display = 'none';
                                  }
                                }}
                              />
                            </div>
                          );
                        }
                        return null;
                      })()}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#2D60FF] transition-colors line-clamp-1 font-['Plus_Jakarta_Sans']">
                          {ticket.title}
                        </h4>
                        <p className="text-xs font-medium text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                          {ticket.description}
                        </p>
                        {ticket.location && (
                          <p className="text-xs font-medium text-slate-500 flex items-center gap-1 mt-2">
                            <MapPin className="w-3.5 h-3.5 text-[#2D60FF] shrink-0" />
                            <span className="font-semibold text-slate-800">{ticket.location}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Assigned Tech */}
                  <div className="pt-4 border-t border-[#E6EFF5] flex items-center justify-between gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                      <Wrench className="w-3.5 h-3.5 text-slate-400" />
                      <span>Tech: <strong className="text-slate-900">{ticket.assignedTo || 'Unassigned'}</strong></span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
                        className="h-11 px-5 rounded-2xl bg-[#2D60FF] hover:bg-[#1814F3] text-white font-bold text-xs transition-all duration-200 active:scale-[0.98] flex items-center gap-1.5 shadow-md shadow-[#2D60FF]/25"
                      >
                        <span>Dispatch / Review</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: AUDIT TRAIL (IMMUTABLE LOGS)                                      */}
      {/* ========================================================================= */}
      {currentTab === 'audit' && (
        <div className="space-y-6 animate-slide-up max-w-5xl text-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5 font-['Plus_Jakarta_Sans']">
                <FileText className="w-6 h-6 text-[#2D60FF]" />
                <span>Immutable System Audit Trail</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                Real-time security log: Account registrations, admin approvals, ticket mutations, and dual-sign-offs.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadAuditLogs}
                disabled={loadingAudit}
                className="h-11 px-4 rounded-2xl bg-[#F5F7FA] hover:bg-[#E6EFF5] text-slate-900 text-xs font-semibold border border-[#DFEAF2] transition-all flex items-center gap-1.5 shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={handleExportAuditJson}
                className="h-11 px-4 rounded-2xl bg-[#E7EDFF] hover:bg-[#2D60FF]/15 text-[#2D60FF] text-xs font-semibold border border-[#2D60FF]/30 transition-all flex items-center gap-1.5 shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Audit JSON</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-[#E6EFF5] overflow-hidden shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]">
            <div className="px-6 py-4 border-b border-[#E6EFF5] flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 font-['Plus_Jakarta_Sans']">
                Audit Records ({auditLogs.length})
              </h3>
              <span className="text-xs text-slate-400 font-medium">Tenant: org_campus_main</span>
            </div>

            {auditLogs.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="No audit events recorded"
                subtitle="Actions like signups, approvals, status updates, and dual confirmations will appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F5F7FA] text-slate-500 border-b border-[#E6EFF5] text-xs font-semibold">
                    <tr>
                      <th className="px-6 py-4 font-bold">Timestamp</th>
                      <th className="px-4 py-4 font-bold">Action</th>
                      <th className="px-4 py-4 font-bold">Target</th>
                      <th className="px-4 py-4 font-bold">Actor</th>
                      <th className="px-6 py-4 font-bold">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6EFF5]">
                    {auditLogs.map((log) => {
                      let actionColor = "bg-slate-100 text-slate-700";
                      if (log.action.includes('USER_APPROVED') || log.action.includes('TECH_CONFIRM')) {
                        actionColor = "bg-emerald-50 text-emerald-700 border border-emerald-300";
                      } else if (log.action.includes('USER_CONFIRM')) {
                        actionColor = "bg-teal-50 text-teal-700 border border-teal-300";
                      } else if (log.action.includes('REJECTED')) {
                        actionColor = "bg-rose-50 text-rose-700 border border-rose-300";
                      } else if (log.action.includes('CREATED')) {
                        actionColor = "bg-blue-50 text-blue-700 border border-blue-300";
                      }

                      return (
                        <tr key={log.id} className="hover:bg-[#F5F7FA]/75 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${actionColor}`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap font-mono text-slate-800 font-semibold">
                            {log.target_id || '—'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-slate-700">
                            <span className="font-semibold">{log.actor_role}</span>
                            <span className="text-slate-400 font-mono text-[10px] block">{log.actor_id}</span>
                          </td>
                          <td className="px-6 py-4 text-slate-600 max-w-xs truncate">
                            {log.details ? (
                              <span className="font-mono text-[11px] text-slate-700">
                                {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: SETTINGS & OPERATIONS CONFIGURATION                                */}
      {/* ========================================================================= */}
      {currentTab === 'settings' && (
        <div className="space-y-6 animate-slide-up max-w-4xl text-slate-900">
          {/* Header */}
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5 font-['Plus_Jakarta_Sans']">
              <SettingsIcon className="w-6 h-6 text-[#2D60FF]" />
              <span>Facilities Operations & Secure Foundation</span>
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-1">
              Authoritative backend configuration, multi-tenant isolation, and dual-approval facilities policies.
            </p>
          </div>

          {/* 1. Secure Backend Architecture Card */}
          <div className="p-6 rounded-3xl bg-white border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#E7EDFF] text-[#2D60FF] flex items-center justify-center shadow-xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 font-['Plus_Jakarta_Sans']">Authoritative Multi-Tenant Platform</h3>
                <p className="text-xs font-medium text-slate-500">Security claims derived strictly from verified JWT tokens.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
              <div className="p-3.5 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2]">
                <p className="text-slate-400 font-semibold uppercase text-[10px]">Active Organisation</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5 font-mono">org_campus_main</p>
                <p className="text-[11px] text-slate-500 mt-1">Strict multi-tenant data boundary isolation</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2]">
                <p className="text-slate-400 font-semibold uppercase text-[10px]">Password Protection</p>
                <p className="text-sm font-bold text-emerald-700 mt-0.5">PBKDF2-HMAC-SHA256</p>
                <p className="text-[11px] text-slate-500 mt-1">100k iterations with 16-byte cryptographically secure salt</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2]">
                <p className="text-slate-400 font-semibold uppercase text-[10px]">RAG Vector Search</p>
                <p className="text-sm font-bold text-[#2D60FF] mt-0.5">text-embedding-004 + Fallback</p>
                <p className="text-[11px] text-slate-500 mt-1">Ingestion gated strictly on dual-verified completion</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2]">
                <p className="text-slate-400 font-semibold uppercase text-[10px]">Safety Priority Overrides</p>
                <p className="text-sm font-bold text-red-600 mt-0.5">Deterministic Guardrails</p>
                <p className="text-[11px] text-slate-500 mt-1">Gas leaks, sparking, live wires clamp to Emergency Hazard</p>
              </div>
            </div>
          </div>

          {/* 2. Operational Policies Card */}
          <div className="p-6 rounded-3xl bg-white border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 font-['Plus_Jakarta_Sans']">
              <ShieldCheck className="w-4 h-4 text-[#2D60FF]" />
              <span>Campus Facilities Policies</span>
            </h3>

            <div className="space-y-3 divide-y divide-[#E6EFF5]">
              <div className="flex items-center justify-between pt-2">
                <div>
                  <p className="text-xs font-bold text-slate-900 font-['Plus_Jakarta_Sans']">Admin Gated Registration</p>
                  <p className="text-xs font-medium text-slate-500">Require Administrator review before new user and technician accounts can access the system.</p>
                </div>
                <input
                  type="checkbox"
                  checked={policies.strictGating}
                  onChange={(e) => setPolicies({ ...policies, strictGating: e.target.checked })}
                  className="w-4 h-4 rounded text-[#2D60FF] focus:ring-[#2D60FF] border-[#DFEAF2]"
                />
              </div>

              <div className="flex items-center justify-between pt-3">
                <div>
                  <p className="text-xs font-bold text-slate-900 font-['Plus_Jakarta_Sans']">Two-Party Dual Confirmation</p>
                  <p className="text-xs font-medium text-slate-500">Work orders cannot be closed until reporting consumer verifies physical repair after technician signs off.</p>
                </div>
                <input
                  type="checkbox"
                  checked={policies.dualApproval}
                  onChange={(e) => setPolicies({ ...policies, dualApproval: e.target.checked })}
                  className="w-4 h-4 rounded text-[#2D60FF] focus:ring-[#2D60FF] border-[#DFEAF2]"
                />
              </div>

              <div className="flex items-center justify-between pt-3">
                <div>
                  <p className="text-xs font-bold text-slate-900 font-['Plus_Jakarta_Sans']">Emergency Hazard Auto-Escalation</p>
                  <p className="text-xs font-medium text-slate-500">Automatically flag electrical, gas, and pressurized water complaints with non-downgradable Emergency status.</p>
                </div>
                <input
                  type="checkbox"
                  checked={policies.autoRouting}
                  onChange={(e) => setPolicies({ ...policies, autoRouting: e.target.checked })}
                  className="w-4 h-4 rounded text-[#2D60FF] focus:ring-[#2D60FF] border-[#DFEAF2]"
                />
              </div>
            </div>
          </div>

          {/* 3. Data Backup & Reset */}
          <div className="p-6 rounded-3xl bg-white border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 font-['Plus_Jakarta_Sans']">
              <Database className="w-4 h-4 text-[#2D60FF]" />
              <span>Data Management & Maintenance</span>
            </h3>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExportJson}
                className="h-11 px-5 rounded-2xl bg-[#F5F7FA] hover:bg-[#E6EFF5] text-slate-900 text-xs font-semibold border border-[#DFEAF2] transition-all flex items-center gap-2 shadow-xs"
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span>Export All Tickets (JSON)</span>
              </button>

              <button
                type="button"
                onClick={handleExportAuditJson}
                className="h-11 px-5 rounded-2xl bg-[#F5F7FA] hover:bg-[#E6EFF5] text-slate-900 text-xs font-semibold border border-[#DFEAF2] transition-all flex items-center gap-2 shadow-xs"
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span>Export Audit Logs (JSON)</span>
              </button>

              <button
                type="button"
                onClick={handleResetData}
                className="h-11 px-5 rounded-2xl bg-[#FFE0EB] hover:bg-rose-100 text-[#FF4B4A] text-xs font-semibold border border-[#FF4B4A]/30 transition-all flex items-center gap-2 shadow-xs"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear All Work Orders</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
