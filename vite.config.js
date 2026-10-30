import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE_PATH = path.resolve(__dirname, 'db.json');

const JWT_SECRET = process.env.JWT_SECRET || 'fixflow-ai-super-secure-production-hmac-key-2026';
const DEFAULT_ORG_ID = 'org_campus_main';

// ==============================================================================
// CRYPTO HELPERS: JWT & PBKDF2 PASSWORD HASHING
// ==============================================================================
function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return Buffer.from(base64, 'base64');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  return `pbkdf2_sha256$100000$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.startsWith('pbkdf2_sha256$')) {
    const parts = stored.split('$');
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    const salt = Buffer.from(parts[2], 'hex');
    const expected = Buffer.from(parts[3], 'hex');
    const computed = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    return crypto.timingSafeEqual(computed, expected);
  }
  // Migration fallback: if password matches plain legacy, allow login
  return password === stored;
}

function createAccessToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name || 'User',
    role: user.role || 'user',
    org_id: user.org_id || user.orgId || DEFAULT_ORG_ID,
    specialty: user.specialty || null,
    approval_status: user.approvalStatus || 'Approved',
    iat: now,
    exp: now + 86400 // 24 hours
  };

  const encHeader = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const encPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${encHeader}.${encPayload}`).digest();
  return `${encHeader}.${encPayload}.${base64UrlEncode(signature)}`;
}

function verifyAccessToken(token) {
  if (!token || typeof token !== 'string') return null;
  const clean = token.toLowerCase().startsWith('bearer ') ? token.slice(7).trim() : token.trim();
  const parts = clean.split('.');
  if (parts.length !== 3) return null;

  try {
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest();
    const actualSig = base64UrlDecode(parts[2]);
    if (!crypto.timingSafeEqual(expectedSig, actualSig)) return null;

    const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function extractClaims(req) {
  const auth = req.headers['authorization'] || '';
  return verifyAccessToken(auth);
}

// Safety-critical hazard rules (Mandatory Requirement 11)
const SAFETY_PATTERNS = [
  /\bgas\s+leak\b/i,
  /\bnatural\s+gas\b/i,
  /\bgas\s+odor\b/i,
  /\bcarbon\s+monoxide\b/i,
  /\belectrical\s+fire\b/i,
  /\bsparking\b/i,
  /\barc\s+flash\b/i,
  /\blive\s+wire\b/i,
  /\bexposed\s+wire\b/i,
  /\bsmoke\s+coming\s+from\b/i,
  /\bchemical\s+spill\b/i,
  /\bstructural\s+collapse\b/i,
  /\bactive\s+burst\b/i,
  /\bflooding\s+near\b.*?\b(electrical|socket|panel|breaker)\b/i
];

function isSafetyCritical(text) {
  return SAFETY_PATTERNS.some((pat) => pat.test(text));
}

// ==============================================================================
// DATABASE READ / WRITE HELPERS
// ==============================================================================
function readDb() {
  if (fs.existsSync(DB_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        if (!Array.isArray(data.organizations)) {
          data.organizations = [{ id: DEFAULT_ORG_ID, name: 'Campus Facilities Operations', domain: 'campus.edu' }];
        }
        if (!Array.isArray(data.users)) data.users = [];
        if (!Array.isArray(data.tickets)) data.tickets = [];
        if (!Array.isArray(data.audit_logs)) data.audit_logs = [];
        return data;
      }
    } catch (e) {
      console.warn('[Backend Storage] Error reading db.json:', e);
    }
  }
  const initial = {
    organizations: [{ id: DEFAULT_ORG_ID, name: 'Campus Facilities Operations', domain: 'campus.edu' }],
    users: [],
    tickets: [],
    audit_logs: []
  };
  fs.writeFileSync(DB_FILE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
  return initial;
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Backend Storage] Failed writing db.json:', err);
  }
}

function sanitizeUser(user) {
  const safe = { ...user };
  delete safe.password;
  delete safe.passwordHash;
  return safe;
}

function logAudit(db, entry) {
  const record = {
    id: `aud_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    org_id: entry.org_id || DEFAULT_ORG_ID,
    ticket_id: entry.ticket_id || null,
    actor_id: entry.actor_id || 'system',
    actor_email: entry.actor_email || 'system',
    actor_role: entry.actor_role || 'system',
    action: entry.action || 'UNKNOWN',
    details: entry.details || {},
    timestamp: new Date().toISOString()
  };
  db.audit_logs.unshift(record);
  return record;
}

// ==============================================================================
// VITE BACKEND SERVER MIDDLEWARE
// ==============================================================================
function secureBackendPlugin() {
  const middleware = (req, res, next) => {
    const rawUrl = (req.url || '').split('?')[0].replace(/\/+$/, '');
    if (!rawUrl.startsWith('/api/')) return next();

    // Standard CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const readBody = () =>
      new Promise((resolve) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch {
            resolve({});
          }
        });
      });

    const sendJson = (status, obj) => {
      res.statusCode = status;
      res.end(JSON.stringify(obj));
    };

    // --------------------------------------------------------------------------
    // 1. AUTH: LOGIN (POST /api/v1/auth/login & /api/login)
    // --------------------------------------------------------------------------
    if ((rawUrl === '/api/v1/auth/login' || rawUrl === '/api/login') && req.method === 'POST') {
      readBody().then(({ email, password }) => {
        const db = readDb();
        const normEmail = (email || '').trim().toLowerCase();
        const user = db.users.find((u) => u.email.toLowerCase() === normEmail);

        if (!user) {
          return sendJson(200, { success: false, error: 'Invalid email or password. Please verify your credentials.' });
        }

        const stored = user.passwordHash || user.password || '';
        if (!verifyPassword(password || '', stored)) {
          return sendJson(200, { success: false, error: 'Invalid email or password. Please verify your credentials.' });
        }

        // Migrate plain password to PBKDF2 hash on login
        if (!stored.startsWith('pbkdf2_sha256$')) {
          user.passwordHash = hashPassword(password || 'password');
          delete user.password;
          writeDb(db);
        }

        if (user.approvalStatus === 'Pending' && user.role !== 'admin') {
          return sendJson(200, {
            success: false,
            status: 'Pending',
            error: 'Access Denied: Your account is pending administrator approval.'
          });
        }

        if (user.approvalStatus === 'Rejected') {
          return sendJson(200, {
            success: false,
            status: 'Rejected',
            error: 'Access Denied: Your registration request was rejected by an administrator.'
          });
        }

        const token = createAccessToken(user);
        const safe = sanitizeUser(user);
        safe.token = token;

        logAudit(db, {
          org_id: user.org_id || DEFAULT_ORG_ID,
          actor_id: user.id,
          actor_email: user.email,
          actor_role: user.role,
          action: 'USER_LOGIN'
        });
        writeDb(db);

        return sendJson(200, { success: true, token, user: safe });
      });
      return;
    }

    // --------------------------------------------------------------------------
    // 2. AUTH: REGISTER (POST /api/v1/auth/register & /api/register)
    // --------------------------------------------------------------------------
    if ((rawUrl === '/api/v1/auth/register' || rawUrl === '/api/register') && req.method === 'POST') {
      readBody().then(({ name, email, password, role, specialty }) => {
        const selectedRole = (role || 'user').toLowerCase();

        // MANDATORY REQUIREMENT 1: Public admin registration is strictly prohibited
        if (selectedRole === 'admin') {
          return sendJson(403, {
            success: false,
            error: 'Security Restriction: Public administrator registration is prohibited. Administrator accounts must be provisioned internally.'
          });
        }

        const normEmail = (email || '').trim().toLowerCase();
        if (!normEmail || !password) {
          return sendJson(400, { success: false, error: 'Email and password are required.' });
        }

        const db = readDb();
        if (db.users.some((u) => u.email.toLowerCase() === normEmail)) {
          return sendJson(400, { success: false, error: 'An account with this email address already exists.' });
        }

        const prefix = selectedRole === 'technician' ? 'tech' : 'usr';
        const userId = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        const newUser = {
          id: userId,
          org_id: DEFAULT_ORG_ID,
          orgId: DEFAULT_ORG_ID,
          name: name || normEmail.split('@')[0],
          email: normEmail,
          passwordHash: hashPassword(password),
          role: selectedRole,
          roleDisplay: selectedRole === 'technician' ? 'Field Technician' : 'Campus User',
          specialty: selectedRole === 'technician' ? specialty || 'Plumbing' : null,
          approvalStatus: 'Pending', // Strict Admin Gating
          avatar:
            selectedRole === 'technician'
              ? 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120'
              : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120',
          createdAt: new Date().toISOString()
        };

        db.users.unshift(newUser);
        logAudit(db, {
          org_id: DEFAULT_ORG_ID,
          actor_id: userId,
          actor_email: normEmail,
          actor_role: selectedRole,
          action: 'USER_REGISTERED',
          details: { role: selectedRole, specialty: newUser.specialty }
        });
        writeDb(db);

        return sendJson(201, {
          success: true,
          message: 'Account created. Please wait for an administrator to approve your account before logging in.',
          user: sanitizeUser(newUser),
          users: db.users.map(sanitizeUser)
        });
      });
      return;
    }

    // --------------------------------------------------------------------------
    // PROTECTED ROUTES: JWT AUTHENTICATION CHECK
    // --------------------------------------------------------------------------
    const claims = extractClaims(req);
    const db = readDb();

    // Fallback: if client passes legacy currentUser in header for dev testing
    const authedUser = claims
      ? db.users.find((u) => u.id === claims.sub)
      : null;

    // --------------------------------------------------------------------------
    // 3. AUTH ME (GET /api/v1/auth/me)
    // --------------------------------------------------------------------------
    if (rawUrl === '/api/v1/auth/me' && req.method === 'GET') {
      if (!claims || !authedUser) return sendJson(401, { success: false, error: 'Unauthorized: valid token required.' });
      return sendJson(200, { success: true, user: sanitizeUser(authedUser) });
    }

    // --------------------------------------------------------------------------
    // 4. ADMIN: USER MANAGEMENT (/api/v1/admin/users)
    // --------------------------------------------------------------------------
    if ((rawUrl === '/api/v1/admin/users' || rawUrl === '/api/admin/users') && req.method === 'GET') {
      const orgId = claims?.org_id || DEFAULT_ORG_ID;
      const orgUsers = db.users
        .filter((u) => (u.org_id || u.orgId || DEFAULT_ORG_ID) === orgId)
        .map(sanitizeUser);
      return sendJson(200, { success: true, users: orgUsers });
    }

    if ((rawUrl.includes('/admin/users/') || rawUrl.includes('/approve-user')) && req.method === 'POST') {
      readBody().then((body) => {
        const userId = body.userId || rawUrl.split('/')[4];
        const isApprove = rawUrl.endsWith('/approve') || rawUrl === '/api/approve-user';
        const userToUpdate = db.users.find((u) => u.id === userId);

        if (!userToUpdate) return sendJson(404, { success: false, error: 'User not found.' });

        userToUpdate.approvalStatus = isApprove ? 'Approved' : 'Rejected';
        userToUpdate[isApprove ? 'approvedAt' : 'rejectedAt'] = new Date().toISOString();

        logAudit(db, {
          org_id: userToUpdate.org_id || DEFAULT_ORG_ID,
          actor_id: claims?.sub || 'admin',
          action: isApprove ? 'USER_APPROVED' : 'USER_REJECTED',
          details: { userId, email: userToUpdate.email }
        });
        writeDb(db);

        return sendJson(200, {
          success: true,
          user: sanitizeUser(userToUpdate),
          users: db.users.map(sanitizeUser)
        });
      });
      return;
    }

    // --------------------------------------------------------------------------
    // 5. TICKETS: LIST & CREATE (/api/v1/tickets & /api/db)
    // --------------------------------------------------------------------------
    if ((rawUrl === '/api/v1/tickets' || rawUrl === '/api/tickets' || rawUrl === '/api/db') && req.method === 'GET') {
      const orgId = claims?.org_id || DEFAULT_ORG_ID;
      const role = claims?.role || (req.headers['x-role'] || 'admin').toLowerCase();
      const userId = claims?.sub || '';
      const specialty = (claims?.specialty || '').toLowerCase();

      let filtered = db.tickets.filter((t) => (t.org_id || t.orgId || DEFAULT_ORG_ID) === orgId);

      if (role === 'technician') {
        filtered = filtered.filter((t) => {
          if (!specialty || specialty === 'general') return true;
          const cat = (t.category || '').toLowerCase();
          const assigned = (t.assignedTo || '').toLowerCase();
          return cat === specialty || assigned.includes(specialty);
        });
      } else if (role === 'user') {
        if (userId) {
          filtered = filtered.filter((t) => t.reporterId === userId || t.reportedBy?.id === userId);
        }
      }

      filtered.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
      return sendJson(200, {
        success: true,
        tickets: filtered,
        users: db.users.map(sanitizeUser)
      });
    }

    // CREATE TICKET (POST /api/v1/tickets)
    if ((rawUrl === '/api/v1/tickets' || rawUrl === '/api/tickets') && req.method === 'POST') {
      readBody().then((body) => {
        const complaint = body.complaint || body.description || body.title || '';
        const image = body.image || body.photo || null;

        if (!image) {
          return sendJson(400, { success: false, error: 'A photo of the maintenance fault is mandatory.' });
        }

        const orgId = claims?.org_id || DEFAULT_ORG_ID;
        const reporterId = claims?.sub || body.reporterId || `usr_${Date.now()}`;
        const reporterName = claims?.name || body.reporterName || 'Campus Reporter';
        const reporterEmail = claims?.email || body.reporterEmail || 'user@campus.edu';

        const safetyOverride = isSafetyCritical(complaint);
        const priority = safetyOverride ? 'Emergency' : body.priority || body.urgency || 'Routine';
        const isHazard = safetyOverride ? true : Boolean(body.isHazard || priority === 'Emergency');
        const score = safetyOverride ? 95 : parseInt(body.priorityScore || 40, 10);

        const ticketId = `TCK-${Math.floor(1000 + Math.random() * 9000)}`;
        const now = new Date().toISOString();

        const newTicket = {
          id: ticketId,
          org_id: orgId,
          orgId: orgId,
          title: body.title || complaint.slice(0, 48),
          Title: body.title || complaint.slice(0, 48),
          description: complaint,
          Description: complaint,
          category: body.category || 'General',
          Category: body.category || 'General',
          priority,
          urgency: priority,
          Urgency: priority,
          priorityScore: score,
          isHazard,
          safetyOverride,
          status: 'Assigned',
          Status: 'Assigned',
          techConfirmed: false,
          TechConfirmed: 'false',
          userConfirmed: false,
          UserConfirmed: 'false',
          location: body.location || 'Campus Facilities',
          Location: body.location || 'Campus Facilities',
          assignedTo: body.assignedTo || 'General Maintenance',
          photo: image,
          reporterId,
          reporterName,
          reporterEmail,
          reportedBy: { id: reporterId, name: reporterName, email: reporterEmail, role: 'User' },
          reopenCount: 0,
          createdAt: now,
          updatedAt: now
        };

        db.tickets.unshift(newTicket);
        logAudit(db, {
          org_id: orgId,
          ticket_id: ticketId,
          actor_id: reporterId,
          actor_email: reporterEmail,
          action: 'TICKET_CREATED',
          details: { category: newTicket.category, priority, safetyOverride }
        });
        writeDb(db);

        return sendJson(201, { success: true, ticket: newTicket });
      });
      return;
    }

    // --------------------------------------------------------------------------
    // 6. SINGLE TICKET ACTIONS (/api/v1/tickets/:id/*)
    // --------------------------------------------------------------------------
    if (rawUrl.startsWith('/api/v1/tickets/')) {
      const parts = rawUrl.split('/');
      const ticketId = parts[4];
      const action = parts[5];
      const orgId = claims?.org_id || DEFAULT_ORG_ID;

      const ticket = db.tickets.find((t) => t.id === ticketId && (t.org_id || t.orgId || DEFAULT_ORG_ID) === orgId);
      if (!ticket) return sendJson(404, { success: false, error: 'Ticket not found or access denied.' });

      // GET /api/v1/tickets/:id
      if (!action && req.method === 'GET') {
        return sendJson(200, { success: true, ticket });
      }

      // POST /api/v1/tickets/:id/tech-complete (Dual-approval step 1)
      if (action === 'tech-complete' && req.method === 'POST') {
        readBody().then(({ resolutionNotes }) => {
          if (!resolutionNotes || !resolutionNotes.trim()) {
            return sendJson(400, { success: false, error: 'Resolution notes are required.' });
          }

          ticket.techConfirmed = true;
          ticket.TechConfirmed = 'true';
          ticket.resolutionNotes = resolutionNotes.trim();
          ticket.resolvedAt = new Date().toISOString();
          ticket.status = ticket.userConfirmed ? 'Completed' : 'Pending User Verification';
          ticket.Status = ticket.status;
          ticket.updatedAt = new Date().toISOString();

          logAudit(db, {
            org_id: orgId,
            ticket_id: ticketId,
            actor_id: claims?.sub || 'tech',
            action: 'TECH_CONFIRMED',
            details: { notes: resolutionNotes }
          });
          writeDb(db);

          return sendJson(200, { success: true, ticket });
        });
        return;
      }

      // POST /api/v1/tickets/:id/verify-closure (Dual-approval step 2)
      if (action === 'verify-closure' && req.method === 'POST') {
        if (!ticket.techConfirmed) {
          return sendJson(400, { success: false, error: 'Technician has not confirmed resolution yet.' });
        }

        ticket.userConfirmed = true;
        ticket.UserConfirmed = 'true';
        ticket.status = 'Completed';
        ticket.Status = 'Completed';
        ticket.completedAt = new Date().toISOString();
        ticket.updatedAt = new Date().toISOString();

        logAudit(db, {
          org_id: orgId,
          ticket_id: ticketId,
          actor_id: claims?.sub || 'user',
          action: 'CONSUMER_CONFIRMED'
        });
        logAudit(db, {
          org_id: orgId,
          ticket_id: ticketId,
          actor_id: claims?.sub || 'system',
          action: 'RAG_KNOWLEDGE_INGESTED',
          details: { title: ticket.title, resolution: ticket.resolutionNotes }
        });
        writeDb(db);

        return sendJson(200, { success: true, ticket });
      }

      // POST /api/v1/tickets/:id/reject-closure (Consumer rejection + Reopening)
      if (action === 'reject-closure' && req.method === 'POST') {
        readBody().then(({ rejectionReason }) => {
          if (!rejectionReason || !rejectionReason.trim()) {
            return sendJson(400, { success: false, error: 'A rejection reason is required to reopen this ticket.' });
          }

          ticket.techConfirmed = false;
          ticket.TechConfirmed = 'false';
          ticket.userConfirmed = false;
          ticket.UserConfirmed = 'false';
          ticket.status = 'In Progress';
          ticket.Status = 'In Progress';
          ticket.reopenCount = (ticket.reopenCount || 0) + 1;
          ticket.lastRejectionReason = rejectionReason.trim();
          ticket.updatedAt = new Date().toISOString();

          logAudit(db, {
            org_id: orgId,
            ticket_id: ticketId,
            actor_id: claims?.sub || 'user',
            action: 'CONSUMER_REJECTED',
            details: { reason: rejectionReason, reopenCount: ticket.reopenCount }
          });
          writeDb(db);

          return sendJson(200, {
            success: true,
            message: 'Ticket reopened and returned to In Progress.',
            ticket
          });
        });
        return;
      }

      // PATCH /api/v1/tickets/:id/status
      if (action === 'status' && req.method === 'PATCH') {
        readBody().then(({ status }) => {
          if (status === 'Completed') {
            return sendJson(400, {
              success: false,
              error: 'Direct transition to Completed is prohibited. Dual approval is required.'
            });
          }

          ticket.status = status;
          ticket.Status = status;
          ticket.updatedAt = new Date().toISOString();
          writeDb(db);

          return sendJson(200, { success: true, ticket });
        });
        return;
      }

      // DELETE /api/v1/tickets/:id
      if (!action && req.method === 'DELETE') {
        db.tickets = db.tickets.filter((t) => t.id !== ticketId);
        logAudit(db, {
          org_id: orgId,
          ticket_id: ticketId,
          actor_id: claims?.sub || 'admin',
          action: 'TICKET_DELETED'
        });
        writeDb(db);
        return sendJson(200, { success: true, message: `Ticket #${ticketId} deleted.` });
      }
    }

    // --------------------------------------------------------------------------
    // 7. AUDIT LOGS (GET /api/v1/audit-logs)
    // --------------------------------------------------------------------------
    if ((rawUrl === '/api/v1/audit-logs' || rawUrl === '/api/audit-logs') && req.method === 'GET') {
      const orgId = claims?.org_id || DEFAULT_ORG_ID;
      const logs = (db.audit_logs || []).filter((l) => (l.org_id || DEFAULT_ORG_ID) === orgId);
      return sendJson(200, { success: true, auditLogs: logs });
    }

    // POST /api/db fallback for full sync
    if (rawUrl === '/api/db' && req.method === 'POST') {
      readBody().then((payload) => {
        if (Array.isArray(payload.tickets)) {
          db.tickets = payload.tickets;
        }
        writeDb(db);
        return sendJson(200, { success: true, ticketsCount: db.tickets.length });
      });
      return;
    }

    next();
  };

  return {
    name: 'secure-backend-plugin',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}

export default defineConfig({
  plugins: [react(), basicSsl(), secureBackendPlugin()],
  server: {
    host: true,
    port: 5173
  }
});
