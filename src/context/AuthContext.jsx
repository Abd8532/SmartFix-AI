import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import apiClient, { getToken, setToken as saveTokenToStorage, clearToken } from '../services/apiClient';

const AuthContext = createContext(null);

const STORAGE_KEYS = {
  CURRENT_USER: 'maintainx_current_user_v3'
};

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken());

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.approvalStatus === 'Approved') {
          return parsed;
        }
      }
    } catch {
      return null;
    }
    return null;
  });

  const [users, setUsers] = useState([]);

  // Auth headers helper for components that need headers directly
  const getAuthHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    const currentTok = token || getToken();
    if (currentTok) {
      headers['Authorization'] = `Bearer ${currentTok}`;
    }
    return headers;
  }, [token]);

  // Sync current user session on mount using centralized API client
  useEffect(() => {
    const currentTok = token || getToken();
    if (!currentTok) return;

    apiClient.auth.getMe()
      .then((data) => {
        if (data && data.success && data.user) {
          setCurrentUser(data.user);
          localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(data.user));
        } else {
          logout();
        }
      })
      .catch((err) => {
        if (err.status === 401 || err.status === 403) {
          logout();
        }
      });
  }, [token]);

  // Fetch tenant users for admin
  const syncUsers = useCallback(async () => {
    const currentTok = token || getToken();
    if (!currentTok || currentUser?.role !== 'admin') return;
    try {
      const data = await apiClient.admin.getUsers();
      if (data.success && Array.isArray(data.users)) {
        setUsers(data.users);
      }
    } catch {}
  }, [token, currentUser]);

  useEffect(() => {
    syncUsers();
    if (currentUser?.role === 'admin') {
      const interval = setInterval(syncUsers, 3000);
      return () => clearInterval(interval);
    }
  }, [syncUsers, currentUser]);

  // 1. LOGIN (POST /api/v1/auth/login via apiClient)
  const login = useCallback(async (email, password) => {
    try {
      const data = await apiClient.auth.login(email, password);

      if (!data.success) {
        return {
          success: false,
          status: data.status || 'Error',
          error: data.error || 'Invalid email or password.'
        };
      }

      const receivedToken = data.token;
      const user = data.user;

      saveTokenToStorage(receivedToken);
      setTokenState(receivedToken);
      setCurrentUser(user);

      try {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      } catch (e) {
        console.warn('Storage write failed:', e);
      }

      return { success: true, user, token: receivedToken };
    } catch (err) {
      return {
        success: false,
        status: err.data?.status || 'Error',
        error: err.data?.error || err.message || 'Unable to authenticate with backend.'
      };
    }
  }, []);

  // 2. REGISTER (POST /api/v1/auth/register via apiClient)
  const register = useCallback(async (userData) => {
    if (userData.role === 'admin') {
      return {
        success: false,
        error: 'Public administrator registration is prohibited. Administrator accounts must be provisioned internally.'
      };
    }

    try {
      const data = await apiClient.auth.register(userData);
      return {
        success: true,
        user: data.user,
        message: data.message
      };
    } catch (err) {
      return {
        success: false,
        error: err.data?.error || err.message || 'Registration failed.'
      };
    }
  }, []);

  // 3. ADMIN: APPROVE USER
  const approveUser = useCallback(async (userId) => {
    try {
      const data = await apiClient.admin.approveUser(userId);
      if (data.success) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, approvalStatus: 'Approved' } : u)));
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error };
    } catch (err) {
      return { success: false, error: err.data?.error || err.message };
    }
  }, []);

  // 4. ADMIN: REJECT USER
  const rejectUser = useCallback(async (userId) => {
    try {
      const data = await apiClient.admin.rejectUser(userId);
      if (data.success) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, approvalStatus: 'Rejected' } : u)));
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error };
    } catch (err) {
      return { success: false, error: err.data?.error || err.message };
    }
  }, []);

  // 5. LOGOUT
  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setCurrentUser(null);
    setUsers([]);
    try {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      localStorage.removeItem('maintainx_tickets_v1');
      localStorage.removeItem('maintainx_tickets_v3');
      localStorage.removeItem('maintainx_tickets');
      localStorage.removeItem('maintainx_role_v1');
      localStorage.removeItem('maintainx_jwt_token_v1');
      localStorage.removeItem('maintainx_active_user');
      // Clean up all scoped ticket caches across tenants/users
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('maintainx_tickets_') || key.startsWith('maintainx_'))) {
          localStorage.removeItem(key);
        }
      }
    } catch {}
  }, []);

  // 6. UPDATE PROFILE
  const updateUserProfile = useCallback((updates) => {
    if (!currentUser) return { success: false, error: 'No user is currently logged in.' };
    const updated = { ...currentUser, ...updates };
    setCurrentUser(updated);
    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updated));
    } catch {}
    return { success: true, user: updated };
  }, [currentUser]);

  const pendingUsers = useMemo(
    () => users.filter((u) => u.approvalStatus === 'Pending' && u.role !== 'admin'),
    [users]
  );

  const approvedUsers = useMemo(
    () => users.filter((u) => u.approvalStatus === 'Approved'),
    [users]
  );

  const value = {
    token,
    currentUser,
    users,
    pendingUsers,
    approvedUsers,
    login,
    loginUser: login,
    register,
    registerUser: register,
    approveUser,
    rejectUser,
    logout,
    updateUserProfile,
    getAuthHeaders,
    setCurrentUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
