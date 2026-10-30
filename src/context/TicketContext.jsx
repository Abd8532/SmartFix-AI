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
  const rawUrgency = ticket.urgency || ticket.Urgency || ticket.priority || 'Moderate';
  const urgency = rawUrgency === 'Emergency' ? 'Emergency' : rawUrgency === 'Urgent' ? 'Urgent' : rawUrgency === 'Routine' ? 'Routine' : 'Moderate';
  const location = ticket.location || ticket.Location || 'Campus Facilities';
  const createdAt = ticket.createdAt || ticket.CreatedAt || new Date().toISOString();
  const reporterId = ticket.reporterId || ticket.reportedBy?.id || 'usr_anonymous';
  const reporterName = ticket.reporterName || ticket.reportedBy?.name || 'Campus Reporter';
  const reporterEmail = ticket.reporterEmail || ticket.reportedBy?.email || 'reporter@campus.edu';

  const assignedTo = ticket.assignedTo || (category === 'Electrical' ? 'Electrical Tech' : category === 'Plumbing' ? 'Plumbing Tech' : category === 'HVAC' ? 'HVAC Specialist' : category === 'IT' ? 'IT Support Specialist' : 'General Maintenance');
  const assignedSpecialty = ticket.assignedSpecialty || category;
  const imagePayload = ticket.image || ticket.photo || ticket.imageUrl || ticket.Photo || ticket.Image || ticket.ImageUrl || null;
  const fileKey = ticket.fileKey || ticket.photoKey || ticket.FileKey || null;

  const ragTicketVolume = Number(ticket.ragTicketVolume || ticket.RagTicketVolume || 1);
  const priorityScore = ticket.priorityScore !== undefined ? Number(ticket.priorityScore) : (urgency === 'Emergency' ? 95 : urgency === 'Urgent' ? 70 : urgency === 'Moderate' ? 45 : 20);

  return {
    id: ticket.id,
    title,
    Title: title,
    description,
    Description: description,
    category,
    Category: category,
    assignedSpecialty,
    assignedTo,
    assignedTechId: ticket.assignedTechId || null,
    urgency,
    Urgency: urgency,
    priority: urgency === 'Emergency' ? 'Emergency' : urgency === 'Urgent' ? 'Urgent' : urgency === 'Moderate' ? 'Moderate' : 'Routine',
    priorityScore,
    ragTicketVolume,
    deviceHistoryLog: ticket.deviceHistoryLog || null,
    status,
    Status: status,
    location,
    Location: location,
    techConfirmed: isTechConfirmed,
    TechConfirmed: isTechConfirmed ? 'true' : 'false',
    userConfirmed: isUserConfirmed,
    UserConfirmed: isUserConfirmed ? 'true' : 'false',
    photo: imagePayload,
    image: imagePayload,
    imageUrl: imagePayload,
    fileKey,
    photoKey: fileKey,
    createdAt,
    updatedAt: ticket.updatedAt || ticket.UpdatedAt || createdAt,
    resolvedAt: ticket.resolvedAt || ticket.ResolvedAt || null,
    resolutionNotes: ticket.resolutionNotes || ticket.ResolutionNotes || null,
    rejectionReason: ticket.rejectionReason || ticket.RejectionReason || ticket.lastRejectionReason || null,
    reopenCount: ticket.reopenCount || 0,
    isHazard: Boolean(ticket.isHazard || urgency === 'Emergency'),
    isRecurring: Boolean(ticket.isRecurring || ragTicketVolume > 1),
    recurringFixSummary: ticket.recurringFixSummary || null,
    safetyPrecautions: ticket.safetyPrecautions || null,
    org_id: ticket.org_id || ticket.orgId || '',
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

// Client-side RAG location entity extractor
export function extractLocationEntityClient(text = '') {
  const lower = String(text).toLowerCase();
  const abMatch = lower.match(/\b(?:ab|block|building)\s*[-_]?\s*(\d+[a-z]?)(?:\s*(?:room|floor|fl|rm|lab)?\s*(\d+[a-z]?))?\b/);
  if (abMatch) {
    const blockNum = abMatch[1];
    const subUnit = abMatch[2];
    if (subUnit) {
      if (lower.includes('floor') || lower.includes('fl')) {
        return `AB ${blockNum.toUpperCase()} Floor ${subUnit.toUpperCase()}`;
      }
      return `AB ${blockNum.toUpperCase()} Room ${subUnit.toUpperCase()}`;
    }
    return `AB ${blockNum.toUpperCase()}`;
  }
  const rmMatch = lower.match(/\b(room|rm|lab|hall)\s*[-_]?\s*(\d+[a-z]?)\b/);
  if (rmMatch) return `${rmMatch[1].charAt(0).toUpperCase() + rmMatch[1].slice(1)} ${rmMatch[2].toUpperCase()}`;
  if (lower.includes('cafeteria')) return 'Cafeteria Kitchen';
  if (lower.includes('server room')) return 'Server Room';
  if (lower.includes('library')) return 'Carrow Library';
  if (lower.includes('keller science')) return 'Keller Science Center';
  return 'Campus Facilities';
}

// Client-side single-specialty department classifier
export function extractCategoryEntityClient(text = '') {
  const lower = String(text).toLowerCase();
  if (/(pipe|leak|sink|water|drain|toilet|tap|flood|faucet|sewage|spraying)/.test(lower)) return 'Plumbing';
  if (/(breaker|electric|spark|wire|switch|power|short|socket|light|fuse|voltage)/.test(lower)) return 'Electrical';
  if (/(ac|air condition|hvac|heater|cooling|chiller|ventilation|compressor)/.test(lower)) return 'HVAC';
  if (/(server|wifi|wi-fi|router|network|cable|lan|monitor|pc|computer|ethernet)/.test(lower)) return 'IT';
  return 'General';
}

// Client-side RAG volume and priority metrics engine
export function computePriorityMetricsClient(complaint = '', ragTicketVolume = 0) {
  const lower = String(complaint).toLowerCase();

  // 1. Base Criticality
  let baseScore = 15;
  let baseTier = 'Routine';
  let isHazard = false;

  if (/(live wire|spark|sparking|fire|burst pipe|active flood|flooding|emergency ward|medical equipment|server room cooling|server room power|gas leak|smoke|arc flash|shock)/.test(lower)) {
    baseScore = 55;
    baseTier = 'Urgent';
    isHazard = true;
  } else if (/(pipe leak|pipe leakage|water leak|water leakage|leakage|ac failure|hvac failure|chiller failure|classroom|lab|ab 12|wifi|wi-fi|network outage|main light|main lighting|breaker trip|power outage)/.test(lower)) {
    baseScore = 40;
    baseTier = 'Moderate';
    isHazard = false;
  } else if (/(single fixture|noisy fan|slow drain|door|lock|faucet|dripping|fan|drain|flush|switch|handle|outlet)/.test(lower)) {
    baseScore = 25;
    baseTier = 'Routine';
    isHazard = false;
  }

  // 2. RAG Volume Multiplier
  let volPts = 0;
  if (ragTicketVolume >= 3) volPts = 50;
  else if (ragTicketVolume === 2) volPts = 35;
  else if (ragTicketVolume === 1) volPts = 20;

  let totalScore = baseScore + volPts;
  const tiers = ['Routine', 'Moderate', 'Urgent', 'Emergency'];
  let urgency = 'Routine';

  if (totalScore >= 80) urgency = 'Emergency';
  else if (totalScore >= 55) urgency = 'Urgent';
  else if (totalScore >= 35) urgency = 'Moderate';
  else urgency = 'Routine';

  // Enforce tier bump & floors
  if (ragTicketVolume === 1) {
    const baseIdx = tiers.indexOf(baseTier);
    const bumpedTier = tiers[Math.min(tiers.length - 1, baseIdx + 1)];
    const currIdx = tiers.indexOf(urgency);
    const targetIdx = Math.max(currIdx, tiers.indexOf(bumpedTier));
    urgency = tiers[targetIdx];
    if (urgency === 'Moderate') totalScore = Math.max(totalScore, 35);
    else if (urgency === 'Urgent') totalScore = Math.max(totalScore, 55);
    else if (urgency === 'Emergency') totalScore = Math.max(totalScore, 80);
  } else if (ragTicketVolume === 2) {
    if (tiers.indexOf(urgency) < 2) {
      urgency = 'Urgent';
      totalScore = Math.max(totalScore, 55);
    }
  } else if (ragTicketVolume >= 3) {
    urgency = 'Emergency';
    totalScore = Math.max(totalScore, 90);
    isHazard = true;
  }

  if (urgency === 'Emergency') isHazard = true;
  const finalScore = Math.max(0, Math.min(100, totalScore));
  return { urgency, priorityScore: finalScore, isHazard };
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

  // Active tickets state - strictly scoped by organization ID and user ID to prevent cross-tenant/cross-user leaks
  const [tickets, setTickets] = useState(() => {
    try {
      const activeUserStr = localStorage.getItem('maintainx_current_user_v3');
      if (!activeUserStr) return [];
      const activeUser = JSON.parse(activeUserStr);
      if (!activeUser?.id || !activeUser?.org_id) return [];
      const scopedKey = `maintainx_tickets_${activeUser.org_id}_${activeUser.id}`;
      const saved = localStorage.getItem(scopedKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizeTicketRecord).filter(Boolean);
        }
      }
    } catch (e) {
      console.warn('Failed reading scoped tickets from storage:', e);
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
    if (!currentUser) return;

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
  }, [currentUser]);

  // Clear cached tickets immediately on account/organisation switch or logout (Phase 4 requirement 3)
  useEffect(() => {
    setTickets([]);
    setSelectedTicketId(null);
    try {
      localStorage.removeItem(STORAGE_KEYS.TICKETS);
      if (!currentUser) {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('maintainx_tickets_') || k === STORAGE_KEYS.TICKETS)) {
            localStorage.removeItem(k);
          }
        }
      }
    } catch {}

    if (currentUser) {
      setIsLoading(true);
      fetchTickets();
    }
  }, [currentUser?.id, currentUser?.org_id, fetchTickets]);

  // Initial fetch and continuous real-time polling
  useEffect(() => {
    if (currentUser) {
      fetchTickets();
      const interval = setInterval(fetchTickets, 3000);
      return () => clearInterval(interval);
    }
  }, [currentUser, fetchTickets]);

  // Persist tickets cache locally scoped by tenant and user ID
  useEffect(() => {
    if (currentUser?.id && currentUser?.org_id && tickets.length > 0) {
      try {
        const scopedKey = `maintainx_tickets_${currentUser.org_id}_${currentUser.id}`;
        localStorage.setItem(scopedKey, JSON.stringify(tickets));
      } catch (e) {
        console.warn('Failed saving tickets to scoped storage:', e);
      }
    }
  }, [tickets, currentUser?.id, currentUser?.org_id]);

  // Persist user tab
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.USER_TAB, userTab);
    } catch (e) {
      console.warn('Failed saving user tab:', e);
    }
  }, [userTab]);

  // Auth actions (Quick dev role switcher disabled in production)
  const loginAs = async (newRole, userDetails = null) => {
    if (import.meta.env.PROD) {
      console.warn('Quick role switching with default credentials is disabled in production builds.');
      return;
    }
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
    if (!currentUser) {
      throw new Error('Authentication required to submit maintenance request.');
    }

    try {
      const imgPayload = newTicketData.image || newTicketData.photo || newTicketData.imageUrl || null;
      const fileKey = newTicketData.fileKey || newTicketData.photoKey || null;

      const complaintText = newTicketData.complaint || newTicketData.description || newTicketData.title || '';
      const clientLocation = newTicketData.location || extractLocationEntityClient(complaintText);
      const clientCategory = newTicketData.category || extractCategoryEntityClient(complaintText);

      // Pre-calculate RAG volume from current state
      const matchingExisting = tickets.filter((t) => {
        const locLower = String(t.location || '').toLowerCase();
        const clientLocLower = clientLocation.toLowerCase();
        const locMatch = locLower.includes(clientLocLower) || clientLocLower.includes(locLower) ||
          (clientLocLower.includes('ab') && locLower.includes('ab'));
        const catMatch = String(t.category || '').toLowerCase() === clientCategory.toLowerCase();
        return locMatch && catMatch;
      });
      const clientRagVolume = matchingExisting.length;
      const clientMetrics = computePriorityMetricsClient(complaintText, clientRagVolume);

      let effectiveDescription = newTicketData.description || complaintText;
      if (clientRagVolume > 0 && !effectiveDescription.includes('[RAG ESCALATION')) {
        effectiveDescription = `[RAG ESCALATION - ${clientRagVolume + 1} REPORTS DETECTED]: Vector search found ${clientRagVolume} prior/active ticket(s) for this equipment at ${clientLocation}. Priority escalated to ${clientMetrics.urgency} (Score: ${clientMetrics.priorityScore}/100).\n\n${complaintText}`;
      }

      const payload = {
        complaint: complaintText,
        title: newTicketData.title || `${clientCategory} Issue at ${clientLocation}`,
        description: effectiveDescription,
        location: clientLocation,
        category: clientCategory,
        assignedSpecialty: clientCategory,
        urgency: clientMetrics.urgency,
        priority: clientMetrics.urgency,
        priorityScore: clientMetrics.priorityScore,
        ragTicketVolume: clientRagVolume + 1,
        image: imgPayload,
        photo: imgPayload,
        imageUrl: imgPayload,
        fileKey: fileKey,
        photoKey: fileKey,
        mimeType: newTicketData.mimeType || 'image/jpeg'
      };

      const data = await apiClient.tickets.create(payload);
      const returnedTicket = data.ticket || {};
      if (imgPayload && (!returnedTicket.image || returnedTicket.image.startsWith('uploads/'))) {
        returnedTicket.image = imgPayload;
        returnedTicket.photo = imgPayload;
        returnedTicket.imageUrl = imgPayload;
      }
      if (!returnedTicket.ragTicketVolume) {
        returnedTicket.ragTicketVolume = clientRagVolume + 1;
      }
      if (returnedTicket.priorityScore === undefined) {
        returnedTicket.priorityScore = clientMetrics.priorityScore;
      }
      if (!returnedTicket.assignedSpecialty) {
        returnedTicket.assignedSpecialty = clientCategory;
      }

      const created = normalizeTicketRecord(returnedTicket);
      setTickets((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);

      const volCount = created.ragTicketVolume || (clientRagVolume + 1);
      addToast({
        type: created.isHazard || created.priority === 'Emergency' ? 'warning' : 'success',
        title: `Work Order #${created.id} Dispatched!`,
        message: volCount > 1
          ? `📊 RAG Escalation Active (${volCount} reports): Routed to ${created.category} queue with ${created.priority} priority (Score: ${created.priorityScore}/100).`
          : `Ticket created and routed strictly to ${created.category} Specialist queue.`
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

  // 3. TECHNICIAN SIGN-OFF: Mark work as completed by technician (Contract: resolutionNotes + Optimistic Concurrency)
  const techCompleteTicket = async (ticketId, resolutionNotes = '') => {
    if (!currentUser) return;

    const target = tickets.find((t) => t.id === ticketId);
    try {
      const data = await apiClient.tickets.techComplete(ticketId, resolutionNotes, target?.version);
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
        title: err.status === 409 ? 'Concurrency Conflict' : 'Sign-off Failed',
        message: err.data?.error || err.message || 'Failed to record technician resolution.'
      });
      throw err;
    }
  };

  // 4. USER VERIFICATION: Confirm physical repair & complete ticket (triggers trusted RAG + Optimistic Concurrency)
  const verifyTicketClosure = async (ticketId) => {
    if (!currentUser) return;

    const target = tickets.find((t) => t.id === ticketId);
    try {
      const data = await apiClient.tickets.verifyClosure(ticketId, target?.version);
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
        title: err.status === 409 ? 'Concurrency Conflict' : 'Verification Failed',
        message: err.data?.error || err.message || 'Failed to complete ticket verification.'
      });
      throw err;
    }
  };

  // 5. USER REJECTION: Reject unsatisfactory repair & reopen ticket with reason (Contract: rejectionReason + Optimistic Concurrency)
  const rejectTicketClosure = async (ticketId, rejectionReason) => {
    if (!currentUser) return;

    if (!rejectionReason || !rejectionReason.trim()) {
      addToast({
        type: 'warning',
        title: 'Rejection Reason Required',
        message: 'Please provide details explaining why the repair is incomplete.'
      });
      throw new Error('Rejection reason is mandatory.');
    }

    const target = tickets.find((t) => t.id === ticketId);
    try {
      const data = await apiClient.tickets.rejectClosure(ticketId, rejectionReason.trim(), target?.version);
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
        title: err.status === 409 ? 'Concurrency Conflict' : 'Rejection Error',
        message: err.data?.error || err.message || 'Could not reject ticket.'
      });
      throw err;
    }
  };

  // 6. TECHNICIAN: CLAIM UNASSIGNED WORK ORDER (Atomic Optimistic Concurrency)
  const claimTicket = async (ticketId) => {
    if (!currentUser) return;

    const target = tickets.find((t) => t.id === ticketId);
    try {
      const data = await apiClient.tickets.claim(ticketId, target?.version);
      const updated = normalizeTicketRecord(data.ticket);
      setTickets((prev) => [updated, ...prev.filter((t) => t.id !== ticketId)]);

      addToast({
        type: 'success',
        title: 'Work Order Claimed',
        message: `You have successfully claimed ticket #${ticketId}.`
      });
      return updated;
    } catch (err) {
      console.error('claimTicket error:', err);
      addToast({
        type: 'error',
        title: err.status === 409 ? 'Claim Conflict' : 'Claim Failed',
        message: err.data?.error || err.message || 'Could not claim work order.'
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

  // 7. UPDATE STATUS: General status transitions using PATCH (Contract: PATCH /api/v1/tickets/:id/status + Optimistic Concurrency)
  const updateTicketStatus = async (ticketId, newStatus, resolutionNotes = '') => {
    if (!currentUser) return;

    // Backend state machine strictly blocks jumping directly to Completed
    if (newStatus === 'Done' || newStatus === 'Completed') {
      addToast({
        type: 'warning',
        title: 'Dual Approval Required',
        message: 'Tickets cannot be directly marked Completed. Both technician and user must sign off.'
      });
      return;
    }

    const target = tickets.find((t) => t.id === ticketId);
    try {
      const data = await apiClient.tickets.updateStatus(ticketId, newStatus, resolutionNotes, target?.version);
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
        title: err.status === 409 ? 'Concurrency Conflict' : 'Update Failed',
        message: err.data?.error || err.message || 'Failed to update ticket status.'
      });
    }
  };

  // 7. DELETE: Permanent ticket removal (Contract: DELETE /api/v1/tickets/:id)
  const deleteTicket = async (ticketId) => {
    if (!currentUser) return;

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
    if (!currentUser) return [];

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
    try {
      if (currentUser?.id && currentUser?.org_id) {
        localStorage.removeItem(`maintainx_tickets_${currentUser.org_id}_${currentUser.id}`);
      }
      localStorage.removeItem(STORAGE_KEYS.TICKETS);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('maintainx_tickets_') || k === STORAGE_KEYS.TICKETS)) {
          localStorage.removeItem(k);
        }
      }
    } catch {}
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
    const open = tickets.filter((t) => t.status !== 'Done' && t.status !== 'Completed' && t.Status !== 'Completed').length;
    const inProgress = tickets.filter((t) => 
      t.status === 'In Progress' || 
      t.status === 'Pending User Verification' || 
      t.status === 'Awaiting Tech Sign-off' ||
      t.Status === 'Pending User Verification' ||
      t.Status === 'Awaiting Tech Sign-off'
    ).length;
    const done = tickets.filter((t) => t.status === 'Done' || t.status === 'Completed' || t.Status === 'Completed').length;
    const critical = tickets.filter((t) => (t.priority === 'Critical' || t.priority === 'Emergency' || t.Urgency === 'Emergency' || t.isHazard) && t.status !== 'Done' && t.status !== 'Completed' && t.Status !== 'Completed').length;
    const resolutionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    // Filter tickets raised by / belonging to current user from central database
    const userTickets = tickets.filter((t) => isUserTicket(t, currentUser));
    const userOpenCount = userTickets.filter((t) => 
      t.status !== 'Done' && t.status !== 'Completed' && t.Status !== 'Completed'
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
    claimTicket,
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
