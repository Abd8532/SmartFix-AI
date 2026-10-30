import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE_PATH = path.resolve(__dirname, 'db.json');

function localDbSyncPlugin() {
  return {
    name: 'local-db-sync-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ? req.url.split('?')[0] : '';
        if (url === '/api/db') {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body || '{}');
                let dbData = { users: [], tickets: [], organizations: [], audit_logs: [], system_settings: {} };
                if (fs.existsSync(DB_FILE_PATH)) {
                  try {
                    dbData = JSON.parse(fs.readFileSync(DB_FILE_PATH, 'utf-8'));
                  } catch (e) {
                    console.error('Error reading db.json in vite middleware:', e);
                  }
                }

                if (Array.isArray(payload.users)) {
                  // Merge users by id while strictly preserving existing tickets
                  const existingUsers = Array.isArray(dbData.users) ? dbData.users : [];
                  const userMap = new Map();
                  existingUsers.forEach((u) => {
                    const k = String(u.id || u.email || '').toLowerCase();
                    if (k) userMap.set(k, u);
                  });
                  payload.users.forEach((u) => {
                    const k = String(u.id || u.email || '').toLowerCase();
                    if (k) userMap.set(k, { ...(userMap.get(k) || {}), ...u });
                  });
                  dbData.users = Array.from(userMap.values());
                }
                if (Array.isArray(payload.tickets)) {
                  // Merge tickets by id while strictly preserving existing users
                  const existingTickets = Array.isArray(dbData.tickets) ? dbData.tickets : [];
                  const ticketMap = new Map();
                  existingTickets.forEach((t) => {
                    if (t?.id) ticketMap.set(String(t.id), t);
                  });
                  payload.tickets.forEach((t) => {
                    if (t?.id) ticketMap.set(String(t.id), { ...(ticketMap.get(String(t.id)) || {}), ...t });
                  });
                  dbData.tickets = Array.from(ticketMap.values());
                }
                if (payload.system_settings) {
                  dbData.system_settings = { ...dbData.system_settings, ...payload.system_settings };
                }

                fs.writeFileSync(DB_FILE_PATH, JSON.stringify(dbData, null, 2), 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, users: dbData.users, tickets: dbData.tickets }));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
            return;
          }

          if (req.method === 'GET') {
            try {
              const content = fs.existsSync(DB_FILE_PATH) ? fs.readFileSync(DB_FILE_PATH, 'utf-8') : '{"users":[],"tickets":[]}';
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(content);
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
            return;
          }
        }
        next();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

  return {
    plugins: [react(), basicSsl(), localDbSyncPlugin()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (err, req, res) => {
              if (res && !res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: false,
                  error: 'Python backend unavailable. Ensure the backend server is running on http://127.0.0.1:8000 (execute: python run_backend.py).'
                }));
              }
            });
          }
        }
      }
    }
  };
});
