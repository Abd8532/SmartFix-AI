import React from 'react';
import { useTickets } from '../../context/TicketContext';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutGrid, 
  ListFilter, 
  AlertTriangle, 
  Settings, 
  Camera, 
  PlusCircle, 
  ListTodo, 
  Wrench, 
  Clock, 
  CheckCircle2, 
  ShieldCheck
} from 'lucide-react';

export default function Sidebar({ adminTab = 'overview', setAdminTab }) {
  const { role, userTab, setUserTab, stats } = useTickets();
  const { pendingUsers = [] } = useAuth();

  if (!role) return null;

  return (
    <aside className="hidden md:flex flex-col w-64 lg:w-72 shrink-0 bg-white border-r border-[#E6EFF5] p-5 min-h-[calc(100vh-5rem)] text-slate-900">
      {/* Sidebar Header Title matching screenshot: "Facilities desk" */}
      <div className="mb-6 px-3">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 font-['Plus_Jakarta_Sans']">Facilities desk</h2>
      </div>

      {/* Role specific navigation tabs in BankDash Style */}
      {role === 'user' && (
        <div className="flex-1 flex flex-col gap-6">
          <nav className="flex flex-col gap-1.5">
            <button
              onClick={() => setUserTab('new-issue')}
              className={`flex items-center justify-between px-3.5 py-3 rounded-2xl font-medium text-xs sm:text-sm transition-all duration-200 active:scale-[0.98] text-left ${
                userTab === 'new-issue'
                  ? 'bg-[#F5F7FA] text-[#2D60FF] border-l-4 border-[#2D60FF] font-bold shadow-xs'
                  : 'text-slate-500 hover:bg-[#F5F7FA] hover:text-[#2D60FF]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Camera className={`w-4 h-4 ${userTab === 'new-issue' ? 'text-[#2D60FF]' : 'text-slate-400'}`} />
                <span>New Issue</span>
              </div>
              <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-white text-[#2D60FF] border border-[#DFEAF2] shadow-2xs">
                Camera
              </span>
            </button>

            <button
              onClick={() => setUserTab('my-tickets')}
              className={`flex items-center justify-between px-3.5 py-3 rounded-2xl font-medium text-xs sm:text-sm transition-all duration-200 active:scale-[0.98] text-left ${
                userTab === 'my-tickets'
                  ? 'bg-[#F5F7FA] text-[#2D60FF] border-l-4 border-[#2D60FF] font-bold shadow-xs'
                  : 'text-slate-500 hover:bg-[#F5F7FA] hover:text-[#2D60FF]'
              }`}
            >
              <div className="flex items-center gap-3">
                <ListTodo className={`w-4 h-4 ${userTab === 'my-tickets' ? 'text-[#2D60FF]' : 'text-slate-400'}`} />
                <span>My Tickets</span>
              </div>
              {stats.userTicketsCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-[#2D60FF] text-white shadow-xs">
                  {stats.userTicketsCount}
                </span>
              )}
            </button>
          </nav>

          {/* User Status Card */}
          <div className="p-4 rounded-3xl bg-[#F5F7FA] border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]">
            <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-2 font-['Plus_Jakarta_Sans']">
              <Clock className="w-3.5 h-3.5 text-[#2D60FF]" />
              <span>Personal Ticket Status</span>
            </h4>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-slate-500 font-medium">
                <span>My Reports</span>
                <span className="font-bold text-slate-900">{stats.userTicketsCount}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 font-medium">
                <span>Open Requests</span>
                <span className="font-bold text-[#FFBB38]">{stats.userOpenCount}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 font-medium">
                <span>Resolved</span>
                <span className="font-bold text-[#16DBCC]">{stats.userResolvedCount}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {role === 'technician' && (
        <div className="flex-1 flex flex-col gap-6">
          <nav className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-[#F5F7FA] text-[#2D60FF] border-l-4 border-[#2D60FF] font-bold text-xs sm:text-sm shadow-xs">
              <Wrench className="w-4 h-4 text-[#2D60FF]" />
              <span>Work Order Queue</span>
            </div>
          </nav>

          <div className="p-4 rounded-3xl bg-[#F5F7FA] border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]">
            <h4 className="text-xs font-bold text-slate-900 mb-3 font-['Plus_Jakarta_Sans']">Technician Triage</h4>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-slate-500 font-medium">
                <span>Open Work Orders</span>
                <span className="font-bold text-[#FFBB38]">{stats.open}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 font-medium">
                <span>In Progress</span>
                <span className="font-bold text-[#2D60FF]">{stats.inProgress}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 font-medium">
                <span>Resolved Total</span>
                <span className="font-bold text-[#16DBCC]">{stats.done}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {role === 'admin' && (
        <div className="flex-1 flex flex-col gap-6">
          {/* Navigation matching BankDash style: Overview, All requests, Hazard queue, Settings */}
          <nav className="flex flex-col gap-1">
            <button 
              onClick={() => setAdminTab && setAdminTab('overview')}
              className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl font-medium text-xs sm:text-sm text-left transition-all duration-200 active:scale-[0.98] ${
                adminTab === 'overview'
                  ? 'bg-[#F5F7FA] text-[#2D60FF] border-l-4 border-[#2D60FF] font-bold shadow-xs'
                  : 'text-slate-500 hover:text-[#2D60FF] hover:bg-[#F5F7FA]'
              }`}
            >
              <LayoutGrid className={`w-4 h-4 ${adminTab === 'overview' ? 'text-[#2D60FF]' : 'text-slate-400'}`} />
              <span>Overview</span>
            </button>

            <button 
              onClick={() => setAdminTab && setAdminTab('approvals')}
              className={`flex items-center justify-between px-3.5 py-3 rounded-2xl font-medium text-xs sm:text-sm text-left transition-all duration-200 active:scale-[0.98] ${
                adminTab === 'approvals'
                  ? 'bg-[#F5F7FA] text-[#2D60FF] border-l-4 border-[#2D60FF] font-bold shadow-xs'
                  : 'text-slate-500 hover:text-[#2D60FF] hover:bg-[#F5F7FA]'
              }`}
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className={`w-4 h-4 ${adminTab === 'approvals' ? 'text-[#2D60FF]' : 'text-slate-400'}`} />
                <span>Pending Approvals</span>
              </div>
              {pendingUsers.length > 0 && (
                <span className="px-2 py-0.5 bg-[#FFBB38] text-white text-[10px] font-bold rounded-full">
                  {pendingUsers.length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setAdminTab && setAdminTab('requests')}
              className={`flex items-center justify-between px-3.5 py-3 rounded-2xl font-medium text-xs sm:text-sm text-left transition-all duration-200 active:scale-[0.98] ${
                adminTab === 'requests'
                  ? 'bg-[#F5F7FA] text-[#2D60FF] border-l-4 border-[#2D60FF] font-bold shadow-xs'
                  : 'text-slate-500 hover:text-[#2D60FF] hover:bg-[#F5F7FA]'
              }`}
            >
              <div className="flex items-center gap-3">
                <ListFilter className={`w-4 h-4 ${adminTab === 'requests' ? 'text-[#2D60FF]' : 'text-slate-400'}`} />
                <span>All requests</span>
              </div>
              {stats.total > 0 && (
                <span className="px-2 py-0.5 bg-[#E7EDFF] text-[#2D60FF] text-[10px] font-bold rounded-full border border-[#2D60FF]/20">
                  {stats.total}
                </span>
              )}
            </button>

            <button 
              onClick={() => setAdminTab && setAdminTab('hazards')}
              className={`flex items-center justify-between px-3.5 py-3 rounded-2xl font-medium text-xs sm:text-sm text-left transition-all duration-200 active:scale-[0.98] ${
                adminTab === 'hazards'
                  ? 'bg-[#FFE0EB] text-[#FF4B4A] border-l-4 border-[#FF4B4A] font-bold shadow-xs'
                  : 'text-slate-500 hover:text-[#FF4B4A] hover:bg-[#FFE0EB]/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className={`w-4 h-4 ${adminTab === 'hazards' ? 'text-[#FF4B4A]' : 'text-slate-400'}`} />
                <span>Hazard queue</span>
              </div>
              {stats.critical > 0 && (
                <span className="px-2 py-0.5 bg-[#FF4B4A] text-white text-[10px] font-bold rounded-full shadow-xs">
                  {stats.critical}
                </span>
              )}
            </button>

            <button 
              onClick={() => setAdminTab && setAdminTab('settings')}
              className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl font-medium text-xs sm:text-sm text-left transition-all duration-200 active:scale-[0.98] ${
                adminTab === 'settings'
                  ? 'bg-[#F5F7FA] text-[#2D60FF] border-l-4 border-[#2D60FF] font-bold shadow-xs'
                  : 'text-slate-500 hover:text-[#2D60FF] hover:bg-[#F5F7FA]'
              }`}
            >
              <Settings className={`w-4 h-4 ${adminTab === 'settings' ? 'text-[#2D60FF]' : 'text-slate-400'}`} />
              <span>Settings</span>
            </button>
          </nav>
        </div>
      )}
    </aside>
  );
}
