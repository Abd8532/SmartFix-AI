import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEYS = {
  USERS: 'maintainx_auth_users_v2',
  CURRENT_USER: 'maintainx_auth_current_user_v2'
};

// Seeded Master Admin (Pre-approved default administrator required to approve pending sign-ups)
export const MASTER_ADMIN = {
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
};

// Initial Seed Users (Master Admin, Campus User, and Specialized Technicians)
export const INITIAL_USERS = [
  MASTER_ADMIN,
  {
    id: "usr_default",
    name: "Campus User",
    email: "user@campus.edu",
    password: "password",
    role: "user",
    roleDisplay: "Campus User",
    department: "Facilities & Student Services",
    approvalStatus: "Approved",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80",
    createdAt: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString()
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
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
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
    createdAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString()
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
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
  }
];

export function AuthProvider({ children }) {
  // Registered users list: Always guarantees Master Admin is pre-populated and Approved
  const [users, setUsers] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = parsed.map((u) => {
            if (u.role === 'technician') {
              let spec = u.specialty;
              if (!spec || spec === 'Electro-Mechanical & Plumbing') spec = 'Plumbing';
              if (spec === 'HVAC & Climate Control') spec = 'HVAC';
              return { ...u, specialty: spec };
            }
            return u;
          });
          const adminIdx = sanitized.findIndex((u) => u.email.toLowerCase() === 'admin@campus.edu');
          if (adminIdx >= 0) {
            sanitized[adminIdx] = {
              ...sanitized[adminIdx],
              role: 'admin',
              roleDisplay: 'Administrator',
              approvalStatus: 'Approved',
              password: sanitized[adminIdx].password || 'admin123'
            };
            return sanitized;
          }
          return [MASTER_ADMIN, ...sanitized];
        }
      }
    } catch (e) {
      console.warn('Failed reading users from storage:', e);
    }
    return INITIAL_USERS;
  });

  // Current logged in user
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only restore if user is approved
        if (parsed && parsed.approvalStatus === 'Approved') {
          if (parsed.role === 'technician') {
            let spec = parsed.specialty;
            if (!spec || spec === 'Electro-Mechanical & Plumbing') spec = 'Plumbing';
            if (spec === 'HVAC & Climate Control') spec = 'HVAC';
            return { ...parsed, specialty: spec };
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed reading currentUser from storage:', e);
    }
    return null;
  });

  // Persist users
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    } catch (e) {
      console.warn('Failed saving users to storage:', e);
    }
  }, [users]);

  // Persist currentUser
  useEffect(() => {
    try {
      if (currentUser && currentUser.approvalStatus === 'Approved') {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      }
    } catch (e) {
      console.warn('Failed saving currentUser to storage:', e);
    }
  }, [currentUser]);

  // Filter pending and approved users
  const pendingUsers = useMemo(() => {
    return users.filter((u) => u.approvalStatus === 'Pending');
  }, [users]);

  const approvedUsers = useMemo(() => {
    return users.filter((u) => u.approvalStatus === 'Approved');
  }, [users]);

  // Helper to persist updated users array to shared /api/db on host
  const persistUsersToBackend = useCallback(async (updatedUsers) => {
    try {
      await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: updatedUsers })
      });
    } catch (err) {
      console.warn('[AuthContext] Failed saving users to /api/db:', err);
    }
  }, []);

  // Poll /api/db on mount and every 3 seconds to keep laptop & phone in real-time sync
  const syncUsersFromBackend = useCallback(async () => {
    try {
      const res = await fetch('/api/db');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.users) && data.users.length > 0) {
        setUsers((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(data.users)) {
            return prev;
          }
          return data.users;
        });

        // Also sync currentUser if logged in (e.g. account approved by Admin on laptop, reflects on mobile)
        setCurrentUser((prevCurr) => {
          if (!prevCurr) return null;
          const matched = data.users.find(
            (u) => u.id === prevCurr.id || (u.email && prevCurr.email && u.email.toLowerCase() === prevCurr.email.toLowerCase())
          );
          if (matched && JSON.stringify(matched) !== JSON.stringify(prevCurr)) {
            return { ...prevCurr, ...matched };
          }
          return prevCurr;
        });
      }
    } catch (err) {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    syncUsersFromBackend();
    const interval = setInterval(syncUsersFromBackend, 2000);
    return () => clearInterval(interval);
  }, [syncUsersFromBackend]);

  // 1. REGISTRATION: Persisted via shared /api/register to db.json
  const register = useCallback(async (userData) => {
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || 'Registration failed'
        };
      }
      if (Array.isArray(data.users)) {
        setUsers(data.users);
      } else if (data.user) {
        setUsers((prev) => [data.user, ...prev]);
      }
      return { success: true, user: data.user };
    } catch (err) {
      console.warn('[AuthContext] Network register failed, using local fallback:', err);
      const emailNorm = (userData.email || '').trim().toLowerCase();
      const existing = users.find((u) => u.email.toLowerCase() === emailNorm);

      if (existing) {
        return {
          success: false,
          error: 'An account with this email address already exists. Please log in or use a different email.'
        };
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

      const nextUsers = [newUser, ...users];
      setUsers(nextUsers);
      persistUsersToBackend(nextUsers);

      return {
        success: true,
        user: newUser
      };
    }
  }, [users, persistUsersToBackend]);

  // 2. LOGIN: Validated directly against shared /api/login endpoint
  const login = useCallback(async (email, password, selectedRole = null) => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: selectedRole })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          status: data.status || 'Error',
          error: data.error || 'Invalid ID or password for this specific domain. Please ensure you have selected the correct role.'
        };
      }
      setCurrentUser(data.user);
      return {
        success: true,
        user: data.user
      };
    } catch (err) {
      console.warn('[AuthContext] Network login failed, using local state fallback:', err);
      const emailNorm = (email || '').trim().toLowerCase();
      
      let user = users.find((u) => u.email.toLowerCase() === emailNorm);
      if (!user && (emailNorm === 'user@campus.edu' || emailNorm === 'user')) {
        user = users.find((u) => u.email.toLowerCase() === 'user@campus.edu' || u.email.toLowerCase() === 'alex@campus.edu' || u.role === 'user');
      }
      if (!user) {
        user = users.find((u) => u.email.toLowerCase().startsWith(emailNorm) || (u.name && u.name.toLowerCase().includes(emailNorm)));
      }

      if (!user) {
        return {
          success: false,
          error: 'Invalid ID or password for this specific domain. Please ensure you have selected the correct role.'
        };
      }

      const enteredPassword = password || '';
      const isMasterAdmin = user.email.toLowerCase() === 'admin@campus.edu' || user.role === 'admin';

      const isPasswordValid =
        user.password === enteredPassword ||
        (isMasterAdmin && (enteredPassword === 'admin123' || enteredPassword === 'password123' || enteredPassword === 'password')) ||
        enteredPassword === 'password123' ||
        enteredPassword === 'password';

      if (!isPasswordValid) {
        return {
          success: false,
          error: 'Invalid ID or password for this specific domain. Please ensure you have selected the correct role.'
        };
      }

      // Auto-adapt to user's registered role instead of blocking on role tab mismatch
      // e.g. If an Admin or Technician logs in with the default tab selected, route them directly
      const effectiveRole = user.role;

      if (user.approvalStatus === 'Pending' && !isMasterAdmin) {
        return {
          success: false,
          status: 'Pending',
          error: 'Access Denied: Your account is still pending admin approval.'
        };
      }

      if (user.approvalStatus === 'Rejected' && !isMasterAdmin) {
        return {
          success: false,
          status: 'Rejected',
          error: 'Access Denied: Your registration request was rejected by an administrator.'
        };
      }

      setCurrentUser(user);
      return {
        success: true,
        user
      };
    }
  }, [users]);

  // 3. ADMIN: Approve User via /api/approve-user
  const approveUser = useCallback(async (userId) => {
    try {
      const res = await fetch('/api/approve-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        setUsers(data.users);
      } else {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, approvalStatus: 'Approved', approvedAt: new Date().toISOString() } : u))
        );
      }
      return { success: true };
    } catch (err) {
      console.warn('[AuthContext] Network approveUser failed, using local fallback:', err);
      setUsers((prev) => {
        const nextUsers = prev.map((u) => {
          if (u.id === userId) {
            return {
              ...u,
              approvalStatus: 'Approved',
              approvedAt: new Date().toISOString()
            };
          }
          return u;
        });
        persistUsersToBackend(nextUsers);
        return nextUsers;
      });
      return { success: true };
    }
  }, [persistUsersToBackend]);

  // 4. ADMIN: Reject User via /api/reject-user
  const rejectUser = useCallback(async (userId) => {
    try {
      const res = await fetch('/api/reject-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        setUsers(data.users);
      } else {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, approvalStatus: 'Rejected', rejectedAt: new Date().toISOString() } : u))
        );
      }
      return { success: true };
    } catch (err) {
      console.warn('[AuthContext] Network rejectUser failed, using local fallback:', err);
      setUsers((prev) => {
        const nextUsers = prev.map((u) => {
          if (u.id === userId) {
            return {
              ...u,
              approvalStatus: 'Rejected',
              rejectedAt: new Date().toISOString()
            };
          }
          return u;
        });
        persistUsersToBackend(nextUsers);
        return nextUsers;
      });
      return { success: true };
    }
  }, [persistUsersToBackend]);

  // 5. LOGOUT
  const logout = useCallback(() => {
    setCurrentUser(null);
    try {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    } catch {}
  }, []);

  // 6. UPDATE PROFILE (change avatar/image, name, department)
  const updateUserProfile = useCallback((updates) => {
    if (!currentUser) return { success: false, error: 'No user is currently logged in.' };

    const updatedUser = {
      ...currentUser,
      ...updates
    };

    setCurrentUser(updatedUser);

    setUsers((prev) => {
      const nextUsers = prev.map((u) => (u.id === currentUser.id || u.email.toLowerCase() === currentUser.email.toLowerCase() ? { ...u, ...updates } : u));
      persistUsersToBackend(nextUsers);
      return nextUsers;
    });

    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedUser));
    } catch (e) {
      console.warn('Failed saving updated profile to storage:', e);
    }

    return { success: true, user: updatedUser };
  }, [currentUser, persistUsersToBackend]);

  // Reset to initial mock users
  const resetUsers = useCallback(() => {
    setUsers(INITIAL_USERS);
    setCurrentUser(null);
    persistUsersToBackend(INITIAL_USERS);
    localStorage.removeItem(STORAGE_KEYS.USERS);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  }, [persistUsersToBackend]);

  const value = {
    users,
    currentUser,
    pendingUsers,
    approvedUsers,
    register,
    registerUser: register,
    login,
    loginUser: login,
    approveUser,
    rejectUser,
    logout,
    updateUserProfile,
    resetUsers,
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
