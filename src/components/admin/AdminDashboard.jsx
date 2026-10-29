import React, { useState, useMemo, useEffect } from 'react';
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
  FileText
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
    isAirtableConnected,
    airtablePat,
    setAirtablePat,
    resetMockData
  } = useTickets();
  const { users, pendingUsers, approvedUsers, approveUser, rejectUser } = useAuth();

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

  // Settings State
  const [geminiKey, setGeminiKey] = useState(() => {
    return localStorage.getItem('maintainx_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
  });
  const [geminiModel, setGeminiModel] = useState(() => {
    return localStorage.getItem('maintainx_gemini_model') || 'auto';
  });
  const [showKey, setShowKey] = useState(false);
  const [patInput, setPatInput] = useState(airtablePat || '');
  const [isSyncing, setIsSyncing] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
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

  // All Hazard tickets
  const hazardTickets = useMemo(() => {
    return tickets.filter((t) => {
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
        return t.priority === 'Critical' || t.priority === 'Emergency';
      }
      if (hazardFilter === 'Urgent') {
        return t.priority === 'Urgent' || t.Urgency === 'Urgent';
      }
      return true;
    });
  }, [hazardTickets, hazardFilter]);

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

  // Live Airtable manual sync trigger
  const handleSyncAirtable = async () => {
    setIsSyncing(true);
    try {
      if (typeof fetchTickets === 'function') {
        await fetchTickets();
      }
      addToast({
        type: 'success',
        title: 'Airtable Sync Complete',
        message: 'Tickets refreshed from Airtable Base app32PCGpVp4lBamC.'
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Sync Failed',
        message: err.message || 'Could not fetch from Airtable.'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Save Gemini Configuration
  const handleSaveGemini = (e) => {
    e.preventDefault();
    const trimmed = geminiKey.trim();
    if (trimmed) {
      localStorage.setItem('maintainx_gemini_api_key', trimmed);
    } else {
      localStorage.removeItem('maintainx_gemini_api_key');
    }
    localStorage.setItem('maintainx_gemini_model', geminiModel);
    addToast({
      type: 'success',
      title: 'AI Settings Saved',
      message: `Gemini configuration updated. Active model: ${geminiModel}.`
    });
  };

  // Save Airtable PAT Token
  const handleSavePat = (e) => {
    e.preventDefault();
    const trimmed = patInput.trim();
    if (trimmed) {
      localStorage.setItem('maintainx_airtable_pat_v1', trimmed);
      if (setAirtablePat) setAirtablePat(trimmed);
    } else {
      localStorage.removeItem('maintainx_airtable_pat_v1');
      if (setAirtablePat) setAirtablePat('');
    }
    addToast({
      type: 'success',
      title: 'Airtable Credentials Saved',
      message: 'Personal Access Token updated.'
    });
  };

  // Test Gemini Connection
  const handleTestAi = async () => {
    const key = geminiKey.trim() || import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('maintainx_gemini_api_key');
    if (!key) {
      addToast({
        type: 'warning',
        title: 'No API Key Configured',
        message: 'Please enter a Google Gemini API Key first.'
      });
      return;
    }
    setTestingAi(true);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      const count = data.models?.length || 0;
      addToast({
        type: 'success',
        title: 'Gemini AI Live & Verified!',
        message: `Successfully connected to Google AI Studio (${count} models active).`
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Gemini Verification Error',
        message: err.message || 'Failed to connect to Google Gemini API.'
      });
    } finally {
      setTestingAi(false);
    }
  };

  // Reset to initial sample data
  const handleResetData = () => {
    if (window.confirm('Reset all maintenance tickets to initial demo state?')) {
      if (resetMockData) resetMockData();
    }
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

        {/* Top Tab Switcher: Synced with Left Sidebar */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 border border-slate-200 self-start sm:self-auto overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => handleTabSwitch('overview')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
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
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              currentTab === 'approvals'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Pending Approvals</span>
            {pendingUsers.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse">
                {pendingUsers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabSwitch('requests')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              currentTab === 'requests'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5 text-slate-600" />
            <span>Request Queue</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabSwitch('hazards')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              currentTab === 'hazards'
                ? 'bg-white text-rose-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>Hazard Queue</span>
            {stats.critical > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-600 text-white">
                {stats.critical}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabSwitch('settings')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              currentTab === 'settings'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5 text-slate-600" />
            <span>Settings</span>
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
                Account Approvals: {pendingUsers.length} account request{pendingUsers.length > 1 ? 's' : ''} awaiting validation
              </p>
              <p className="text-amber-800 text-[11px] mt-0.5">
                New user and technician registrations require your approval before they can access SmartFixFlow - AI.
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
                <span>Admin Auth Validation & User Gating</span>
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

                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                            <span>Pending Approval</span>
                          </span>
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap text-slate-500 text-xs">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                          </div>
                        </td>

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
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <p className="text-xs font-medium text-slate-500">Total requests</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-2 font-mono">{stats.total}</p>
              <p className="text-[11px] text-slate-400 mt-1">All campus work orders</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <p className="text-xs font-medium text-slate-500">Open requests</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-2 font-mono">{stats.open}</p>
              <p className="text-[11px] text-slate-400 mt-1">Awaiting resolution</p>
            </div>

            <div 
              onClick={() => handleTabSwitch('hazards')}
              className="bg-white p-5 rounded-2xl border border-rose-200/90 hover:border-rose-300 shadow-2xs cursor-pointer transition-all group"
            >
              <p className="text-xs font-medium text-rose-600 flex items-center justify-between">
                <span>Critical / emergency</span>
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500 group-hover:scale-110 transition-transform" />
              </p>
              <p className="text-3xl font-extrabold text-rose-900 mt-2 font-mono">{stats.critical || 1}</p>
              <p className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
                <span>Review safety guidance</span>
                <ArrowRight className="w-3 h-3" />
              </p>
            </div>

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
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Request ID</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by ID"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 shadow-2xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 shadow-2xs cursor-pointer"
                >
                  <option value="All">All statuses</option>
                  <option value="Assigned">Assigned (Open)</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Pending User Verification">Pending Verification</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

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

                      let priorityBadgeClass = "bg-[#047857] text-white";
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
                          <td className="px-4 py-4 whitespace-nowrap font-medium text-slate-900 group-hover:text-sky-700">
                            {ticket.id}
                          </td>

                          <td className="px-4 py-4 whitespace-nowrap text-slate-700 font-medium">
                            {ticket.location || 'Campus Building A'}
                          </td>

                          <td className="px-4 py-4 whitespace-nowrap text-slate-600">
                            {ticket.category}
                          </td>

                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${priorityBadgeClass}`}>
                              {ticket.priority === 'Critical' ? 'Emergency' : ticket.priority === 'High' ? 'Urgent' : ticket.priority}
                            </span>
                          </td>

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

                          <td className="px-4 py-4 whitespace-nowrap">
                            {ticket.isHazard || ticket.priority === 'Critical' || ticket.priority === 'Emergency' ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#b91c1c] text-white tracking-wide">
                                HAZARD
                              </span>
                            ) : null}
                          </td>

                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#e2e8f0] text-slate-700">
                              {ticket.isAirtable ? 'AIRTABLE' : 'DEMO'}
                            </span>
                          </td>

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

      {/* ========================================================================= */}
      {/* TAB 3: REQUEST QUEUE (Dedicated All Requests View)                        */}
      {/* ========================================================================= */}
      {currentTab === 'requests' && (
        <div className="space-y-6 animate-slide-up">
          {/* Subheader */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
                <ListFilter className="w-6 h-6 text-slate-800" />
                <span>Work-Order Request Queue</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Centralized queue of all campus maintenance work orders logged via web portal and Voiceflow AI.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold shadow-2xs transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>Export JSON</span>
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors"
              >
                Reset Filters
              </button>
            </div>
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
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  statusFilter === pill.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <span>{pill.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  statusFilter === pill.id ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'
                }`}>
                  {pill.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search & Filter Controls */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by ID, title, complaint, or location..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50/50 border border-slate-200 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50/50 border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer"
                >
                  <option value="All">All Categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50/50 border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer"
                >
                  <option value="All">All Urgency Levels</option>
                  <option value="Emergency">Emergency</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Routine">Routine</option>
                </select>
              </div>
            </div>
          </div>

          {/* Request Queue Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">
                {filteredTickets.length} Work Orders in Queue
              </span>
              <span className="text-[11px] text-slate-400">Live operational dispatch</span>
            </div>

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
                    <th className="px-4 py-3.5 font-bold">Assigned Tech</th>
                    <th className="px-4 py-3.5 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTickets.map((ticket) => {
                    const statusStyle = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.Open;
                    let priorityBadgeClass = "bg-[#047857] text-white";
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
                        <td className="px-4 py-4 whitespace-nowrap">
                          <p className="font-bold text-slate-900 group-hover:text-sky-700">{ticket.id}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 max-w-[200px]">{ticket.title}</p>
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap text-slate-700 font-medium">
                          {ticket.location || 'Campus Facilities'}
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap text-slate-600">
                          {ticket.category}
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${priorityBadgeClass}`}>
                            {ticket.priority === 'Critical' ? 'Emergency' : ticket.priority === 'High' ? 'Urgent' : ticket.priority}
                          </span>
                        </td>

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

                        <td className="px-4 py-4 whitespace-nowrap">
                          {ticket.isHazard || ticket.priority === 'Critical' || ticket.priority === 'Emergency' ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#b91c1c] text-white tracking-wide">
                              HAZARD
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Normal</span>
                          )}
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap text-slate-600 font-medium">
                          {ticket.assignedTo || 'Unassigned'}
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
                              className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100"
                              title="Inspect ticket details"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteTicket(ticket.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: HAZARD QUEUE (High-Priority Life Safety & Risk Management)         */}
      {/* ========================================================================= */}
      {currentTab === 'hazards' && (
        <div className="space-y-6 animate-slide-up">
          {/* High-Impact Emergency Header */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-rose-950 via-slate-900 to-rose-950 text-white shadow-md relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold mb-2">
                  <Flame className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                  <span>EMERGENCY DISPATCH COMMAND CENTER</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Critical Facility Hazard Queue
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                  High-voltage electrical faults, burst pressurized piping, structural risks, and lift failures requiring immediate on-site technician containment.
                </p>
              </div>

              {/* Emergency Summary Numbers */}
              <div className="flex items-center gap-3">
                <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 text-center min-w-24">
                  <p className="text-[11px] text-rose-200 font-medium">Critical Alerts</p>
                  <p className="text-2xl font-black text-rose-400 mt-0.5 font-mono">{stats.critical}</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 text-center min-w-24">
                  <p className="text-[11px] text-slate-200 font-medium">Total Hazards</p>
                  <p className="text-2xl font-black text-white mt-0.5 font-mono">{hazardTickets.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Safety Guidelines Triage Callouts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs flex items-start gap-3">
              <Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">⚡ Electrical Shock Risk</p>
                <p className="text-amber-800 text-[11px] mt-0.5">Isolate main branch breakers before technician touches wiring.</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-950 text-xs flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">💧 Water Flooding Risk</p>
                <p className="text-blue-800 text-[11px] mt-0.5">Shut off building riser valve; inspect adjacent electrical sockets.</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 text-xs flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">🛗 Lift / Elevator Lockout</p>
                <p className="text-rose-800 text-[11px] mt-0.5">Park cabin at ground level, turn off auto-recall and post physical notices.</p>
              </div>
            </div>
          </div>

          {/* Hazard Filter Tabs */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHazardFilter('All')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                hazardFilter === 'All'
                  ? 'bg-rose-900 text-white shadow-2xs'
                  : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              All Hazard Work Orders ({hazardTickets.length})
            </button>
            <button
              type="button"
              onClick={() => setHazardFilter('Critical')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                hazardFilter === 'Critical'
                  ? 'bg-rose-900 text-white shadow-2xs'
                  : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              Critical / Emergency Only ({hazardTickets.filter(t => t.priority === 'Critical' || t.priority === 'Emergency').length})
            </button>
            <button
              type="button"
              onClick={() => setHazardFilter('Urgent')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                hazardFilter === 'Urgent'
                  ? 'bg-rose-900 text-white shadow-2xs'
                  : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              Urgent Priority Only ({hazardTickets.filter(t => t.priority === 'Urgent' || t.Urgency === 'Urgent').length})
            </button>
          </div>

          {/* Hazard Cards Grid */}
          {filteredHazards.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-2xs max-w-md mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-slate-900">Campus Facility Safe</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                No active critical hazard alerts match your current filter. All life-safety risks are managed.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredHazards.map((ticket) => (
                <div 
                  key={ticket.id}
                  onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
                  className="bg-white rounded-3xl p-5 border-2 border-rose-300/80 hover:border-rose-500 transition-all shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between space-y-4 group"
                >
                  <div>
                    {/* Header: Hazard Tag & Status */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-600 text-white tracking-wide">
                          <Flame className="w-3 h-3" />
                          <span>HAZARD</span>
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-900">
                          #{ticket.id}
                        </span>
                      </div>

                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                        {ticket.status}
                      </span>
                    </div>

                    {/* Image & Fault Summary */}
                    <div className="flex gap-3 mt-3">
                      {ticket.photo && (
                        <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 relative group-hover:scale-105 transition-transform">
                          <img src={ticket.photo} alt="Hazard photo" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-slate-900 group-hover:text-rose-700 transition-colors line-clamp-1">
                          {ticket.title}
                        </h4>
                        <p className="text-xs text-slate-600 line-clamp-2 mt-1 leading-relaxed">
                          {ticket.description}
                        </p>
                        {ticket.location && (
                          <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-2">
                            <MapPin className="w-3 h-3 text-rose-600 shrink-0" />
                            <span className="font-semibold text-slate-700">{ticket.location}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Assigned Tech */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Wrench className="w-3.5 h-3.5 text-slate-400" />
                      <span>Tech: <strong className="text-slate-800">{ticket.assignedTo || 'Unassigned'}</strong></span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
                        className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
                      >
                        <span>Dispatch / Review</span>
                        <ArrowRight className="w-3 h-3" />
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
      {/* TAB 5: SETTINGS & OPERATIONS CONFIGURATION                                */}
      {/* ========================================================================= */}
      {currentTab === 'settings' && (
        <div className="space-y-6 animate-slide-up max-w-4xl">
          {/* Header */}
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
              <SettingsIcon className="w-6 h-6 text-slate-800" />
              <span>Facilities Operations & System Settings</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Configure multimodal AI models, live Airtable sync credentials, and dual-approval facilities policies.
            </p>
          </div>

          {/* 1. Google Gemini AI Engine Configuration Card */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-2xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Google Gemini Multimodal AI Engine</h3>
                  <p className="text-xs text-slate-500">Auto-extracts priority, category, and location from fault photos.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestAi}
                disabled={testingAi}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors flex items-center gap-1.5"
              >
                {testingAi ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                <span>{testingAi ? 'Testing...' : 'Test AI Connection'}</span>
              </button>
            </div>

            <form onSubmit={handleSaveGemini} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-700">Google Gemini API Key</label>
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1"
                    >
                      {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showKey ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-slate-900 shadow-2xs"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Stored securely in your browser localStorage.</p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">Active Gemini Model</label>
                  <select
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 shadow-2xs cursor-pointer bg-white"
                  >
                    <option value="auto">Auto-detect (gemini-2.5-flash / 2.0-flash)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    <option value="gemini-1.5-flash-latest">Gemini 1.5 Flash Latest</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash (Legacy)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">Sequential multi-model fallback automatically active.</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-2xs transition-all"
                >
                  Save AI Configuration
                </button>
              </div>
            </form>
          </div>

          {/* 2. Live Airtable Database Sync Card */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-2xs">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Live Airtable Central Database</h3>
                  <p className="text-xs text-slate-500">Base ID: <code className="font-mono text-slate-800 font-bold">app32PCGpVp4lBamC</code> · Table: <code className="font-mono text-slate-800 font-bold">tblyhV3Zxyw2wWzww</code></p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  isAirtableConnected 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${isAirtableConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span>{isAirtableConnected ? 'Live Connected' : 'Local Storage Fallback'}</span>
                </span>

                <button
                  type="button"
                  onClick={handleSyncAirtable}
                  disabled={isSyncing}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSavePat} className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">Airtable Personal Access Token (PAT)</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={patInput}
                    onChange={(e) => setPatInput(e.target.value)}
                    placeholder="patXXXXXXXXXXXXXX..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-slate-900 shadow-2xs"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs border border-slate-300 transition-colors"
                  >
                    Update PAT
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* 3. Operational Policies Card */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-700" />
              <span>Campus Facilities & Dual-Approval Policies</span>
            </h3>

            <div className="space-y-3 divide-y divide-slate-100">
              <div className="flex items-center justify-between pt-2">
                <div>
                  <p className="text-xs font-bold text-slate-900">Admin Gated Registration</p>
                  <p className="text-[11px] text-slate-500">Require Administrator review before new user and technician accounts can access the system.</p>
                </div>
                <input
                  type="checkbox"
                  checked={policies.strictGating}
                  onChange={(e) => setPolicies({ ...policies, strictGating: e.target.checked })}
                  className="w-4 h-4 rounded text-slate-900 focus:ring-slate-900"
                />
              </div>

              <div className="flex items-center justify-between pt-3">
                <div>
                  <p className="text-xs font-bold text-slate-900">Two-Party Dual Confirmation</p>
                  <p className="text-[11px] text-slate-500">Work orders cannot be closed until reporting user confirms physical repair after technician marks fixed.</p>
                </div>
                <input
                  type="checkbox"
                  checked={policies.dualApproval}
                  onChange={(e) => setPolicies({ ...policies, dualApproval: e.target.checked })}
                  className="w-4 h-4 rounded text-slate-900 focus:ring-slate-900"
                />
              </div>

              <div className="flex items-center justify-between pt-3">
                <div>
                  <p className="text-xs font-bold text-slate-900">Emergency Hazard Auto-Escalation</p>
                  <p className="text-[11px] text-slate-500">Automatically flag high-voltage and pressurized water complaints with HAZARD status.</p>
                </div>
                <input
                  type="checkbox"
                  checked={policies.autoRouting}
                  onChange={(e) => setPolicies({ ...policies, autoRouting: e.target.checked })}
                  className="w-4 h-4 rounded text-slate-900 focus:ring-slate-900"
                />
              </div>
            </div>
          </div>

          {/* 4. Data Backup & Reset */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-700" />
              <span>Data Management & Maintenance</span>
            </h3>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExportJson}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-300 transition-colors flex items-center gap-2 shadow-2xs"
              >
                <Download className="w-4 h-4" />
                <span>Export All Tickets (JSON)</span>
              </button>

              <button
                type="button"
                onClick={handleResetData}
                className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-semibold border border-rose-200 transition-colors flex items-center gap-2 shadow-2xs"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reset Demo Sample Tickets</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
