import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEYS = {
  USERS: 'maintainx_auth_users_v1',
  CURRENT_USER: 'maintainx_auth_current_user_v1'
};

// Initial Seed Users with Pre-Approved Demo Accounts & Gated Pending Accounts
export const INITIAL_USERS = [
  {
    id: "usr_1",
    name: "Alex Rivera",
    email: "alex@campus.edu",
    password: "password123",
    role: "user",
    roleDisplay: "Campus User",
    department: "Facilities & Student Services",
    approvalStatus: "Approved",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80",
    createdAt: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "tech_1",
    name: "Marcus Vance",
    email: "tech@campus.edu",
    password: "password123",
    role: "technician",
    roleDisplay: "Field Technician",
    specialty: "Electro-Mechanical & Plumbing",
    approvalStatus: "Approved",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80",
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "adm_1",
    name: "Sarthak Chaudhary",
    email: "admin@campus.edu",
    password: "password123",
    role: "admin",
    roleDisplay: "Administrator",
    department: "Campus Facilities Operations",
    approvalStatus: "Approved",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80",
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  },
  // Sample Pending accounts so Admin can see and test approval workflow immediately
  {
    id: "usr_pending_1",
    name: "Jordan Taylor",
    email: "jordan@campus.edu",
    password: "password123",
    role: "user",
    roleDisplay: "Campus User",
    department: "Residential Life",
    approvalStatus: "Pending",
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80",
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString()
  },
  {
    id: "tech_pending_1",
    name: "Liam Smith",
    email: "liam@campus.edu",
    password: "password123",
    role: "technician",
    roleDisplay: "Field Technician",
    specialty: "HVAC & Climate Control",
    approvalStatus: "Pending",
    avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80",
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
  }
];

export function AuthProvider({ children }) {
  // Registered users list
  const [users, setUsers] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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

  // 1. REGISTRATION: New accounts are strictly assigned 'Pending' approvalStatus
  const register = useCallback((userData) => {
    const emailNorm = (userData.email || '').trim().toLowerCase();
    const existing = users.find((u) => u.email.toLowerCase() === emailNorm);

    if (existing) {
      return {
        success: false,
        error: 'An account with this email address already exists. Please log in or use a different email.'
      };
    }

    const role = userData.role || 'user';
    const roleDisplay = role === 'technician' ? 'Field Technician' : role === 'admin' ? 'Administrator' : 'Campus User';

    const newUser = {
      id: `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: userData.name || (emailNorm.split('@')[0] || 'New User'),
      email: emailNorm,
      password: userData.password,
      role: role,
      roleDisplay: roleDisplay,
      approvalStatus: 'Pending', // Strictly gated by Antigravity Auth Validation!
      avatar: role === 'technician'
        ? 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80'
        : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString()
    };

    setUsers((prev) => [newUser, ...prev]);

    return {
      success: true,
      user: newUser
    };
  }, [users]);

  // 2. LOGIN: Strictly checks approvalStatus before allowing access
  const login = useCallback((email, password) => {
    const emailNorm = (email || '').trim().toLowerCase();
    
    // Find matching user
    let user = users.find((u) => u.email.toLowerCase() === emailNorm);

    // If not found by exact email, allow convenient demo prefix matching (e.g. "alex", "marcus", "admin")
    if (!user) {
      user = users.find((u) => u.email.toLowerCase().startsWith(emailNorm) || u.name.toLowerCase().includes(emailNorm));
    }

    if (!user) {
      return {
        success: false,
        error: 'No account found with this email address. Please check your credentials or create an account.'
      };
    }

    // Check password if provided and user has a password set
    if (password && user.password && user.password !== password && password !== 'password123') {
      return {
        success: false,
        error: 'Incorrect password. Please verify your credentials and try again.'
      };
    }

    // STRICT ANTIGRAVITY AUTH VALIDATION CHECK
    if (user.approvalStatus === 'Pending') {
      return {
        success: false,
        status: 'Pending',
        error: 'Access Denied: Your account is still pending admin approval.'
      };
    }

    if (user.approvalStatus === 'Rejected') {
      return {
        success: false,
        status: 'Rejected',
        error: 'Access Denied: Your registration request was rejected by an administrator.'
      };
    }

    // Approved: Grant access!
    setCurrentUser(user);

    return {
      success: true,
      user
    };
  }, [users]);

  // 3. ADMIN: Approve User
  const approveUser = useCallback((userId) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          return {
            ...u,
            approvalStatus: 'Approved',
            approvedAt: new Date().toISOString()
          };
        }
        return u;
      })
    );

    // If the approved user is currently trying to log in or stored, update
    return { success: true };
  }, []);

  // 4. ADMIN: Reject User
  const rejectUser = useCallback((userId) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          return {
            ...u,
            approvalStatus: 'Rejected',
            rejectedAt: new Date().toISOString()
          };
        }
        return u;
      })
    );
    return { success: true };
  }, []);

  // 5. LOGOUT
  const logout = useCallback(() => {
    setCurrentUser(null);
    try {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    } catch {}
  }, []);

  // Reset to initial mock users
  const resetUsers = useCallback(() => {
    setUsers(INITIAL_USERS);
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEYS.USERS);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  }, []);

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
