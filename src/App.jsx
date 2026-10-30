import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TicketProvider, useTickets } from './context/TicketContext';
import Header from './components/common/Header';
import Sidebar from './components/common/Sidebar';
import BottomNav from './components/common/BottomNav';
import ToastContainer from './components/common/Toast';
import LoginView from './components/auth/LoginView';
import UserView from './components/user/UserView';
import TechnicianDashboard from './components/technician/TechnicianDashboard';
import AdminDashboard from './components/admin/AdminDashboard';
import TicketDetailModal from './components/tickets/TicketDetailModal';
import { ShieldAlert, LogOut } from 'lucide-react';

function AppContent() {
  // Consume Auth State directly from AuthContext
  const { currentUser, logout } = useAuth();
  const [activeModalTicketId, setActiveModalTicketId] = useState(null);
  const [adminTab, setAdminTab] = useState('overview'); // 'overview' | 'approvals' | 'requests' | 'hazards' | 'settings'

  // 1. Unauthenticated or Pending Approval Check
  const isApproved = currentUser && currentUser.approvalStatus === 'Approved';
  if (!currentUser || !isApproved) {
    return (
      <>
        <LoginView />
        <ToastContainer />
      </>
    );
  }

  // 2. Fallback / Unauthorized Role Handling
  // If currentUser has an unrecognized role or somehow bypasses normal gating
  const validRoles = ['user', 'technician', 'admin'];
  if (!validRoles.includes(currentUser.role)) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] text-[#343C6A] flex items-center justify-center p-4 relative">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-[#E6EFF5] shadow-xl text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center mx-auto shadow-xs">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-extrabold text-[#343C6A] tracking-tight font-['Plus_Jakarta_Sans']">Unauthorized Access</h2>
          <p className="text-xs text-[#718EBF] leading-relaxed">
            Your account ({currentUser.email}) has an unrecognized or restricted role (<code>{String(currentUser.role)}</code>). Access is denied to campus operational dashboards.
          </p>
          <button
            onClick={logout}
            className="w-full py-3.5 px-4 rounded-2xl bg-[#2D60FF] hover:bg-[#1814F3] text-white font-bold text-xs shadow-lg shadow-[#2D60FF]/25 transition-all flex items-center justify-center gap-2 active:scale-98"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>
        </div>
        <ToastContainer />
      </div>
    );
  }

  // 3. Authorized View Layout with Strict Role-Based Dashboard Separation
  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#343C6A] flex flex-col font-sans relative selection:bg-[#2D60FF] selection:text-white">
      {/* Universal BankDash Header with currentUser data & role pill */}
      <Header currentUser={currentUser} onLogout={logout} />

      {/* Main Responsive Body with Sidebar attached flush to the left edge */}
      <div className="flex-1 flex w-full relative z-0">
        <Sidebar adminTab={adminTab} setAdminTab={setAdminTab} />

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-24 md:pb-12">
          {/* Strictly User: UserView only */}
          {currentUser.role === 'user' && (
            <UserView onSelectTicket={(id) => setActiveModalTicketId(id)} />
          )}

          {/* Strictly Technician: TechnicianDashboard only */}
          {currentUser.role === 'technician' && (
            <TechnicianDashboard onSelectTicket={(id) => setActiveModalTicketId(id)} />
          )}

          {/* Strictly Admin: AdminDashboard only */}
          {currentUser.role === 'admin' && (
            <AdminDashboard 
              activeTab={adminTab}
              setActiveTab={setAdminTab}
              onSelectTicket={(id) => setActiveModalTicketId(id)} 
            />
          )}
        </main>
      </div>

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
