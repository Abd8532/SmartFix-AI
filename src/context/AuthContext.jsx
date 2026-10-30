import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEYS = {
  TOKEN: 'maintainx_jwt_token_v3',
  CURRENT_USER: 'maintainx_current_user_v3'
};

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.TOKEN) || null;
    } catch {
      return null;
    }
  });

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

  // Auth headers helper
  const getAuthHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  // Sync current user session on mount
  useEffect(() => {
    if (!token) return;

    fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.success && data.user) {
          setCurrentUser(data.user);
          localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(data.user));
        } else if (data && !data.success) {
          // Token invalid or expired -> logout
          logout();
        }
      })
      .catch(() => {});
  }, [token]);

  // Fetch tenant users for admin
  const syncUsers = useCallback(async () => {
    if (!token || currentUser?.role !== 'admin') return;
    try {
      const res = await fetch('/api/v1/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          setUsers(data.users);
        }
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

  // 1. LOGIN (POST /api/v1/auth/login)
  const login = useCallback(async (email, password) => {
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        return {
          success: false,
          status: data.status || 'Error',
          error: data.error || 'Invalid email or password.'
        };
      }

      const receivedToken = data.token;
      const user = data.user;

      setToken(receivedToken);
      setCurrentUser(user);

      try {
        localStorage.setItem(STORAGE_KEYS.TOKEN, receivedToken);
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      } catch (e) {
        console.warn('Storage write failed:', e);
      }

      return { success: true, user, token: receivedToken };
    } catch (err) {
      return {
        success: false,
        error: 'Unable to connect to authentication server. Please check your network connection.'
      };
    }
  }, []);

  // 2. REGISTER (POST /api/v1/auth/register)
  const register = useCallback(async (userData) => {
    // Client-side guard against admin sign-up
    if (userData.role === 'admin') {
      return {
        success: false,
        error: 'Public administrator registration is prohibited. Administrator accounts must be provisioned internally.'
      };
    }

    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || 'Registration failed.'
        };
      }

      return {
        success: true,
        user: data.user,
        message: data.message
      };
    } catch (err) {
      return {
        success: false,
        error: 'Failed to connect to registration server.'
      };
    }
  }, []);

  // 3. ADMIN: APPROVE USER
  const approveUser = useCallback(async (userId) => {
    if (!token) return { success: false, error: 'Unauthorized' };
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, approvalStatus: 'Approved' } : u)));
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [token]);

  // 4. ADMIN: REJECT USER
  const rejectUser = useCallback(async (userId) => {
    if (!token) return { success: false, error: 'Unauthorized' };
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, approvalStatus: 'Rejected' } : u)));
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [token]);

  // 5. LOGOUT
  const logout = useCallback(() => {
    setToken(null);
    setCurrentUser(null);
    try {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
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
