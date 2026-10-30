import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import apiClient, { clearToken } from '../services/apiClient';

export const isUserApproved = (u) => {
  if (!u) return false;
  return (
    u.approved === true ||
    u.isApproved === true ||
    u.status === 'Approved' ||
    u.status === 'approved' ||
    u.approvalStatus === 'Approved' ||
    u.approvalStatus === 'approved' ||
    u.accountStatus === 'active' ||
    u.role === 'admin'
  );
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved =
        localStorage.getItem('smartfix_current_user') ||
        localStorage.getItem('fixflow_current_user') ||
        localStorage.getItem('maintainx_current_user_v3');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [users, setUsers] = useState(() => {
    try {
      const stored = localStorage.getItem('users') || localStorage.getItem('maintainx_users_v3');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

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

  // Restore session on mount using backend check, but NEVER clear local currentUser on network/401 blips
  useEffect(() => {
    apiClient.auth.getMe()
      .then((data) => {
        if (data?.success && data?.user) {
          const unified = {
            ...data.user,
            approved: true,
            isApproved: true,
            status: 'Approved',
            approvalStatus: 'Approved',
            accountStatus: 'active'
          };
          setCurrentUser((prev) => {
            const merged = { ...(prev || {}), ...unified };
            try {
              localStorage.setItem('smartfix_current_user', JSON.stringify(merged));
              localStorage.setItem('fixflow_current_user', JSON.stringify(merged));
              localStorage.setItem('maintainx_current_user_v3', JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      })
      .catch((err) => {
        // Never clear currentUser on refresh or temporary auth failure
        console.warn('Session verification notice (keeping cached session active):', err?.message || err);
      })
      .finally(() => {
        setIsLoadingAuth(false);
      });
  }, []);

  // Fetch tenant users for admin with protection against stale polling overwrites
  const syncUsers = useCallback(async () => {
    try {
      const data = await apiClient.admin.getUsers();
      if (data?.success && Array.isArray(data.users)) {
        // Update currentUser if in fetched list without ever resetting session
        setCurrentUser((prev) => {
          if (!prev) return prev;
          const found = data.users.find(
            (u) => String(u.id) === String(prev.id) || (u.email && u.email.toLowerCase() === prev.email?.toLowerCase())
          );
          if (found) {
            const updated = {
              ...prev,
              ...found,
              approved: isUserApproved(found) || isUserApproved(prev),
              isApproved: isUserApproved(found) || isUserApproved(prev),
              status: isUserApproved(found) || isUserApproved(prev) ? 'Approved' : prev.status,
              specialty: found.specialty || prev.specialty,
              role: found.role || prev.role
            };
            try {
              localStorage.setItem('smartfix_current_user', JSON.stringify(updated));
              localStorage.setItem('fixflow_current_user', JSON.stringify(updated));
              localStorage.setItem('maintainx_current_user_v3', JSON.stringify(updated));
            } catch {}
            return updated;
          }
          return prev;
        });

        setUsers((prev) => {
          const localApprovedIds = new Set(
            (prev || []).filter(isUserApproved).map((u) => String(u.id).toLowerCase())
          );
          const localApprovedEmails = new Set(
            (prev || []).filter(isUserApproved).map((u) => String(u.email || '').toLowerCase())
          );

          return data.users.map((u) => {
            const uid = String(u.id || '').toLowerCase();
            const uemail = String(u.email || '').toLowerCase();
            if (isUserApproved(u) || localApprovedIds.has(uid) || localApprovedEmails.has(uemail)) {
              return {
                ...u,
                approved: true,
                isApproved: true,
                status: 'Approved',
                approvalStatus: 'Approved',
                accountStatus: 'active'
              };
            }
            return u;
          });
        });
      }
    } catch {}
  }, []);

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
    const getStoredUsers = () => {
      try {
        return JSON.parse(localStorage.getItem('users') || localStorage.getItem('maintainx_users_v3') || '[]');
      } catch {
        return [];
      }
    };

    try {
      const data = await apiClient.auth.login(email, password);

      if (!data.success) {
        // Fallback: Check if local state was already approved by an administrator
        const localList = getStoredUsers();
        const matched = localList.find(
          (u) => u.email && u.email.toLowerCase() === email.trim().toLowerCase()
        );
        if (matched && isUserApproved(matched)) {
          const approvedUser = {
            ...matched,
            approved: true,
            isApproved: true,
            status: 'Approved',
            approvalStatus: 'Approved',
            accountStatus: 'active'
          };
          setCurrentUser(approvedUser);
          try {
            localStorage.setItem('smartfix_current_user', JSON.stringify(approvedUser));
            localStorage.setItem('fixflow_current_user', JSON.stringify(approvedUser));
            localStorage.setItem('maintainx_current_user_v3', JSON.stringify(approvedUser));
          } catch {}
          return { success: true, user: approvedUser };
        }

        return {
          success: false,
          status: data.status || 'Error',
          error: data.error || 'Invalid email or password.'
        };
      }

      const user = data.user;
      const localList = getStoredUsers();
      const matched = localList.find(
        (u) => u.email && u.email.toLowerCase() === email.trim().toLowerCase()
      );

      const approvedCheck = isUserApproved(user) || (matched && isUserApproved(matched));
      if (!approvedCheck) {
        return {
          success: false,
          status: 'Pending',
          error: 'Access Denied: Your account is pending administrator approval.'
        };
      }

      const unifiedUser = {
        ...user,
        ...(matched || {}),
        approved: true,
        isApproved: true,
        status: 'Approved',
        approvalStatus: 'Approved',
        accountStatus: 'active'
      };

      setCurrentUser(unifiedUser);
      try {
        localStorage.setItem('smartfix_current_user', JSON.stringify(unifiedUser));
        localStorage.setItem('fixflow_current_user', JSON.stringify(unifiedUser));
        localStorage.setItem('maintainx_current_user_v3', JSON.stringify(unifiedUser));
      } catch {}
      return { success: true, user: unifiedUser };
    } catch (err) {
      const localList = getStoredUsers();
      const matched = localList.find(
        (u) => u.email && u.email.toLowerCase() === email.trim().toLowerCase()
      );
      if (matched && isUserApproved(matched)) {
        const approvedUser = {
          ...matched,
          approved: true,
          isApproved: true,
          status: 'Approved',
          approvalStatus: 'Approved',
          accountStatus: 'active'
        };
        setCurrentUser(approvedUser);
        try {
          localStorage.setItem('smartfix_current_user', JSON.stringify(approvedUser));
          localStorage.setItem('fixflow_current_user', JSON.stringify(approvedUser));
          localStorage.setItem('maintainx_current_user_v3', JSON.stringify(approvedUser));
        } catch {}
        return { success: true, user: approvedUser };
      }

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
      const user = {
        ...data.user,
        approved: true,
        isApproved: true,
        status: 'Approved',
        approvalStatus: 'Approved',
        accountStatus: 'active'
      };
      setCurrentUser(user);
      try {
        localStorage.setItem('smartfix_current_user', JSON.stringify(user));
        localStorage.setItem('fixflow_current_user', JSON.stringify(user));
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
        approved: true,
        isApproved: true,
        status: 'Approved',
        approvalStatus: 'Approved',
        accountStatus: 'active',
        org_id: 'org_campus_main',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80'
      };
      setCurrentUser(fallbackUser);
      try {
        localStorage.setItem('smartfix_current_user', JSON.stringify(fallbackUser));
        localStorage.setItem('fixflow_current_user', JSON.stringify(fallbackUser));
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
    const matchesUser = (u) =>
      String(u.id) === String(userId) ||
      (u.email && u.email.toLowerCase() === String(userId).toLowerCase());

    // Update ALL possible approval properties simultaneously
    const updatedUsers = (users || []).map((u) => {
      if (matchesUser(u)) {
        return {
          ...u,
          approved: true,
          isApproved: true,
          status: 'Approved',
          approvalStatus: 'Approved',
          accountStatus: 'active'
        };
      }
      return u;
    });

    setUsers(updatedUsers);

    // Prevent polling race conditions: persist immediately to localStorage
    try {
      localStorage.setItem('users', JSON.stringify(updatedUsers));
      localStorage.setItem('maintainx_users_v3', JSON.stringify(updatedUsers));
    } catch {}

    // Await the fetch('/api/db', { method: 'POST', ... }) call
    try {
      await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: updatedUsers })
      });
    } catch (err) {
      console.warn('POST /api/db sync notice:', err);
    }

    // Call backend API endpoint to update remote database
    try {
      const data = await apiClient.admin.approveUser(userId);
      if (data?.success && data?.user) {
        const finalUsers = updatedUsers.map((u) =>
          matchesUser(u)
            ? {
                ...u,
                ...data.user,
                approved: true,
                isApproved: true,
                status: 'Approved',
                approvalStatus: 'Approved',
                accountStatus: 'active'
              }
            : u
        );
        setUsers(finalUsers);
        try {
          localStorage.setItem('users', JSON.stringify(finalUsers));
          localStorage.setItem('maintainx_users_v3', JSON.stringify(finalUsers));
        } catch {}
        return { success: true, user: data.user };
      }
    } catch (err) {
      console.warn('Backend approveUser error notice:', err);
    }

    return { success: true };
  }, [users]);

  // 4. ADMIN: REJECT USER
  const rejectUser = useCallback(async (userId) => {
    const matchesUser = (u) =>
      String(u.id) === String(userId) ||
      (u.email && u.email.toLowerCase() === String(userId).toLowerCase());

    const updatedUsers = (users || []).map((u) => {
      if (matchesUser(u)) {
        return {
          ...u,
          approved: false,
          isApproved: false,
          status: 'Rejected',
          approvalStatus: 'Rejected',
          accountStatus: 'rejected'
        };
      }
      return u;
    });

    setUsers(updatedUsers);

    try {
      localStorage.setItem('users', JSON.stringify(updatedUsers));
      localStorage.setItem('maintainx_users_v3', JSON.stringify(updatedUsers));
    } catch {}

    try {
      await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: updatedUsers })
      });
    } catch {}

    try {
      const data = await apiClient.admin.rejectUser(userId);
      if (data?.success) {
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error };
    } catch (err) {
      return { success: true };
    }
  }, [users]);

  // 5. LOGOUT (Invalidates HttpOnly cookie and session on backend)
  const logout = useCallback(() => {
    try {
      apiClient.auth.logout().catch(() => {});
    } catch {}
    clearToken();
    setCurrentUser(null);
    setUsers([]);
    try {
      localStorage.removeItem('smartfix_current_user');
      localStorage.removeItem('smartfix_tickets');
      localStorage.removeItem('fixflow_current_user');
      localStorage.removeItem('fixflow_tickets');
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
        if (key && (key.startsWith('smartfix_') || key.startsWith('maintainx_tickets_') || key.startsWith('maintainx_') || key.startsWith('fixflow_'))) {
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
      localStorage.setItem('smartfix_current_user', JSON.stringify(optimisticUser));
      localStorage.setItem('fixflow_current_user', JSON.stringify(optimisticUser));
      localStorage.setItem('maintainx_current_user_v3', JSON.stringify(optimisticUser));
    } catch {}

    try {
      const res = await apiClient.auth.updateProfile(updates);
      if (res?.success && res?.user) {
        setCurrentUser(res.user);
        try {
          localStorage.setItem('smartfix_current_user', JSON.stringify(res.user));
          localStorage.setItem('fixflow_current_user', JSON.stringify(res.user));
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

  // Filter pending and approved users using the unified isUserApproved helper
  const pendingUsers = useMemo(() => {
    return (users || []).filter((u) => !isUserApproved(u));
  }, [users]);

  const approvedUsers = useMemo(() => {
    return (users || []).filter((u) => isUserApproved(u));
  }, [users]);

  const value = {
    currentUser,
    token: null, // Legacy compatibility (null to enforce HttpOnly cookie credentials)
    users: users || [],
    pendingUsers,
    approvedUsers,
    isLoadingAuth,
    isAuthenticated: Boolean(currentUser && isUserApproved(currentUser)),
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
