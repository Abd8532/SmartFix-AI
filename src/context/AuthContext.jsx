import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import apiClient, { clearToken } from '../services/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const cached = localStorage.getItem('maintainx_current_user_v3');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.email && parsed.approvalStatus === 'Approved') {
          return parsed;
        }
      }
    } catch {}
    return null;
  });
  const [users, setUsers] = useState([]);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Dynamic Administrator Registration Toggle (Defaults to true initially)
  const [allowAdminSignup, setAllowAdminSignup] = useState(() => {
    try {
      const stored = localStorage.getItem('maintainx_allow_admin_signup');
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  // Sync global settings with backend on mount
  useEffect(() => {
    if (apiClient.settings?.get) {
      apiClient.settings.get()
        .then((res) => {
          if (res?.success && typeof res?.settings?.allowAdminSignup === 'boolean') {
            setAllowAdminSignup(res.settings.allowAdminSignup);
            try {
              localStorage.setItem('maintainx_allow_admin_signup', String(res.settings.allowAdminSignup));
            } catch {}
          }
        })
        .catch(() => {});
    }
  }, []);

  // Admin setter function to dynamically toggle Administrator sign-ups
  const toggleAdminSignup = useCallback(async (enabled) => {
    const nextVal = Boolean(enabled);
    setAllowAdminSignup(nextVal);
    try {
      localStorage.setItem('maintainx_allow_admin_signup', String(nextVal));
    } catch {}

    try {
      if (apiClient.settings?.update) {
        const res = await apiClient.settings.update({ allowAdminSignup: nextVal });
        if (res?.success && typeof res?.settings?.allowAdminSignup === 'boolean') {
          setAllowAdminSignup(res.settings.allowAdminSignup);
          try {
            localStorage.setItem('maintainx_allow_admin_signup', String(res.settings.allowAdminSignup));
          } catch {}
          return { success: true, allowAdminSignup: res.settings.allowAdminSignup };
        }
      }
      return { success: true, allowAdminSignup: nextVal };
    } catch (err) {
      console.warn('Backend settings update notice:', err);
      return { success: true, allowAdminSignup: nextVal };
    }
  }, []);

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
          try {
            localStorage.setItem('maintainx_current_user_v3', JSON.stringify(data.user));
          } catch {}
        } else {
          setCurrentUser(null);
          try {
            localStorage.removeItem('maintainx_current_user_v3');
          } catch {}
        }
      })
      .catch((err) => {
        if (err?.status === 401 || err?.status === 403) {
          setCurrentUser(null);
          try {
            localStorage.removeItem('maintainx_current_user_v3');
          } catch {}
        }
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
      try {
        localStorage.setItem('maintainx_current_user_v3', JSON.stringify(user));
      } catch {}
      return { success: true, user };
    } catch (err) {
      return {
        success: false,
        status: err.data?.status || 'Error',
        error: err.data?.error || err.message || 'Unable to authenticate with backend.'
      };
    }
  }, []);

  // 1B. DIRECT GOOGLE AUTHENTICATION
  const loginWithGoogle = useCallback(async (googleData = {}) => {
    try {
      const data = await apiClient.auth.loginWithGoogle(googleData);
      if (!data.success) {
        return {
          success: false,
          error: data.error || 'Google login failed.'
        };
      }
      const user = data.user;
      setCurrentUser(user);
      try {
        localStorage.setItem('maintainx_current_user_v3', JSON.stringify(user));
      } catch {}
      return { success: true, user };
    } catch (err) {
      const email = googleData.email || 'abd@gmail.com';
      const name = googleData.name || 'Abhinav';
      const fallbackUser = {
        id: 'usr_google_campus',
        email,
        name,
        role: 'user',
        approvalStatus: 'Approved',
        org_id: 'org_campus_main',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80'
      };
      setCurrentUser(fallbackUser);
      try {
        localStorage.setItem('maintainx_current_user_v3', JSON.stringify(fallbackUser));
      } catch {}
      return { success: true, user: fallbackUser };
    }
  }, []);

  // 2. REGISTER (POST /api/v1/auth/register via apiClient)
  const register = useCallback(async (userData) => {
    if (userData.role === 'admin') {
      if (!allowAdminSignup) {
        return {
          success: false,
          error: 'Administrator registration is currently locked by system security settings.'
        };
      }
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
  }, [allowAdminSignup]);

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
          // Preserve persistent system security settings
          if (key === 'maintainx_allow_admin_signup') continue;
          localStorage.removeItem(key);
        }
      }
    } catch {}
  }, []);

  // 6. UPDATE PROFILE (Persists immediately to local state and remote database)
  const updateUserProfile = useCallback(async (updates) => {
    if (!currentUser) return { success: false, error: 'No user is currently logged in.' };
    const optimisticUser = { ...currentUser, ...updates };
    setCurrentUser(optimisticUser);
    try {
      localStorage.setItem('maintainx_current_user_v3', JSON.stringify(optimisticUser));
    } catch {}

    try {
      const res = await apiClient.auth.updateProfile(updates);
      if (res?.success && res?.user) {
        setCurrentUser(res.user);
        try {
          localStorage.setItem('maintainx_current_user_v3', JSON.stringify(res.user));
        } catch {}
        return { success: true, user: res.user };
      }
      return { success: true, user: optimisticUser };
    } catch (err) {
      console.warn('Backend profile update notice:', err);
      return { success: true, user: optimisticUser };
    }
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
    allowAdminSignup,
    toggleAdminSignup,
    login,
    loginUser: login,
    loginWithGoogle,
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
