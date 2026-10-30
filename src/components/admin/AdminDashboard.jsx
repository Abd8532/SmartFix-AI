import React, { useState, useMemo, useEffect } from 'react';
import { useTickets } from '../../context/TicketContext';
import { useAuth } from '../../context/AuthContext';
import WorkspaceSidebar from '../common/WorkspaceSidebar';
import DashboardHeroBanner from '../common/DashboardHeroBanner';
import NeetCodeTicketTable from '../tickets/NeetCodeTicketTable';
import { 
  ShieldCheck, 
  Search, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Users, 
  UserCheck, 
  UserX, 
  RefreshCw, 
  Download, 
  Check, 
  ShieldAlert, 
  Lock, 
  Unlock, 
  Settings as SettingsIcon,
  Flame,
  FileText
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function AdminDashboard({ onSelectTicket, activeTab = 'overview', setActiveTab }) {
  const { 
    tickets, 
    updateTicketStatus, 
    deleteTicket, 
    stats, 
    addToast,
    fetchTickets,
    fetchAuditLogs,
    verifyTicketClosure
  } = useTickets();

  const { 
    users = [], 
    pendingUsers = [], 
    approvedUsers = [], 
    approveUser, 
    rejectUser, 
    allowAdminSignup, 
    toggleAdminSignup 
  } = useAuth();

  const [internalTab, setInternalTab] = useState(activeTab);
  const currentTab = activeTab || internalTab;

  useEffect(() => {
    setInternalTab(activeTab);
  }, [activeTab]);

  const handleTabChange = (tabKey) => {
    setInternalTab(tabKey);
    if (setActiveTab) setActiveTab(tabKey);
  };

  const handleAdminSignupToggle = async (e) => {
    const nextVal = e.target.checked;
    await toggleAdminSignup(nextVal);
    if (!nextVal) {
      addToast({
        type: 'warning',
        title: 'Security Setting Updated',
        message: 'Admin registration locked for outside users'
      });
    } else {
      addToast({
        type: 'success',
        title: 'Security Setting Updated',
        message: 'Admin registration enabled for new administrators'
      });
    }
  };

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeFeatureFilter, setActiveFeatureFilter] = useState('all');

  // Audit Trail State
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const loadAuditLogs = async () => {
    if (typeof fetchAuditLogs === 'function') {
      setLoadingAudit(true);
      try {
        const logs = await fetchAuditLogs();
        setAuditLogs(logs || []);
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

  const handleExportAuditJson = () => {
    const jsonStr = JSON.stringify(auditLogs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Operational Policies State
  const [policies, setPolicies] = useState({
    strictGating: true,
    dualApproval: true,
    autoRouting: true
  });

  // Calculate Global Admin KPIs
  const adminStats = useMemo(() => {
    let resolved = 0;
    let open = 0;
    let urgent = 0;

    tickets.forEach((t) => {
      const isDone = t.status === 'Completed' || t.status === 'Done' || t.status === 'Resolved';
      if (isDone) resolved++;
      else open++;

      const p = (t.priority || t.urgency || '').toLowerCase();
      if (p === 'urgent' || p === 'emergency' || p === 'critical' || p === 'moderate') {
        urgent++;
      }
    });

    return {
      resolvedCount: resolved,
      openCount: open,
      escalatedCount: urgent,
      total: tickets.length,
      activeCount: open
    };
  }, [tickets]);

  // Filtered tickets according to tab, search query, category, and feature cards
  const displayedTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Hazards tab filter
      if (currentTab === 'hazards') {
        const p = (t.priority || t.urgency || '').toLowerCase();
        if (p !== 'emergency' && p !== 'critical' && !t.isHazard) return false;
      }

      // Category filter
      if (selectedCategory !== 'All') {
        const cat = (t.category || '').toLowerCase();
        if (cat !== selectedCategory.toLowerCase()) return false;
      }

      // Feature filter
      if (activeFeatureFilter === 'urgent') {
        const p = (t.priority || t.urgency || '').toLowerCase();
        if (p !== 'urgent' && p !== 'emergency' && p !== 'critical') return false;
      } else if (activeFeatureFilter === 'rag-history') {
        if (!t.ragTicketVolume || Number(t.ragTicketVolume) < 2) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const idMatch = String(t.id || '').toLowerCase().includes(q.replace('#', ''));
        const titleMatch = String(t.title || t.complaint || '').toLowerCase().includes(q);
        const locMatch = String(t.location || '').toLowerCase().includes(q);
        const catMatch = String(t.category || '').toLowerCase().includes(q);
        if (!idMatch && !titleMatch && !locMatch && !catMatch) return false;
      }

      return true;
    });
  }, [tickets, currentTab, selectedCategory, activeFeatureFilter, searchQuery]);

  // Admin completion toggle
  const handleToggleComplete = async (ticket) => {
    if (ticket.status === 'Completed' || ticket.status === 'Done') {
      addToast({
        type: 'info',
        title: 'Already Resolved',
        message: 'This ticket is already closed and dual-verified.'
      });
      return;
    }

    try {
      await updateTicketStatus(ticket.id, 'Completed');
      addToast({
        type: 'success',
        title: 'Status Updated',
        message: `Ticket #${ticket.id} marked as Completed by Administrator.`
      });
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Update Error',
        message: e?.message || 'Failed to update ticket.'
      });
    }
  };

  const handleDeleteTicket = async (ticketId) => {
    try {
      await deleteTicket(ticketId);
      addToast({
        type: 'success',
        title: 'Ticket Deleted',
        message: `Ticket #${ticketId} purged from database.`
      });
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Delete Failed',
        message: e?.message || 'Failed to delete ticket.'
      });
    }
  };

  const handleApprove = async (userId) => {
    try {
      await approveUser(userId);
      confetti({ particleCount: 30, spread: 50, origin: { y: 0.6 } });
      addToast({
        type: 'success',
        title: 'User Approved',
        message: 'User account unlocked and granted access.'
      });
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Approval Error',
        message: e?.message || 'Failed to approve user.'
      });
    }
  };

  const handleReject = async (userId) => {
    try {
      await rejectUser(userId);
      addToast({
        type: 'warning',
        title: 'User Rejected',
        message: 'User account registration rejected.'
      });
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Rejection Error',
        message: e?.message || 'Failed to reject user.'
      });
    }
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* 1. Left Sidebar (lg:col-span-3 xl:col-span-2) */}
      <div className="lg:col-span-3 xl:col-span-2">
        <WorkspaceSidebar
          currentView={currentTab}
          onSelectView={handleTabChange}
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => setSelectedCategory(cat)}
          role="admin"
          stats={adminStats}
        />
      </div>

      {/* 2. Center Main Content (lg:col-span-9 xl:col-span-10) */}
      <main className="lg:col-span-9 xl:col-span-10 min-w-0 space-y-6">
        {/* Top Category Feature Cards, Hero Banner Card, Search Toolbar */}
        <DashboardHeroBanner
          title="Campus Control"
          subtitle="Authoritative multi-tenant governance, RAG vector memory, and identity security."
          stats={adminStats}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={fetchTickets}
          activeFeatureFilter={activeFeatureFilter}
          onFeatureCardClick={(filter) => {
            setActiveFeatureFilter((prev) => (prev === filter ? 'all' : filter));
          }}
        />

        {/* TAB CONTENT */}

        {/* TAB: OVERVIEW / REQUESTS / HAZARDS (Ticket Table) */}
        {(currentTab === 'overview' || currentTab === 'requests' || currentTab === 'hazards') && (
          <NeetCodeTicketTable
            tickets={displayedTickets}
            onSelectTicket={onSelectTicket}
            onToggleComplete={handleToggleComplete}
            onDeleteTicket={handleDeleteTicket}
            role="admin"
            emptyMessage={
              currentTab === 'hazards'
                ? 'No active life-safety hazards or critical emergencies.'
                : 'No campus tickets match your search filters.'
            }
          />
        )}

        {/* TAB: USER APPROVALS */}
        {currentTab === 'approvals' && (
          <div className="space-y-4">
            <div className="bg-[#1c1c21] border border-[#2a2a32] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">Pending Approval Queue</h3>
                </div>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {pendingUsers.length} Pending
                </span>
              </div>

              {pendingUsers.length === 0 ? (
                <p className="text-xs text-zinc-500 py-6 text-center">
                  All user registrations have been verified and approved.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {pendingUsers.map((u) => (
                    <div
                      key={u.id}
                      className="bg-[#24242b] border border-[#32323b] rounded-lg p-3.5 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">{u.name}</span>
                          <span className="text-[10px] text-indigo-400 font-mono bg-[#1c1c21] px-1.5 py-0.2 rounded border border-[#32323b]">
                            {u.role?.toUpperCase()}
                          </span>
                          {u.specialty && (
                            <span className="text-[10px] text-amber-400 font-medium bg-amber-500/10 px-1.5 py-0.2 rounded">
                              {u.specialty}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{u.email}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleApprove(u.id)}
                          className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(u.id)}
                          className="h-8 px-3 rounded-lg bg-[#1c1c21] hover:bg-rose-500/20 text-rose-400 border border-[#32323b] hover:border-rose-500/30 text-xs font-medium flex items-center gap-1.5 transition"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Approved Users List */}
            <div className="bg-[#1c1c21] border border-[#2a2a32] rounded-xl p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
                Active Campus Personnel ({approvedUsers.length})
              </h3>
              <div className="divide-y divide-[#24242c] text-xs">
                {approvedUsers.slice(0, 10).map((u) => (
                  <div key={u.id} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-zinc-200 font-medium">{u.name}</span>
                      <span className="text-zinc-500 text-[11px] font-mono">({u.email})</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 uppercase font-mono">{u.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: AUDIT LOGS */}
        {currentTab === 'audit' && (
          <div className="bg-[#1c1c21] border border-[#2a2a32] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#2a2a32] flex items-center justify-between bg-[#18181c]">
              <div>
                <h3 className="text-sm font-bold text-white">Immutable Security Audit Trail</h3>
                <p className="text-xs text-zinc-400 mt-0.5">{auditLogs.length} verified operations recorded</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadAuditLogs}
                  disabled={loadingAudit}
                  className="h-8 px-3 rounded-lg bg-[#24242b] hover:bg-[#2e2e38] text-zinc-200 border border-[#32323b] text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportAuditJson}
                  className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#18181c] text-zinc-400 border-b border-[#2a2a32] text-[11px] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Actor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#24242c]">
                  {auditLogs.slice(0, 50).map((log) => (
                    <tr key={log.id} className="hover:bg-[#23232a] transition-colors">
                      <td className="px-4 py-3 text-zinc-500 font-mono text-[11px]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-3 font-semibold text-zinc-200">
                        {log.action}
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-400">
                        {log.target_id || log.ticket_id || '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        <span>{log.actor_email || log.actor_id}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: SETTINGS (Dynamic Admin Signup Toggle & Security Policy) */}
        {currentTab === 'settings' && (
          <div className="space-y-4">
            {/* System & Security Settings Panel with allowAdminSignup Toggle */}
            <div className="bg-[#1c1c21] border border-[#2a2a32] rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#2a2a32]">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                    allowAdminSignup
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>System & Security Settings</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        allowAdminSignup
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      }`}>
                        {allowAdminSignup ? 'Admin Sign-Up Open' : 'Admin Sign-Up Locked'}
                      </span>
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Control account provisioning gates and external registration access.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#24242b] border border-[#32323b] text-xs font-medium text-zinc-300">
                  {allowAdminSignup ? (
                    <>
                      <Unlock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Registration: Open</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Registration: Locked</span>
                    </>
                  )}
                </div>
              </div>

              {/* Interactive Toggle Switch Row */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-[#24242b] border border-[#32323b]">
                <div className="pr-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-indigo-400" />
                    <label
                      htmlFor="admin-signup-settings-toggle"
                      className="text-xs font-bold text-white cursor-pointer"
                    >
                      Allow New Administrator Sign-Ups
                    </label>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    When enabled, prospective administrators can register directly via the portal. When disabled, the Admin tab on the sign-up view is locked and requests are strictly blocked.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      id="admin-signup-settings-toggle"
                      type="checkbox"
                      checked={Boolean(allowAdminSignup)}
                      onChange={handleAdminSignupToggle}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[#18181c] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-400 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Campus Facilities Policies */}
            <div className="bg-[#1c1c21] border border-[#2a2a32] rounded-xl p-5 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>Campus Facilities Operational Governance</span>
              </h3>

              <div className="space-y-3 divide-y divide-[#24242c]">
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <p className="text-xs font-bold text-white">Admin Gated Registration</p>
                    <p className="text-xs text-zinc-400">Require Administrator review before accounts can access the dispatch queue.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={policies.strictGating}
                    onChange={(e) => setPolicies({ ...policies, strictGating: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-600 bg-[#24242b] border-[#32323b]"
                  />
                </div>

                <div className="flex items-center justify-between pt-3">
                  <div>
                    <p className="text-xs font-bold text-white">Dual-Party Confirmation</p>
                    <p className="text-xs text-zinc-400">Require both technician signoff and campus resident closure before ticket completes.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={policies.dualApproval}
                    onChange={(e) => setPolicies({ ...policies, dualApproval: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-600 bg-[#24242b] border-[#32323b]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
