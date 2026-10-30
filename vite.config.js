import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE_PATH = path.resolve(__dirname, 'db.json');

// Default Seed Users (Master Admin, Campus User, and Specialized Technicians)
const DEFAULT_SEED_USERS = [
  {
    id: "adm_master_1",
    name: "Master Administrator",
    email: "admin@campus.edu",
    password: "admin123",
    role: "admin",
    roleDisplay: "Administrator",
    department: "Campus Facilities Operations",
    approvalStatus: "Approved",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80",
    createdAt: new Date().toISOString()
  },
  {
    id: "usr_user",
    name: "Campus User",
    email: "user@campus.edu",
    password: "password",
    role: "user",
    roleDisplay: "Campus User",
    department: "Campus Student Services",
    approvalStatus: "Approved",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80",
    createdAt: new Date().toISOString()
  },
  {
    id: "tech_1",
    name: "Marcus Vance",
    email: "tech@campus.edu",
    password: "password123",
    role: "technician",
    roleDisplay: "Field Technician",
    specialty: "Plumbing",
    approvalStatus: "Approved",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80",
    createdAt: new Date().toISOString()
  },
  {
    id: "tech_2",
    name: "Elena Rostova",
    email: "elena@campus.edu",
    password: "password123",
    role: "technician",
    roleDisplay: "Field Technician",
    specialty: "Electrical",
    approvalStatus: "Approved",
    avatar: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=120&auto=format&fit=crop&q=80",
    createdAt: new Date().toISOString()
  },
  {
    id: "tech_3",
    name: "Liam Smith",
    email: "liam@campus.edu",
    password: "password123",
    role: "technician",
    roleDisplay: "Field Technician",
    specialty: "HVAC",
    approvalStatus: "Approved",
    avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80",
    createdAt: new Date().toISOString()
  }
];

function readDb() {
  if (fs.existsSync(DB_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        if (!Array.isArray(data.users) || data.users.length === 0) {
          data.users = DEFAULT_SEED_USERS;
        }
        if (!Array.isArray(data.tickets)) {
          data.tickets = [];
        }
        return data;
      }
    } catch (e) {
      console.warn('[Local Sync API] Error reading db.json, repairing...', e);
    }
  }

  const initial = {
    users: DEFAULT_SEED_USERS,
    tickets: []
  };
  fs.writeFileSync(DB_FILE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
  return initial;
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Local Sync API] Failed writing db.json:', err);
  }
}

function localDbSyncPlugin() {
  const syncMiddleware = (req, res, next) => {
    // Only handle routes under /api/
    const url = (req.url || '').split('?')[0].replace(/\/+$/, '');
    if (!url.startsWith('/api/')) {
      return next();
    }

    // CORS headers for local LAN and mobile connections
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    // 1. GET /api/db - return all users and tickets
    if (url === '/api/db' && req.method === 'GET') {
      try {
        const db = readDb();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(db));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Read JSON body helper
    const readJsonBody = () => {
      return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (e) {
            reject(new Error('Invalid JSON: ' + e.message));
          }
        });
        req.on('error', reject);
      });
    };

    // 2. POST /api/db - merge or save users & tickets
    if (url === '/api/db' && req.method === 'POST') {
      readJsonBody()
        .then((payload) => {
          const current = readDb();

          if (Array.isArray(payload.users)) {
            const userMap = new Map();
            // Preserve existing users
            for (const u of current.users) {
              if (u.id) userMap.set(u.id, u);
            }
            // Merge or add payload users
            for (const u of payload.users) {
              const existing = Array.from(userMap.values()).find(
                (curr) => curr.id === u.id || (curr.email && u.email && curr.email.toLowerCase() === u.email.toLowerCase())
              );
              if (existing) {
                const isApproved = existing.approvalStatus === 'Approved' || u.approvalStatus === 'Approved';
                userMap.set(existing.id, {
                  ...existing,
                  ...u,
                  approvalStatus: isApproved ? 'Approved' : (u.approvalStatus || existing.approvalStatus)
                });
              } else {
                userMap.set(u.id || `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`, u);
              }
            }
            current.users = Array.from(userMap.values());
          }

          if (Array.isArray(payload.tickets)) {
            current.tickets = payload.tickets;
          }

          writeDb(current);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            usersCount: current.users?.length || 0,
            ticketsCount: current.tickets?.length || 0
          }));
        })
        .catch((err) => {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        });
      return;
    }

    // 3. POST /api/register - direct server-side user registration
    if (url === '/api/register' && req.method === 'POST') {
      readJsonBody()
        .then((userData) => {
          const current = readDb();
          const emailNorm = (userData.email || '').trim().toLowerCase();

          if (!emailNorm || !userData.password) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Email and password are required.' }));
            return;
          }

          const existing = current.users.find((u) => u.email.toLowerCase() === emailNorm);
          if (existing) {
            res.statusCode = 409;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: false,
              error: 'An account with this email address already exists. Please log in or use a different email.'
            }));
            return;
          }

          const selectedRole = userData.role === 'admin' ? 'admin' : userData.role === 'technician' ? 'technician' : 'user';
          const roleDisplay = selectedRole === 'admin' ? 'Administrator' : selectedRole === 'technician' ? 'Field Technician' : 'Campus User';
          const approvalStatus = selectedRole === 'admin' ? 'Approved' : 'Pending';

          const newUser = {
            id: `${selectedRole === 'admin' ? 'adm' : selectedRole === 'technician' ? 'tech' : 'usr'}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: userData.name || (emailNorm.split('@')[0] || (selectedRole === 'admin' ? 'Campus Admin' : 'New User')),
            email: emailNorm,
            password: userData.password,
            role: selectedRole,
            roleDisplay: roleDisplay,
            specialty: selectedRole === 'technician' ? (userData.specialty || 'Plumbing') : null,
            approvalStatus: approvalStatus,
            avatar: selectedRole === 'admin'
              ? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80'
              : selectedRole === 'technician'
              ? 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80'
              : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
            createdAt: new Date().toISOString()
          };

          current.users.unshift(newUser);
          writeDb(current);

          console.log(`[Shared Sync API] Registered new ${selectedRole} (${emailNorm}), status: ${approvalStatus}`);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            user: newUser,
            users: current.users
          }));
        })
        .catch((err) => {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err.message }));
        });
      return;
    }

    // 4. POST /api/login - direct server-side login validation against db.json
    if (url === '/api/login' && req.method === 'POST') {
      readJsonBody()
        .then(({ email, password, role }) => {
          const current = readDb();
          const emailNorm = (email || '').trim().toLowerCase();

          let user = current.users.find((u) => u.email.toLowerCase() === emailNorm);
          if (!user && (emailNorm === 'user@campus.edu' || emailNorm === 'user')) {
            user = current.users.find((u) => u.email.toLowerCase() === 'user@campus.edu' || u.email.toLowerCase() === 'alex@campus.edu' || u.role === 'user');
          }
          if (!user) {
            user = current.users.find((u) => u.email.toLowerCase().startsWith(emailNorm) || (u.name && u.name.toLowerCase().includes(emailNorm)));
          }

          // If user not found, respond 200 with success: false (avoids noisy browser console 401 resource error)
          if (!user) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: false,
              error: 'Invalid email or password. Please verify your credentials or register an account.'
            }));
            return;
          }

          // Password check: Accepts user's set password, 'password', 'password123', or 'admin123'
          const enteredPassword = password || '';
          const isMasterAdmin = user.email.toLowerCase() === 'admin@campus.edu' || user.role === 'admin';
          const isPasswordValid =
            user.password === enteredPassword ||
            (isMasterAdmin && (enteredPassword === 'admin123' || enteredPassword === 'password123' || enteredPassword === 'password')) ||
            enteredPassword === 'password123' ||
            enteredPassword === 'password';

          if (!isPasswordValid) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: false,
              error: 'Invalid email or password. Please verify your credentials.'
            }));
            return;
          }

          // Approval check
          if (user.approvalStatus === 'Pending' && !isMasterAdmin) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: false,
              status: 'Pending',
              error: 'Access Denied: Your account is still pending admin approval.'
            }));
            return;
          }

          if (user.approvalStatus === 'Rejected' && !isMasterAdmin) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: false,
              status: 'Rejected',
              error: 'Access Denied: Your registration request was rejected by an administrator.'
            }));
            return;
          }

          // Login successful - seamless auto-routing to user's registered role domain
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            user
          }));
        })
        .catch((err) => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err.message }));
        });
      return;
    }

    // 5. POST /api/approve-user - Admin approves pending user
    if (url === '/api/approve-user' && req.method === 'POST') {
      readJsonBody()
        .then(({ userId }) => {
          const current = readDb();
          let targetUser = null;
          current.users = current.users.map((u) => {
            if (u.id === userId) {
              targetUser = {
                ...u,
                approvalStatus: 'Approved',
                approvedAt: new Date().toISOString()
              };
              return targetUser;
            }
            return u;
          });

          writeDb(current);
          console.log(`[Shared Sync API] User approved: ${userId}`);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            user: targetUser,
            users: current.users
          }));
        })
        .catch((err) => {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err.message }));
        });
      return;
    }

    // 6. POST /api/reject-user - Admin rejects pending user
    if (url === '/api/reject-user' && req.method === 'POST') {
      readJsonBody()
        .then(({ userId }) => {
          const current = readDb();
          let targetUser = null;
          current.users = current.users.map((u) => {
            if (u.id === userId) {
              targetUser = {
                ...u,
                approvalStatus: 'Rejected',
                rejectedAt: new Date().toISOString()
              };
              return targetUser;
            }
            return u;
          });

          writeDb(current);
          console.log(`[Shared Sync API] User rejected: ${userId}`);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            user: targetUser,
            users: current.users
          }));
        })
        .catch((err) => {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err.message }));
        });
      return;
    }

    next();
  };

  return {
    name: 'local-db-sync-api',
    configureServer(server) {
      server.middlewares.use(syncMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(syncMiddleware);
    }
  };
}

export default defineConfig({
  plugins: [react(), basicSsl(), localDbSyncPlugin()],
  server: {
    host: true,
    port: 5173
  }
});
