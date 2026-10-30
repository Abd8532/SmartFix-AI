import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';
import apiClient from '../services/apiClient';

const TicketContext = createContext(null);

const STORAGE_KEYS = {
  TICKETS: 'maintainx_tickets_v1',
  CURRENT_ROLE: 'maintainx_role_v1',
  USER_TAB: 'maintainx_user_tab_v1'
};

// Formats backend ticket record for frontend UI compatibility
function normalizeTicketRecord(ticket) {
  if (!ticket) return null;

  const rawStatus = ticket.status || ticket.Status || 'Assigned';
  let status = rawStatus;
  if (rawStatus === 'Open') status = 'Assigned';
  if (rawStatus === 'Done') status = 'Completed';

  const isTechConfirmed = Boolean(ticket.techConfirmed || ticket.TechConfirmed === true || ticket.TechConfirmed === 'true');
  const isUserConfirmed = Boolean(ticket.userConfirmed || ticket.UserConfirmed === true || ticket.UserConfirmed === 'true');

  const title = ticket.title || ticket.Title || 'Maintenance Request';
  const description = ticket.description || ticket.Description || '';
  const category = ticket.category || ticket.Category || 'General';
  const urgency = ticket.urgency || ticket.Urgency || ticket.priority || 'Moderate';
  const location = ticket.location || ticket.Location || 'Campus Facilities';
  const createdAt = ticket.createdAt || ticket.CreatedAt || new Date().toISOString();
  const reporterId = ticket.reporterId || ticket.reportedBy?.id || 'usr_anonymous';
  const reporterName = ticket.reporterName || ticket.reportedBy?.name || 'Campus Reporter';
  const reporterEmail = ticket.reporterEmail || ticket.reportedBy?.email || 'reporter@campus.edu';

  return {
    id: ticket.id,
    title,
    Title: title,
    description,
    Description: description,
    category,
    Category: category,
    urgency,
    Urgency: urgency,
    priority: urgency === 'Emergency' ? 'Emergency' : urgency === 'Urgent' ? 'Urgent' : 'Routine',
    priorityScore: ticket.priorityScore ?? (urgency === 'Emergency' ? 95 : urgency === 'Urgent' ? 70 : 40),
    status,
    Status: status,
    location,
    Location: location,
    techConfirmed: isTechConfirmed,
    TechConfirmed: isTechConfirmed ? 'true' : 'false',
    userConfirmed: isUserConfirmed,
    UserConfirmed: isUserConfirmed ? 'true' : 'false',
    assignedTo: ticket.assignedTo || (category === 'Electrical' ? 'Electrical Tech' : category === 'Plumbing' ? 'Plumbing Tech' : 'General Maintenance'),
    assignedTechId: ticket.assignedTechId || null,
    photo: ticket.photo || ticket.Photo || null,
    createdAt,
    updatedAt: ticket.updatedAt || ticket.UpdatedAt || createdAt,
    resolvedAt: ticket.resolvedAt || ticket.ResolvedAt || null,
    resolutionNotes: ticket.resolutionNotes || ticket.ResolutionNotes || null,
    rejectionReason: ticket.rejectionReason || ticket.RejectionReason || ticket.lastRejectionReason || null,
    reopenCount: ticket.reopenCount || 0,
    isHazard: Boolean(ticket.isHazard),
    isRecurring: Boolean(ticket.isRecurring),
    recurringFixSummary: ticket.recurringFixSummary || null,
    safetyPrecautions: ticket.safetyPrecautions || null,
    org_id: ticket.org_id || 'org_campus_main',
    reportedBy: {
      id: reporterId,
      name: reporterName,
      email: reporterEmail,
      role: ticket.reportedBy?.role || 'User',
      avatar: ticket.reportedBy?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'
    },
    reporterId,
    reporterEmail,
    reporterName
  };
}

// User Ticket Matching Helper to dynamically connect tickets from database to active user
export function isUserTicket(ticket, user) {
  if (!ticket || !user) return false;

  // 1. Direct ID match
  if (ticket.reporterId && (ticket.reporterId === user.id || ticket.reporterId === user.email)) return true;
  if (ticket.reportedBy?.id && (ticket.reportedBy.id === user.id || ticket.reportedBy.id === user.email)) return true;

  // 2. Normalized Email match
  const userEmail = (user.email || '').trim().toLowerCase();
  if (userEmail) {
    if (ticket.reporterEmail && ticket.reporterEmail.trim().toLowerCase() === userEmail) return true;
    if (ticket.reportedBy?.email && ticket.reportedBy.email.trim().toLowerCase() === userEmail) return true;
    if (ticket.ReporterEmail && String(ticket.ReporterEmail).trim().toLowerCase() === userEmail) return true;
    if (ticket.Email && String(ticket.Email).trim().toLowerCase() === userEmail) return true;
    if (ticket.reporterId && String(ticket.reporterId).trim().toLowerCase() === userEmail) return true;
  }

  // 3. Name match (case-insensitive)
  const userName = (user.name || '').trim().toLowerCase();
  if (userName && userName !== 'user' && userName !== 'campus user') {
    if (ticket.reporterName && ticket.reporterName.trim().toLowerCase() === userName) return true;
    if (ticket.reportedBy?.name && ticket.reportedBy.name.trim().toLowerCase() === userName) return true;
    if (ticket.ReporterName && String(ticket.ReporterName).trim().toLowerCase() === userName) return true;
  }

  return false;
}

export function TicketProvider({ children }) {
  const auth = useAuth();
  const token = auth?.token || null;
  const role = auth?.currentUser?.approvalStatus === 'Approved' ? auth.currentUser.role : null;
  const currentUser = auth?.currentUser || null;

  const [isLoading, setIsLoading] = useState(false);

  // Tab state for User Role: 'new-issue' | 'my-tickets'
  const [userTab, setUserTab] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.USER_TAB) || 'new-issue';
    } catch {
      return 'new-issue';
    }
  });

  // Active tickets state
  const [tickets, setTickets] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TICKETS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizeTicketRecord).filter(Boolean);
        }
      }
    } catch (e) {
      console.warn('Failed reading tickets from storage:', e);
    }
    return [];
  });

  // Toast notification system
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    const newToast = {
      id,
      type: toast.type || 'info', // 'success' | 'error' | 'warning' | 'info'
      title: toast.title,
      message: toast.message,
      duration: toast.duration || 3500
    };
    setToasts((prev) => [...prev.slice(-2), newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, newToast.duration);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // 1. READ: Fetch isolated tickets from authoritative Python backend
  const fetchTickets = useCallback(async () => {
    if (!token) return;

    try {
      const data = await apiClient.tickets.list();
      if (Array.isArray(data.tickets)) {
        const normalized = data.tickets.map(normalizeTicketRecord).filter(Boolean);
        setTickets(normalized);
      }
    } catch (error) {
      if (error.status !== 401) {
        console.warn('Backend tickets sync error:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Initial fetch and continuous real-time polling
  useEffect(() => {
    if (token) {
      fetchTickets();
      const interval = setInterval(fetchTickets, 3000);
      return () => clearInterval(interval);
    }
  }, [token, fetchTickets]);

  // Persist tickets cache locally for smooth reloads
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(tickets));
    } catch (e) {
      console.warn('Failed saving tickets to storage:', e);
    }
  }, [tickets]);

  // Persist user tab
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.USER_TAB, userTab);
    } catch (e) {
      console.warn('Failed saving user tab:', e);
    }
  }, [userTab]);

  // Auth actions
  const loginAs = async (newRole, userDetails = null) => {
    if (auth?.login) {
      const targetRole = typeof newRole === 'string' ? newRole : (userDetails?.role || 'user');
      const email = typeof newRole === 'string' 
        ? (newRole === 'admin' ? 'admin@campus.edu' : newRole === 'technician' ? 'tech@campus.edu' : 'alex@campus.edu')
        : (userDetails?.email || 'alex@campus.edu');
      await auth.login(email, targetRole === 'admin' ? 'admin123' : 'password123', targetRole);
    }
  };

  const logout = () => {
    if (auth?.logout) auth.logout();
    addToast({
      type: 'info',
      title: 'Logged Out',
      message: 'You have returned to the login screen.'
    });
  };

  // 2. CREATE: Submit new issue to authoritative backend API via apiClient
  const addTicket = async (newTicketData) => {
    if (!token) {
      throw new Error('Authentication required to submit maintenance request.');
    }

    try {
      const payload = {
        complaint: newTicketData.complaint || newTicketData.description || newTicketData.title || '',
        title: newTicketData.title,
        description: newTicketData.description,
        location: newTicketData.location,
        category: newTicketData.category,
        urgency: newTicketData.urgency || newTicketData.priority,
        image: newTicketData.photo || newTicketData.image || null,
        mimeType: newTicketData.mimeType || 'image/jpeg'
      };

      const data = await apiClient.tickets.create(payload);
      const created = normalizeTicketRecord(data.ticket);
      setTickets((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);

      addToast({
        type: 'success',
        title: `Work Order #${created.id} Dispatched!`,
        message: created.isHazard
          ? 'EMERGENCY: Safety-critical priority auto-assigned.'
          : 'Ticket created and routed to specialized department queue.'
      });

      return created;
    } catch (err) {
      console.error('Failed to create ticket on backend:', err);
      addToast({
        type: 'error',
        title: 'Submission Error',
        message: err.data?.error || err.message || 'Could not dispatch work order to backend.'
      });
      throw err;
    }
  };

  const createTicket = addTicket;

  // 3. TECHNICIAN SIGN-OFF: Mark work as completed by technician (Contract: resolutionNotes)
  const techCompleteTicket = async (ticketId, resolutionNotes = '') => {
    if (!token) return;

    try {
      const data = await apiClient.tickets.techComplete(ticketId, resolutionNotes);
      const updated = normalizeTicketRecord(data.ticket);
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? updated : t)));

      addToast({
        type: 'info',
        title: 'Repair Sign-off Recorded',
        message: 'Ticket sent to reporting consumer for final verification.'
      });
      return updated;
    } catch (err) {
      console.error('techCompleteTicket error:', err);
      addToast({
        type: 'error',
        title: 'Sign-off Failed',
        message: err.data?.error || err.message || 'Failed to record technician resolution.'
      });
      throw err;
    }
  };

  // 4. USER VERIFICATION: Confirm physical repair & complete ticket (triggers trusted RAG)
  const verifyTicketClosure = async (ticketId) => {
    if (!token) return;

    try {
      const data = await apiClient.tickets.verifyClosure(ticketId);
      const updated = normalizeTicketRecord(data.ticket);
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? updated : t)));

      addToast({
        type: 'success',
        title: 'Ticket Completed ✓',
        message: 'Both parties confirmed repair. Resolution archived to trusted knowledge base.'
      });
      return updated;
    } catch (err) {
      console.error('verifyTicketClosure error:', err);
      addToast({
        type: 'error',
        title: 'Verification Failed',
        message: err.data?.error || err.message || 'Failed to complete ticket verification.'
      });
      throw err;
    }
  };

  // 5. USER REJECTION: Reject unsatisfactory repair & reopen ticket with reason (Contract: rejectionReason)
  const rejectTicketClosure = async (ticketId, rejectionReason) => {
    if (!token) return;

    if (!rejectionReason || !rejectionReason.trim()) {
      addToast({
        type: 'warning',
        title: 'Rejection Reason Required',
        message: 'Please provide details explaining why the repair is incomplete.'
      });
      throw new Error('Rejection reason is mandatory.');
    }

    try {
      const data = await apiClient.tickets.rejectClosure(ticketId, rejectionReason.trim());
      const updated = normalizeTicketRecord(data.ticket);
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? updated : t)));

      addToast({
        type: 'warning',
        title: 'Ticket Reopened',
        message: 'Rejection recorded. Ticket returned to In Progress for technician review.'
      });
      return updated;
    } catch (err) {
      console.error('rejectTicketClosure error:', err);
      addToast({
        type: 'error',
        title: 'Rejection Error',
        message: err.data?.error || err.message || 'Could not reject ticket.'
      });
      throw err;
    }
  };

  // Dual-Approval compatibility wrapper for existing component calls
  const handleTicketClosure = async (ticketId, closureRole, resolutionNotes = '') => {
    if (closureRole === 'technician') {
      return await techCompleteTicket(ticketId, resolutionNotes);
    } else if (closureRole === 'user') {
      return await verifyTicketClosure(ticketId);
    }
  };

  // 6. UPDATE STATUS: General status transitions using PATCH (Contract: PATCH /api/v1/tickets/:id/status)
  const updateTicketStatus = async (ticketId, newStatus, resolutionNotes = '') => {
    if (!token) return;

    // Backend state machine strictly blocks jumping directly to Completed
    if (newStatus === 'Done' || newStatus === 'Completed') {
      addToast({
        type: 'warning',
        title: 'Dual Approval Required',
        message: 'Tickets cannot be directly marked Completed. Both technician and user must sign off.'
      });
      return;
    }

    try {
      const data = await apiClient.tickets.updateStatus(ticketId, newStatus, resolutionNotes);
      const updated = normalizeTicketRecord(data.ticket);
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? updated : t)));

      addToast({
        type: 'info',
        title: 'Status Updated',
        message: `Ticket marked as ${newStatus}.`
      });
      return updated;
    } catch (err) {
      console.error('updateTicketStatus error:', err);
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: err.data?.error || err.message || 'Failed to update ticket status.'
      });
    }
  };

  // 7. DELETE: Permanent ticket removal (Contract: DELETE /api/v1/tickets/:id)
  const deleteTicket = async (ticketId) => {
    if (!token) return;

    try {
      await apiClient.tickets.delete(ticketId);
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));

      addToast({
        type: 'warning',
        title: 'Ticket Deleted',
        message: `Ticket #${ticketId} was permanently removed.`
      });
    } catch (err) {
      console.error('deleteTicket error:', err);
      addToast({
        type: 'error',
        title: 'Delete Failed',
        message: err.data?.error || err.message || 'Could not delete ticket.'
      });
    }
  };

  // 8. AUDIT LOGS: Retrieve immutable audit trail (Contract: consistent auditLogs field)
  const fetchAuditLogs = async () => {
    if (!token) return [];

    try {
      const data = await apiClient.admin.getAuditLogs();
      return data.auditLogs || data.audit_logs || [];
    } catch (err) {
      console.warn('fetchAuditLogs error:', err);
      return [];
    }
  };

  const resetMockData = () => {
    setTickets([]);
    localStorage.removeItem(STORAGE_KEYS.TICKETS);
    addToast({
      type: 'info',
      title: 'Database Reset',
      message: 'All local maintenance tickets have been cleared.'
    });
  };

  // Selected ticket for modal viewing
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const selectedTicket = useMemo(() => {
    return tickets.find((t) => t.id === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

  // Computed metrics
  const stats = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => t.status === 'Open' || t.status === 'Assigned' || t.Status === 'Assigned').length;
    const inProgress = tickets.filter((t) => 
      t.status === 'In Progress' || 
      t.status === 'Pending User Verification' || 
      t.status === 'Awaiting Tech Sign-off' ||
      t.Status === 'Pending User Verification' ||
      t.Status === 'Awaiting Tech Sign-off'
    ).length;
    const done = tickets.filter((t) => t.status === 'Done' || t.status === 'Completed' || t.Status === 'Completed').length;
    const critical = tickets.filter((t) => (t.priority === 'Critical' || t.priority === 'Emergency' || t.Urgency === 'Emergency' || t.isHazard) && t.status !== 'Done' && t.status !== 'Completed').length;
    const resolutionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    // Filter tickets raised by / belonging to current user from central database
    const userTickets = tickets.filter((t) => isUserTicket(t, currentUser));
    const userOpenCount = userTickets.filter((t) => 
      t.status === 'Open' || t.status === 'Assigned' || t.Status === 'Assigned' ||
      t.status === 'In Progress' || t.status === 'Pending User Verification' || t.status === 'Awaiting Tech Sign-off' ||
      t.Status === 'Pending User Verification' || t.Status === 'Awaiting Tech Sign-off'
    ).length;
    const userResolvedCount = userTickets.filter((t) => 
      t.status === 'Done' || t.status === 'Completed' || t.Status === 'Completed'
    ).length;

    return {
      total,
      open,
      inProgress,
      done,
      critical,
      resolutionRate,
      userTickets,
      userTicketsCount: userTickets.length,
      userOpenCount,
      userResolvedCount
    };
  }, [tickets, currentUser]);

  const value = {
    role,
    currentUser,
    userTab,
    setUserTab,
    tickets,
    isLoading,
    fetchTickets,
    stats,
    toasts,
    addToast,
    removeToast,
    loginAs,
    logout,
    addTicket,
    createTicket,
    techCompleteTicket,
    verifyTicketClosure,
    rejectTicketClosure,
    handleTicketClosure,
    updateTicketStatus,
    deleteTicket,
    fetchAuditLogs,
    resetMockData,
    selectedTicket,
    setSelectedTicketId,
    // Delegated from AuthContext
    users: auth?.users || [],
    pendingUsers: auth?.pendingUsers || [],
    approveUser: auth?.approveUser,
    rejectUser: auth?.rejectUser
  };

  return <TicketContext.Provider value={value}>{children}</TicketContext.Provider>;
}

// Hook exports
export const useTicketContext = () => {
  const context = useContext(TicketContext);
  if (!context) {
    throw new Error('useTicketContext must be used within a TicketProvider');
  }
  return context;
};

export const useTickets = () => {
  const context = useContext(TicketContext);
  if (!context) {
    throw new Error('useTickets must be used within a TicketProvider');
  }
  return context;
};
