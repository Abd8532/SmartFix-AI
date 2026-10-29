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

function AppContent() {
  const { currentUser } = useAuth();
  const [activeModalTicketId, setActiveModalTicketId] = useState(null);
  const [adminTab, setAdminTab] = useState('overview'); // 'overview' | 'approvals' | 'requests' | 'hazards' | 'settings'

  // STRICT ROUTING PROTECTION (Admin Auth Validation):
  // User must be authenticated AND their approvalStatus must strictly equal 'Approved'
  const isApproved = currentUser && currentUser.approvalStatus === 'Approved';
  const role = isApproved ? currentUser.role : null;

  if (!isApproved || !role) {
    return (
      <>
        <LoginView />
        <ToastContainer />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans selection:bg-slate-900 selection:text-white">
      {/* Top Header */}
      <Header />

      {/* Main Responsive Body with Sidebar & Content */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar adminTab={adminTab} setAdminTab={setAdminTab} />

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-24 md:pb-12">
          {role === 'user' && (
            <UserView onSelectTicket={(id) => setActiveModalTicketId(id)} />
          )}

          {role === 'technician' && (
            <TechnicianDashboard onSelectTicket={(id) => setActiveModalTicketId(id)} />
          )}

          {role === 'admin' && (
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
