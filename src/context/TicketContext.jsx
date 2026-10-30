import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { INITIAL_TICKETS } from '../types/mockData';
import { useAuth } from './AuthContext';

const TicketContext = createContext(null);

// Your exact Airtable endpoint
const AIRTABLE_BASE_ID = 'app32PCGpVp4lBamC';
const AIRTABLE_TABLE_ID = 'tblyhV3Zxyw2wWzww';
const AIRTABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`;

const STORAGE_KEYS = {
  TICKETS: 'maintainx_tickets_v1',
  CURRENT_ROLE: 'maintainx_role_v1',
  USER_TAB: 'maintainx_user_tab_v1',
  AIRTABLE_PAT: 'maintainx_airtable_pat_v1'
};

// Formats an Airtable record into frontend state format while keeping Airtable field keys accessible
function formatAirtableRecord(record) {
  const fields = record.fields || {};
  const isTechConfirmed = fields.TechConfirmed === 'true' || fields.TechConfirmed === true || fields.techConfirmed === true;
  const isUserConfirmed = fields.UserConfirmed === 'true' || fields.UserConfirmed === true || fields.userConfirmed === true;

  const rawStatus = fields.Status || fields.status || 'Assigned';
  let status = rawStatus;
  if (rawStatus === 'Open') status = 'Assigned';
  if (rawStatus === 'Done') status = 'Completed';

  // Photo can be an attachment array from Airtable or direct url string
  let photoUrl = null;
  if (Array.isArray(fields.Photo) && fields.Photo.length > 0) {
    photoUrl = fields.Photo[0]?.url || fields.Photo[0]?.thumbnails?.large?.url || null;
  } else if (typeof fields.Photo === 'string') {
    photoUrl = fields.Photo;
  } else if (fields.photo) {
    photoUrl = fields.photo;
  }

  const category = fields.Category || fields.category || 'General';
  const urgency = fields.Urgency || fields.urgency || fields.priority || 'Moderate';
  const title = fields.Title || fields.title || 'Maintenance Request';
  const description = fields.Description || fields.description || '';
  const location = fields.Location || fields.location || 'Campus Facilities';
  const createdAt = fields.CreatedAt || fields.createdAt || record.createdTime || new Date().toISOString();
  const reporterEmail = fields.ReporterEmail || fields.Email || fields.reporterEmail || null;
  const reporterName = fields.ReporterName || fields.reporterName || 'Alex Rivera';
  const reporterId = fields.ReporterId || fields.reporterId || 'usr_1';

  return {
    id: record.id,
    title,
    Title: title,
    description,
    Description: description,
    category,
    Category: category,
    urgency,
    Urgency: urgency,
    priority: urgency === 'Emergency' ? 'Emergency' : urgency === 'Urgent' ? 'Urgent' : 'Routine',
    status,
    Status: status,
    location,
    Location: location,
    techConfirmed: isTechConfirmed,
    TechConfirmed: isTechConfirmed ? 'true' : 'false',
    userConfirmed: isUserConfirmed,
    UserConfirmed: isUserConfirmed ? 'true' : 'false',
    assignedTo: fields.AssignedTo || (category === 'Electrical' ? 'Electrical Tech' : category === 'Plumbing' ? 'Plumbing Tech' : 'General Maintenance'),
    photo: photoUrl,
    createdAt,
    updatedAt: fields.UpdatedAt || fields.updatedAt || createdAt,
    reportedBy: {
      id: reporterId,
      name: reporterName,
      email: reporterEmail || 'alex@campus.edu',
      role: 'User',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'
    },
    reporterId,
    reporterEmail,
    reporterName,
    isAirtable: true,
    ...fields
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
  const role = auth?.currentUser?.approvalStatus === 'Approved' ? auth.currentUser.role : null;
  const currentUser = auth?.currentUser || null;

  // Airtable PAT token from env or localStorage
  const [airtablePat, setAirtablePat] = useState(() => {
    return import.meta.env.VITE_AIRTABLE_PAT || localStorage.getItem(STORAGE_KEYS.AIRTABLE_PAT) || '';
  });
  const [isAirtableConnected, setIsAirtableConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Tab state for User Role: 'new-issue' | 'my-tickets'
  const [userTab, setUserTab] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.USER_TAB) || 'new-issue';
    } catch {
      return 'new-issue';
    }
  });

  // Active tickets state - clean by default (no dummy tickets)
  const [tickets, setTickets] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TICKETS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filter out any legacy dummy/demo tickets
          return parsed.filter(
            (t) => !t.isDemo && !t.id?.startsWith('DEMO-') && !['REQ-10240', 'REQ-10237', 'REQ-10241'].includes(t.id)
          );
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

  // 1. READ: Fetch all tickets on load from Airtable
  const fetchTickets = useCallback(async () => {
    const token = airtablePat.trim();
    if (!token || token === 'your_actual_pat_token_here') {
      setIsLoading(false);
      setIsAirtableConnected(false);
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(AIRTABLE_URL, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Airtable responded with HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Map Airtable records into your frontend state format
      if (Array.isArray(data.records)) {
        const formattedTickets = data.records.map(formatAirtableRecord);
        setTickets(formattedTickets);
        setIsAirtableConnected(true);
        console.log(`✓ Loaded ${formattedTickets.length} tickets from live Airtable base ${AIRTABLE_BASE_ID}`);
      }
    } catch (error) {
      console.warn("Airtable fetch failed, falling back to local state:", error);
      setIsAirtableConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [airtablePat]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Helper to persist updated tickets array to shared /api/db on host
  const persistTicketsToBackend = useCallback(async (updatedTickets) => {
    try {
      await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickets: updatedTickets })
      });
    } catch (err) {
      console.warn('[TicketContext] Failed saving tickets to /api/db:', err);
    }
  }, []);

  // Poll /api/db on mount and every 3 seconds to keep laptop & phone tickets in real-time sync
  const syncTicketsFromBackend = useCallback(async () => {
    try {
      const res = await fetch('/api/db');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.tickets)) {
        setTickets((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(data.tickets)) {
            return prev;
          }
          return data.tickets;
        });
      }
    } catch (err) {
      // Local storage fallback
    }
  }, []);

  useEffect(() => {
    syncTicketsFromBackend();
    const interval = setInterval(syncTicketsFromBackend, 2000);
    return () => clearInterval(interval);
  }, [syncTicketsFromBackend]);

  // Persist tickets
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(tickets));
    } catch (e) {
      console.warn('Failed saving tickets to storage:', e);
    }
  }, [tickets]);

  // Persist role
  useEffect(() => {
    try {
      if (role) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_ROLE, JSON.stringify(role));
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_ROLE);
      }
    } catch (e) {
      console.warn('Failed saving role:', e);
    }
  }, [role]);

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

  // 2. CREATE: Send the Gemini AI output to Airtable
  const addTicket = async (newTicketData) => {
    const token = airtablePat.trim();
    const hasValidToken = token && token !== 'your_actual_pat_token_here';

    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const localId = newTicketData.id || `TCK-${randomNum}`;
    const now = newTicketData.createdAt || new Date().toISOString();

    const title = newTicketData.title || (newTicketData.description?.length > 50 ? newTicketData.description.substring(0, 47) + '...' : newTicketData.description) || 'Maintenance Request';
    const category = newTicketData.category || 'General';
    const urgency = newTicketData.urgency || newTicketData.priority || 'Moderate';
    const location = newTicketData.location || 'Facility General Area';
    const description = newTicketData.description || '';

    const reporterDetails = newTicketData.reportedBy || {
      id: currentUser?.id || `usr_${Date.now()}`,
      name: currentUser?.name || 'Campus Reporter',
      email: currentUser?.email || 'user@campus.edu',
      role: currentUser?.role || 'user',
      avatar: currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120'
    };

    let createdRecord = null;

    if (hasValidToken) {
      try {
        const payloadFields = {
          "Title": title,
          "Location": location,
          "Description": description,
          "Category": category,
          "Urgency": urgency,
          "Status": "Assigned",
          "TechConfirmed": "false",
          "UserConfirmed": "false"
        };

        const response = await fetch(AIRTABLE_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            records: [{
              fields: payloadFields
            }]
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(`Airtable POST failed: ${errData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        
        // Instantly update the UI with the newly created Airtable record
        if (data.records && data.records[0]) {
          createdRecord = formatAirtableRecord({
            ...data.records[0],
            fields: {
              ...payloadFields,
              ...data.records[0].fields,
              photo: newTicketData.photo || null
            }
          });
          // Preserve active user details on created Airtable record
          createdRecord.reportedBy = reporterDetails;
          createdRecord.reporterId = reporterDetails.id;
          createdRecord.reporterEmail = reporterDetails.email;
          createdRecord.reporterName = reporterDetails.name;

          setTickets(prev => {
            const nextTickets = [createdRecord, ...prev];
            persistTicketsToBackend(nextTickets);
            return nextTickets;
          });
          addToast({
            type: 'success',
            title: `Airtable Record Created!`,
            message: `Logged to live Airtable base under ID: ${data.records[0].id.substring(0, 8)}...`
          });
          return createdRecord;
        }
      } catch (error) {
        console.error("Failed to create ticket in Airtable, saving locally:", error);
        addToast({
          type: 'warning',
          title: 'Airtable Sync Notice',
          message: 'Saved locally. Please verify your Airtable PAT token permissions.'
        });
      }
    }

    // Local / Offline fallback creation
    createdRecord = {
      id: localId,
      title,
      Title: title,
      description,
      Description: description,
      category,
      Category: category,
      urgency,
      Urgency: urgency,
      priority: urgency,
      status: 'Assigned',
      Status: 'Assigned',
      location,
      Location: location,
      techConfirmed: false,
      TechConfirmed: 'false',
      userConfirmed: false,
      UserConfirmed: 'false',
      reportedBy: reporterDetails,
      reporterId: reporterDetails.id,
      reporterEmail: reporterDetails.email,
      reporterName: reporterDetails.name,
      assignedTo: newTicketData.assignedTo || (category === 'Electrical' ? 'Electrical Tech' : category === 'Plumbing' ? 'Plumbing Tech' : 'General Maintenance'),
      photo: newTicketData.photo || null,
      createdAt: now,
      updatedAt: now,
      ...newTicketData
    };

    setTickets((prev) => {
      const nextTickets = [createdRecord, ...prev];
      persistTicketsToBackend(nextTickets);
      return nextTickets;
    });

    addToast({
      type: 'success',
      title: `Ticket #${localId} Logged!`,
      message: 'Maintenance ticket successfully filed.'
    });

    return createdRecord;
  };

  const createTicket = addTicket;

  // 3. UPDATE: Handle the Dual-Approval system (PATCH request)
  const handleTicketClosure = async (ticketId, role, currentTicket) => {
    // Look up ticket if not explicitly passed
    const ticket = currentTicket || tickets.find((t) => t.id === ticketId);

    // Determine the new flags
    const isTech = role === 'technician';
    const isUser = role === 'user';
    
    const prevTechConfirmed = ticket ? (ticket.TechConfirmed === "true" || ticket.techConfirmed === true) : false;
    const prevUserConfirmed = ticket ? (ticket.UserConfirmed === "true" || ticket.userConfirmed === true) : false;

    const newTechConfirmed = isTech ? true : prevTechConfirmed;
    const newUserConfirmed = isUser ? true : prevUserConfirmed;

    const newTechStatus = newTechConfirmed ? "true" : "false";
    const newUserStatus = newUserConfirmed ? "true" : "false";
    
    // Dual-Approval Rule:
    // If BOTH confirmed -> 'Completed'
    // If ONLY user confirmed -> 'Awaiting Tech Sign-off'
    // If ONLY technician confirmed -> 'Pending User Verification'
    let newStatus = 'Assigned';
    if (newTechConfirmed && newUserConfirmed) {
      newStatus = 'Completed';
    } else if (newUserConfirmed && !newTechConfirmed) {
      newStatus = 'Awaiting Tech Sign-off';
    } else if (newTechConfirmed && !newUserConfirmed) {
      newStatus = 'Pending User Verification';
    } else {
      newStatus = ticket?.Status || ticket?.status || 'Assigned';
    }

    const token = airtablePat.trim();
    const hasValidToken = token && token !== 'your_actual_pat_token_here';
    const airtableRecId = (ticketId && ticketId.startsWith('rec')) ? ticketId : ticket?.airtableId;

    // Patch the specific row in Airtable if it is an Airtable record
    if (hasValidToken && airtableRecId) {
      try {
        await fetch(`${AIRTABLE_URL}/${airtableRecId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              "TechConfirmed": newTechStatus,
              "UserConfirmed": newUserStatus,
              "Status": newStatus
            }
          })
        });
        console.log(`✓ Dual-approval patched to Airtable record: ${airtableRecId}`);
      } catch (error) {
        console.error("Failed to update ticket in Airtable:", error);
      }
    }

    // Update local React state to reflect the change immediately and sync with backend
    setTickets((prev) => {
      const nextTickets = prev.map((t) => 
        (t.id === ticketId || (airtableRecId && t.airtableId === airtableRecId))
          ? { 
              ...t, 
              TechConfirmed: newTechStatus, 
              UserConfirmed: newUserStatus, 
              Status: newStatus,
              techConfirmed: newTechConfirmed,
              userConfirmed: newUserConfirmed,
              status: newStatus,
              resolvedAt: newStatus === 'Completed' ? (t.resolvedAt || new Date().toISOString()) : t.resolvedAt
            } 
          : t
      );
      persistTicketsToBackend(nextTickets);
      return nextTickets;
    });

    if (newStatus === 'Completed') {
      addToast({
        type: 'success',
        title: 'Ticket Completed ✓',
        message: 'Both user and technician have verified and confirmed resolution.'
      });
    } else if (isTech) {
      addToast({
        type: 'info',
        title: 'Work Marked as Fixed',
        message: 'Technician sign-off recorded. Sent to user for verification.'
      });
    } else if (isUser) {
      addToast({
        type: 'info',
        title: 'Marked Complete by User',
        message: 'User sign-off recorded. Awaiting technician sign-off.'
      });
    }
  };

  const updateTicketStatus = async (ticketId, newStatus, resolutionNotes = '') => {
    const now = new Date().toISOString();
    const isResolved = newStatus === 'Done' || newStatus === 'Completed';
    const statusVal = newStatus === 'Done' ? 'Completed' : newStatus;

    const token = airtablePat.trim();
    const hasValidToken = token && token !== 'your_actual_pat_token_here';

    if (hasValidToken && ticketId && ticketId.startsWith('rec')) {
      try {
        await fetch(`${AIRTABLE_URL}/${ticketId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              "Status": statusVal
            }
          })
        });
      } catch (err) {
        console.warn('Airtable status update error:', err);
      }
    }

    setTickets((prev) => {
      const nextTickets = prev.map((t) => {
        if (t.id === ticketId) {
          return {
            ...t,
            status: statusVal,
            Status: statusVal,
            updatedAt: now,
            resolvedAt: isResolved ? (t.resolvedAt || now) : null,
            resolutionNotes: resolutionNotes || t.resolutionNotes || (isResolved ? `Resolved by ${currentUser?.name || 'Staff'}` : null)
          };
        }
        return t;
      });
      persistTicketsToBackend(nextTickets);
      return nextTickets;
    });

    addToast({
      type: isResolved ? 'success' : 'info',
      title: `Status Updated`,
      message: `Ticket marked as ${statusVal}.`
    });
  };

  const deleteTicket = async (ticketId) => {
    const token = airtablePat.trim();
    const hasValidToken = token && token !== 'your_actual_pat_token_here';

    const target = tickets.find((t) => t.id === ticketId || t.airtableId === ticketId);
    const airtableRecId = (ticketId && ticketId.startsWith('rec')) ? ticketId : target?.airtableId;

    if (hasValidToken && airtableRecId) {
      try {
        await fetch(`${AIRTABLE_URL}/${airtableRecId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        console.log(`✓ Record deleted from Airtable: ${airtableRecId}`);
      } catch (err) {
        console.warn('Airtable delete error:', err);
      }
    }

    setTickets((prev) => {
      const nextTickets = prev.filter((t) => t.id !== ticketId && t.airtableId !== ticketId);
      persistTicketsToBackend(nextTickets);
      return nextTickets;
    });

    addToast({
      type: 'warning',
      title: 'Ticket Deleted',
      message: `Ticket #${ticketId} was permanently removed.`
    });
  };

  const resetMockData = () => {
    setTickets([]);
    persistTicketsToBackend([]);
    localStorage.removeItem(STORAGE_KEYS.TICKETS);
    addToast({
      type: 'info',
      title: 'Database Reset',
      message: 'All maintenance tickets have been cleared from database.'
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
    const critical = tickets.filter((t) => (t.priority === 'Critical' || t.priority === 'Emergency' || t.Urgency === 'Urgent') && t.status !== 'Done' && t.status !== 'Completed').length;
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
    isAirtableConnected,
    airtablePat,
    setAirtablePat,
    fetchTickets,
    stats,
    toasts,
    addToast,
    removeToast,
    loginAs,
    logout,
    addTicket,
    createTicket,
    handleTicketClosure,
    updateTicketStatus,
    deleteTicket,
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
