/**
 * Centralized Authenticated API Client for SmartFix AI
 * Authoritative interface between the React UI and the Python backend.
 */

const STORAGE_KEYS = {
  TOKEN: 'maintainx_jwt_token_v1'
};

const BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL || '';

/**
 * Retrieve the current JWT token from storage
 */
export function getToken() {
  try {
    return localStorage.getItem(STORAGE_KEYS.TOKEN) || null;
  } catch {
    return null;
  }
}

/**
 * Save JWT token to storage
 */
export function setToken(token) {
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    } else {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
    }
  } catch (err) {
    console.warn('[ApiClient] Failed to persist token:', err);
  }
}

/**
 * Clear stored credentials
 */
export function clearToken() {
  try {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
  } catch {}
}

/**
 * Core HTTP request handler with unified error handling and token injection
 */
export async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const token = options.token || getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    const cleanToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    headers['Authorization'] = cleanToken;
  }

  const fetchConfig = {
    method: options.method || 'GET',
    headers
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
    login: (email, password) =>
      apiClient.post('/api/v1/auth/login', { email, password }),
    register: (userData) =>
      apiClient.post('/api/v1/auth/register', userData),
    getMe: () =>
      apiClient.get('/api/v1/auth/me')
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
    list: () =>
      apiClient.get('/api/v1/tickets'),
    get: (id) =>
      apiClient.get(`/api/v1/tickets/${id}`),
    create: (ticketData) =>
      apiClient.post('/api/v1/tickets', ticketData),
    techComplete: (id, resolutionNotes) =>
      apiClient.post(`/api/v1/tickets/${id}/tech-complete`, { resolutionNotes }),
    verifyClosure: (id) =>
      apiClient.post(`/api/v1/tickets/${id}/verify-closure`),
    rejectClosure: (id, rejectionReason) =>
      apiClient.post(`/api/v1/tickets/${id}/reject-closure`, { rejectionReason }),
    updateStatus: (id, status, resolutionNotes = '') =>
      apiClient.patch(`/api/v1/tickets/${id}/status`, { status, resolutionNotes }),
    delete: (id) =>
      apiClient.delete(`/api/v1/tickets/${id}`)
  }
};

export default apiClient;
