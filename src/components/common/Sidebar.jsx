import React from 'react';
import { useTickets } from '../../context/TicketContext';
import { useAuth } from '../../context/AuthContext';
import Avatar from './Avatar';
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
  ShieldCheck,
  LogOut 
} from 'lucide-react';

export default function Sidebar({ adminTab = 'overview', setAdminTab }) {
  const { role, userTab, setUserTab, stats, currentUser, logout } = useTickets();
  const { pendingUsers = [] } = useAuth();

  if (!role) return null;

  return (
    <aside className="hidden md:flex flex-col w-64 lg:w-72 shrink-0 bg-[#f8fafc] border-r border-slate-200 p-5 min-h-[calc(100vh-4rem)]">
      {/* Sidebar Header Title matching screenshot: "Facilities desk" */}
      <div className="mb-6 px-3">
        <h2 className="text-base font-bold text-slate-900 tracking-tight">Facilities desk</h2>
      </div>

      {/* Role specific navigation tabs */}
      {role === 'user' && (
        <div className="flex-1 flex flex-col gap-6">
          <nav className="flex flex-col gap-1.5">
            <button
              onClick={() => setUserTab('new-issue')}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all text-left ${
                userTab === 'new-issue'
                  ? 'bg-slate-200 text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Camera className="w-4 h-4 text-slate-700" />
                <span>New Issue</span>
              </div>
              <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                Camera
              </span>
            </button>

            <button
              onClick={() => setUserTab('my-tickets')}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all text-left ${
                userTab === 'my-tickets'
                  ? 'bg-slate-200 text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <ListTodo className="w-4 h-4 text-slate-700" />
                <span>My Tickets</span>
              </div>
              {stats.userTicketsCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-900 text-white">
                  {stats.userTicketsCount}
                </span>
              )}
            </button>
          </nav>

          {/* User Status Card */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
            <h4 className="text-xs font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-sky-600" />
              <span>Personal Ticket Status</span>
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-500">
                <span>My Reports</span>
                <span className="font-semibold text-slate-900">{stats.userTicketsCount}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500">
                <span>Open Requests</span>
                <span className="font-semibold text-amber-700">{stats.open}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500">
                <span>Resolved</span>
                <span className="font-semibold text-emerald-700">{stats.done}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {role === 'technician' && (
        <div className="flex-1 flex flex-col gap-6">
          <nav className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-200 text-slate-900 font-semibold text-xs sm:text-sm shadow-2xs">
              <Wrench className="w-4 h-4 text-slate-800" />
              <span>Work Order Queue</span>
            </div>
          </nav>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
            <h4 className="text-xs font-semibold text-slate-800 mb-3">Technician Triage</h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-500">
                <span>Open Work Orders</span>
                <span className="font-bold text-amber-700">{stats.open}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500">
                <span>In Progress</span>
                <span className="font-bold text-sky-700">{stats.inProgress}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500">
                <span>Resolved Total</span>
                <span className="font-bold text-emerald-700">{stats.done}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {role === 'admin' && (
        <div className="flex-1 flex flex-col gap-6">
          {/* Navigation matching screenshot: Overview, All requests, Hazard queue, Settings */}
          <nav className="flex flex-col gap-1">
            <button 
              onClick={() => setAdminTab && setAdminTab('overview')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-xs sm:text-sm text-left transition-colors ${
                adminTab === 'overview'
                  ? 'bg-slate-200 text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <LayoutGrid className="w-4 h-4 text-slate-800" />
              <span>Overview</span>
            </button>

            <button 
              onClick={() => setAdminTab && setAdminTab('approvals')}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs sm:text-sm text-left transition-colors ${
                adminTab === 'approvals'
                  ? 'bg-slate-200 text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Pending Approvals</span>
              </div>
              {pendingUsers.length > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-500 text-white text-[10px] font-bold rounded-full">
                  {pendingUsers.length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setAdminTab && setAdminTab('requests')}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs sm:text-sm text-left transition-colors ${
                adminTab === 'requests'
                  ? 'bg-slate-200 text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <ListFilter className="w-4 h-4 text-slate-500" />
                <span>All requests</span>
              </div>
              {stats.total > 0 && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-full border border-slate-200">
                  {stats.total}
                </span>
              )}
            </button>

            <button 
              onClick={() => setAdminTab && setAdminTab('hazards')}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs sm:text-sm text-left transition-colors ${
                adminTab === 'hazards'
                  ? 'bg-rose-100 text-rose-950 font-semibold shadow-2xs border border-rose-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Hazard queue</span>
              </div>
              {stats.critical > 0 && (
                <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-bold rounded-full shadow-2xs">
                  {stats.critical}
                </span>
              )}
            </button>

            <button 
              onClick={() => setAdminTab && setAdminTab('settings')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-xs sm:text-sm text-left transition-colors ${
                adminTab === 'settings'
                  ? 'bg-slate-200 text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <span>Settings</span>
            </button>
          </nav>
        </div>
      )}

      {/* Footer Profile & Logout */}
      <div className="pt-4 border-t border-slate-200 flex flex-col gap-3">
        <div className="flex items-center gap-3 px-2 py-1">
          <Avatar
            src={currentUser?.avatar}
            name={currentUser?.name}
            size="w-8 h-8"
            className="ring-1 ring-slate-200"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">{currentUser?.name}</p>
            <p className="text-[11px] text-slate-500 capitalize">{currentUser?.roleDisplay}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
