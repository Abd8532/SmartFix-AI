import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TicketProvider, useTickets } from './context/TicketContext';
import Navbar from './components/common/Navbar';
import BottomNav from './components/common/BottomNav';
import ToastContainer from './components/common/Toast';
import LoginView from './components/auth/LoginView';
import UserView from './components/user/UserView';
import TechnicianDashboard from './components/technician/TechnicianDashboard';
import AdminDashboard from './components/admin/AdminDashboard';
import TicketDetailModal from './components/tickets/TicketDetailModal';
import { ShieldAlert, LogOut } from 'lucide-react';

function AppContent() {
  const { currentUser, logout } = useAuth();
  const [activeModalTicketId, setActiveModalTicketId] = useState(null);
  const [adminTab, setAdminTab] = useState('overview'); // 'overview' | 'approvals' | 'requests' | 'hazards' | 'audit' | 'settings'

  // 1. Unauthenticated or Pending Approval Check (unified approval flags)
  const isApproved = currentUser && (
    currentUser.approved === true ||
    currentUser.isApproved === true ||
    currentUser.status === 'Approved' ||
    currentUser.approvalStatus === 'Approved' ||
    currentUser.accountStatus === 'active' ||
    currentUser.role === 'admin'
  );
  if (!currentUser || !isApproved) {
    return (
      <>
        <LoginView />
        <ToastContainer />
      </>
    );
  }

  // 2. Fallback / Unauthorized Role Handling
  const validRoles = ['user', 'technician', 'admin'];
  if (!validRoles.includes(currentUser.role)) {
    return (
      <div className="min-h-screen bg-[#131316] text-zinc-100 flex items-center justify-center p-4 relative">
        <div className="max-w-md w-full bg-[#1c1c21] rounded-xl p-8 border border-[#2a2a32] text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
            Unauthorized Access
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Your account ({currentUser.email}) has an unrecognized or restricted role (<code>{String(currentUser.role)}</code>). Access is denied to campus operational dashboards.
          </p>
          <button
            onClick={logout}
            className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>
        </div>
        <ToastContainer />
      </div>
    );
  }

  // 3. Authorized View Layout with NeetCode Matte Dark Workspace
  return (
    <div className="min-h-screen bg-[#131316] text-zinc-100 flex flex-col font-sans relative selection:bg-indigo-600 selection:text-white">
      {/* NeetCode Top Navigation Bar */}
      <Navbar
        adminTab={adminTab}
        setAdminTab={setAdminTab}
        onLogout={logout}
      />

      {/* Main 3-Column Responsive Dashboard Body */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto p-4 lg:p-6 pb-20 md:pb-8">
        {currentUser.role === 'user' && (
          <UserView onSelectTicket={(id) => setActiveModalTicketId(id)} />
        )}

        {currentUser.role === 'technician' && (
          <TechnicianDashboard onSelectTicket={(id) => setActiveModalTicketId(id)} />
        )}

        {currentUser.role === 'admin' && (
          <AdminDashboard 
            activeTab={adminTab}
            setActiveTab={setAdminTab}
            onSelectTicket={(id) => setActiveModalTicketId(id)} 
          />
        )}
      </main>

      <BottomNav />
      <ToastContainer />

      {activeModalTicketId && (
        <TicketDetailModal
          ticketId={activeModalTicketId}
          onClose={() => setActiveModalTicketId(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TicketProvider>
        <AppContent />
      </TicketProvider>
    </AuthProvider>
  );
}
