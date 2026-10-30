/**
 * Centralized Authenticated API Client for SmartFix AI
 * Authoritative interface between the React UI and the Python backend.
 *
 * Phase 6 Requirement 2: Pure HttpOnly cookie session architecture.
 * - Stops persisting JWTs in localStorage.
 * - Transmits credentials via HttpOnly, Secure, SameSite=Strict cookies.
 * - Enforces double-submit CSRF cookie protection (X-CSRF-Token).
 * - Retains in-memory Bearer token injection only for non-browser programmatic clients.
 */

const STORAGE_KEYS = {
  CSRF: 'maintainx_csrf_token_v1'
};

const BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL || '';

// In-memory token storage (never written to localStorage) for non-browser/programmatic usage
let inMemoryBearerToken = null;

/**
 * Retrieve current in-memory Bearer token (non-persistent)
 */
export function getToken() {
  return inMemoryBearerToken;
}

/**
 * Set in-memory token for non-browser clients (avoids localStorage persistence)
 */
export function setToken(token) {
  inMemoryBearerToken = token || null;
}

/**
 * Clear all in-memory credentials and legacy keys
 */
export function clearToken() {
  inMemoryBearerToken = null;
  try {
    localStorage.removeItem('maintainx_jwt_token_v1');
    localStorage.removeItem('maintainx_jwt_token');
  } catch {}
}

/**
 * Retrieve current CSRF token from sessionStorage or document.cookie
 */
export function getCsrfToken() {
  try {
    const fromSession = sessionStorage.getItem(STORAGE_KEYS.CSRF);
    if (fromSession) return fromSession;
    if (typeof document !== 'undefined' && document.cookie) {
      const match = document.cookie.match(/(?:^|;\s*)smartfix_csrf=([^;]+)/);
      if (match) {
        const val = decodeURIComponent(match[1].trim());
        sessionStorage.setItem(STORAGE_KEYS.CSRF, val);
        return val;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save CSRF token in sessionStorage
 */
export function setCsrfToken(csrfToken) {
  try {
    if (csrfToken) {
      sessionStorage.setItem(STORAGE_KEYS.CSRF, csrfToken);
    } else {
      sessionStorage.removeItem(STORAGE_KEYS.CSRF);
    }
  } catch {}
}

/**
 * Clear CSRF token
 */
export function clearCsrfToken() {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.CSRF);
  } catch {}
}

/**
 * Core HTTP request handler with unified error handling, HttpOnly session cookies,
 * and double-submit CSRF protection.
 */
export async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const token = options.token || inMemoryBearerToken;
  let csrfToken = getCsrfToken();
  const method = (options.method || 'GET').toUpperCase();

  // If making a state-changing mutation under cookie session without a cached CSRF token,
  // proactively fetch the CSRF token from /api/v1/auth/me so the mutation never fails with 403
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
    !csrfToken &&
    !token &&
    endpoint !== '/api/v1/auth/login' &&
    endpoint !== '/api/v1/auth/register'
  ) {
    try {
      const meRes = await fetch(`${BASE_URL}/api/v1/auth/me`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData?.csrfToken) {
          csrfToken = meData.csrfToken;
          setCsrfToken(csrfToken);
        }
      }
    } catch (e) {
      console.warn('Proactive CSRF token sync notice:', e);
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  // Programmatic Bearer token if explicitly provided (non-browser clients)
  if (token) {
    const cleanToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    headers['Authorization'] = cleanToken;
  }

  // Attach CSRF protection token for all state-changing HTTP requests
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const fetchConfig = {
    method,
    headers,
    credentials: 'include' // Always transmit HttpOnly session cookies for backend verification
  };

  if (options.body !== undefined) {
    fetchConfig.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(url, fetchConfig);
  } catch (networkError) {
    const err = new Error(`Network failure connecting to backend: ${networkError.message}`);
    err.status = 0;
    err.isNetworkError = true;
    throw err;
  }

  // Parse JSON response safely
  let data;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = {};
    }
  } else {
    const text = await response.text();
    data = { message: text };
  }

  if (!response.ok) {
    const errorMessage =
      data?.error ||
      data?.message ||
      `Request failed with HTTP status ${response.status} (${response.statusText})`;
    const error = new Error(errorMessage);
    error.status = response.status;
    error.statusText = response.statusText;
    error.data = data;
    throw error;
  }

  return data;
}

// REST shorthand utilities
export const apiClient = {
  get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'POST', body }),
  patch: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PATCH', body }),
  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),

  // Auth Endpoints
  auth: {
    login: async (email, password) => {
      const data = await apiClient.post('/api/v1/auth/login', { email, password });
      // Update CSRF token for double-submit cookie pattern
      if (data?.csrfToken) setCsrfToken(data.csrfToken);
      // Browser relies on HttpOnly smartfix_session cookie; do NOT persist JWT in localStorage
      return data;
    },
    logout: async () => {
      try {
        await apiClient.post('/api/v1/auth/logout');
      } finally {
        clearToken();
        clearCsrfToken();
      }
    },
    register: (userData) =>
      apiClient.post('/api/v1/auth/register', userData),
    getMe: async () => {
      const data = await apiClient.get('/api/v1/auth/me');
      if (data?.csrfToken) setCsrfToken(data.csrfToken);
      return data;
    },
    updateProfile: async (profileData) => {
      const data = await apiClient.patch('/api/v1/users/profile', profileData);
      if (data?.csrfToken) setCsrfToken(data.csrfToken);
      return data;
    }
  },

  // Admin Endpoints
  admin: {
    getUsers: () =>
      apiClient.get('/api/v1/admin/users'),
    approveUser: (userId) =>
      apiClient.post(`/api/v1/admin/users/${userId}/approve`),
    rejectUser: (userId) =>
      apiClient.post(`/api/v1/admin/users/${userId}/reject`),
    getAuditLogs: () =>
      apiClient.get('/api/v1/audit-logs')
  },

  // Ticket Lifecycle Endpoints
  tickets: {
    list: (params = {}) => {
      const q = params.queue ? `?queue=${encodeURIComponent(params.queue)}` : '';
      return apiClient.get(`/api/v1/tickets${q}`);
    },
    listClaimable: () =>
      apiClient.get('/api/v1/tickets/claimable'),
    get: (id) =>
      apiClient.get(`/api/v1/tickets/${id}`),
    create: (ticketData) =>
      apiClient.post('/api/v1/tickets', ticketData),
    verifyImage: (payload) =>
      apiClient.post('/api/v1/tickets/verify-image', payload),
    claim: (id, version) =>
      apiClient.post(`/api/v1/tickets/${id}/claim`, { version }),
    techComplete: (id, resolutionNotes, version) =>
      apiClient.post(`/api/v1/tickets/${id}/tech-complete`, { resolutionNotes, version }),
    verifyClosure: (id, version) =>
      apiClient.post(`/api/v1/tickets/${id}/verify-closure`, { version }),
    rejectClosure: (id, rejectionReason, version) =>
      apiClient.post(`/api/v1/tickets/${id}/reject-closure`, { rejectionReason, version }),
    updateStatus: (id, status, resolutionNotes = '', version) =>
      apiClient.patch(`/api/v1/tickets/${id}/status`, { status, resolutionNotes, version }),
    delete: (id) =>
      apiClient.delete(`/api/v1/tickets/${id}`)
  },

  // Uploads & Private S3 Storage
  uploads: {
    presign: (fileData) =>
      apiClient.post('/api/v1/uploads/presign', fileData),
    uploadToS3: async (presignResponse, binaryData, mimeType) => {
      const targetUrl = typeof presignResponse === 'string' ? presignResponse : presignResponse?.uploadUrl;

      // In local development/test environments where S3 is simulated (?mock_presigned=true),
      // avoid firing a browser network request to a non-existent AWS domain which causes CORS net::ERR_FAILED.
      if (targetUrl && (targetUrl.includes('mock_presigned=true') || targetUrl.includes('mock-s3'))) {
        console.info('[Dev S3] Presigned upload simulated in local environment for key:', presignResponse?.fileKey);
        return true;
      }

      // S3 Presigned POST flow (fields provided with policy conditions)
      if (presignResponse && typeof presignResponse === 'object' && presignResponse.fields) {
        const formData = new FormData();
        Object.entries(presignResponse.fields).forEach(([k, v]) => formData.append(k, v));
        formData.append('file', binaryData);
        const response = await fetch(presignResponse.uploadUrl, {
          method: 'POST',
          body: formData
        });
        if (!response.ok) {
          throw new Error(`S3 direct upload failed with status ${response.status}`);
        }
        return true;
      }

      // S3 Presigned PUT flow
      const response = await fetch(targetUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType
        },
        body: binaryData
      });
      if (!response.ok) {
        throw new Error(`S3 direct upload failed with status ${response.status}`);
      }
      return true;
    },
    getViewUrl: (fileKey, ticketId) => {
      const q = ticketId ? `&ticket_id=${encodeURIComponent(ticketId)}` : '';
      return apiClient.get(`/api/v1/uploads/presigned-view?key=${encodeURIComponent(fileKey)}${q}`);
    }
  }
};

export default apiClient;
