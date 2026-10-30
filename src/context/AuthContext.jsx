import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import apiClient, { clearToken } from '../services/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Auth headers helper for programmatic components
  const getAuthHeaders = useCallback(() => {
    return { 'Content-Type': 'application/json' };
  }, []);

  // Phase 6 Requirement 2: Restore session on mount using HttpOnly cookie credentials
  useEffect(() => {
    apiClient.auth.getMe()
      .then((data) => {
        if (data?.success && data?.user && data.user.approvalStatus === 'Approved') {
          setCurrentUser(data.user);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => {
        setCurrentUser(null);
      })
      .finally(() => {
        setIsLoadingAuth(false);
      });
  }, []);

  // Fetch tenant users for admin
  const syncUsers = useCallback(async () => {
    if (currentUser?.role !== 'admin') return;
    try {
      const data = await apiClient.admin.getUsers();
      if (data?.success && Array.isArray(data.users)) {
        setUsers(data.users);
      }
    } catch {}
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      syncUsers();
      const interval = setInterval(syncUsers, 4000);
      return () => clearInterval(interval);
    }
  }, [syncUsers, currentUser]);

  // 1. LOGIN (POST /api/v1/auth/login via apiClient)
  // Browser stores session in HttpOnly cookie; no JWT stored in localStorage
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

      const user = data.user;
      setCurrentUser(user);
      return { success: true, user };
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

  // 5. LOGOUT (Invalidates HttpOnly cookie and session on backend)
  const logout = useCallback(() => {
    try {
      apiClient.auth.logout().catch(() => {});
    } catch {}
    clearToken();
    setCurrentUser(null);
    setUsers([]);
    try {
      localStorage.removeItem('maintainx_current_user_v3');
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
    const updatedUser = { ...currentUser, ...updates };
    setCurrentUser(updatedUser);
    return { success: true, user: updatedUser };
  }, [currentUser]);

  // Filter pending and approved users
  const pendingUsers = useMemo(() => {
    return (users || []).filter((u) => u.approvalStatus === 'Pending' || u.status === 'pending');
  }, [users]);

  const approvedUsers = useMemo(() => {
    return (users || []).filter((u) => u.approvalStatus === 'Approved' || u.status === 'approved');
  }, [users]);

  const value = {
    currentUser,
    token: null, // Legacy compatibility (null to enforce HttpOnly cookie credentials)
    users: users || [],
    pendingUsers,
    approvedUsers,
    isLoadingAuth,
    isAuthenticated: Boolean(currentUser && currentUser.approvalStatus === 'Approved'),
    loginUser: login,
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
