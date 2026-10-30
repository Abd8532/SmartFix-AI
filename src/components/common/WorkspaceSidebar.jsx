import React, { useState } from 'react';
import { 
  Layers, 
  PlusCircle, 
  FileText, 
  ShieldAlert, 
  ChevronDown, 
  ChevronRight, 
  Wrench, 
  Zap, 
  Thermometer, 
  Wifi, 
  FolderKanban,
  CheckCircle2,
  Clock,
  Settings,
  History
} from 'lucide-react';

export default function WorkspaceSidebar({
  currentView = 'all-tickets',
  onSelectView,
  selectedCategory = 'All',
  onSelectCategory,
  role = 'user',
  stats
}) {
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(true);

  const categories = [
    { id: 'All', label: 'All Categories', icon: FolderKanban },
    { id: 'Plumbing', label: 'Plumbing', icon: Wrench },
    { id: 'Electrical', label: 'Electrical', icon: Zap },
    { id: 'HVAC', label: 'HVAC', icon: Thermometer },
    { id: 'IT', label: 'IT & Network', icon: Wifi },
    { id: 'General', label: 'General', icon: Layers },
  ];

  return (
    <aside className="bg-[#1c1c21] border border-[#2a2a32] rounded-xl p-3 space-y-4 text-sm font-medium">
      {/* Menu Header */}
      <div className="px-2 pt-1 pb-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Menu
        </h2>
      </div>

      {/* Main View Switches */}
      <nav className="space-y-1">
        <button
          type="button"
          onClick={() => onSelectView && onSelectView('all-tickets')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition ${
            currentView === 'all-tickets'
              ? 'bg-[#282830] text-white font-semibold'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#222228]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>All Tickets</span>
          </div>
          {stats?.total > 0 && (
            <span className="text-[10px] bg-[#24242b] text-zinc-400 px-1.5 py-0.5 rounded border border-[#32323b]">
              {stats.total}
            </span>
          )}
        </button>

        {role === 'user' && (
          <button
            type="button"
            onClick={() => onSelectView && onSelectView('new-issue')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition ${
              currentView === 'new-issue'
                ? 'bg-[#282830] text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#222228]'
            }`}
          >
            <PlusCircle className="w-4 h-4 text-emerald-400" />
            <span>Raise Issue</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onSelectView && onSelectView('rag-history')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition ${
            currentView === 'rag-history'
              ? 'bg-[#282830] text-white font-semibold'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#222228]'
          }`}
        >
          <History className="w-4 h-4 text-amber-400" />
          <span>RAG History</span>
        </button>

        {role === 'admin' && (
          <>
            <button
              type="button"
              onClick={() => onSelectView && onSelectView('approvals')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition ${
                currentView === 'approvals'
                  ? 'bg-[#282830] text-white font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#222228]'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>User Approvals</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectView && onSelectView('settings')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition ${
                currentView === 'settings'
                  ? 'bg-[#282830] text-white font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#222228]'
              }`}
            >
              <Settings className="w-4 h-4 text-rose-400" />
              <span>Security Settings</span>
            </button>
          </>
        )}
      </nav>

      {/* Collapsible Category Filters */}
      <div className="pt-2 border-t border-[#2a2a32]">
        <button
          type="button"
          onClick={() => setIsCategoriesOpen(!isCategoriesOpen)}
          className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition"
        >
          <span>Categories</span>
          {isCategoriesOpen ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {isCategoriesOpen && (
          <div className="mt-1.5 space-y-0.5">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectCategory && onSelectCategory(cat.id)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition ${
                    isSelected
                      ? 'bg-[#282830] text-white font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#222228]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-400' : 'text-zinc-500'}`} />
                    <span>{cat.label}</span>
                  </div>
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Summary Pill at bottom */}
      {stats && (
        <div className="pt-2 border-t border-[#2a2a32] text-[11px] text-zinc-500 px-2 flex justify-between items-center">
          <span>Active Queue</span>
          <span className="text-zinc-300 font-semibold">{stats.activeCount || 0} Open</span>
        </div>
      )}
    </aside>
  );
}
