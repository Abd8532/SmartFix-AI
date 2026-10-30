import React from 'react';
import { 
  Sparkles, 
  AlertTriangle, 
  History, 
  Search, 
  RotateCw, 
  Plus, 
  CheckCircle2, 
  Clock, 
  Flame 
} from 'lucide-react';

export default function DashboardHeroBanner({
  title = 'Campus Dispatch',
  subtitle = 'Real-time AI triage and deterministic single-specialty routing.',
  stats = {},
  searchQuery = '',
  onSearchChange,
  onRefresh,
  onActionClick,
  actionButtonLabel = 'New Ticket',
  onFeatureCardClick,
  activeFeatureFilter = 'all'
}) {
  const resolvedCount = stats.resolvedCount ?? stats.userResolvedCount ?? 0;
  const totalCount = stats.total ?? stats.userTicketsCount ?? 0;
  const openCount = stats.openCount ?? stats.userOpenCount ?? 0;
  const escalatedCount = stats.escalatedCount ?? stats.urgentCount ?? 0;

  return (
    <div className="space-y-4 mb-6">
      {/* 1. Top Category Feature Cards (3 horizontal cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: AI Triage (Deep Purple #6d28d9) */}
        <div
          onClick={() => onFeatureCardClick && onFeatureCardClick('ai-triage')}
          className={`bg-[#1c1c21] border ${
            activeFeatureFilter === 'ai-triage' ? 'border-[#6d28d9]' : 'border-[#2a2a32]'
          } hover:border-[#3f3f4a] rounded-xl p-3.5 flex items-center gap-3.5 transition cursor-pointer select-none`}
        >
          <div className="w-12 h-12 rounded-xl bg-[#6d28d9] flex items-center justify-center text-white shrink-0 shadow-sm">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">AI Multimodal Triage</p>
            <p className="text-xs text-zinc-400 mt-0.5">Vision + Gemini 2.5 Flash</p>
          </div>
        </div>

        {/* Card 2: Urgent / Emergency (Crimson #991b1b) */}
        <div
          onClick={() => onFeatureCardClick && onFeatureCardClick('urgent')}
          className={`bg-[#1c1c21] border ${
            activeFeatureFilter === 'urgent' ? 'border-[#991b1b]' : 'border-[#2a2a32]'
          } hover:border-[#3f3f4a] rounded-xl p-3.5 flex items-center gap-3.5 transition cursor-pointer select-none`}
        >
          <div className="w-12 h-12 rounded-xl bg-[#991b1b] flex items-center justify-center text-white shrink-0 shadow-sm">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">Critical Escalations</p>
            <p className="text-xs text-zinc-400 mt-0.5">{escalatedCount} Active Hazards</p>
          </div>
        </div>

        {/* Card 3: RAG History (Amber #b45309) */}
        <div
          onClick={() => onFeatureCardClick && onFeatureCardClick('rag-history')}
          className={`bg-[#1c1c21] border ${
            activeFeatureFilter === 'rag-history' ? 'border-[#b45309]' : 'border-[#2a2a32]'
          } hover:border-[#3f3f4a] rounded-xl p-3.5 flex items-center gap-3.5 transition cursor-pointer select-none`}
        >
          <div className="w-12 h-12 rounded-xl bg-[#b45309] flex items-center justify-center text-white shrink-0 shadow-sm">
            <History className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">RAG Recurrence Log</p>
            <p className="text-xs text-zinc-400 mt-0.5">Vector Memory Active</p>
          </div>
        </div>
      </div>

      {/* 2. Main Hero Banner Card */}
      <div className="bg-[#1c1c21] border border-[#2a2a32] rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        {/* Left Side: Large Bold Heading with Indigo Period */}
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold text-white tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
            {title}<span className="text-indigo-500">.</span>
          </h1>
          <p className="text-zinc-400 text-sm max-w-lg">
            {subtitle}
          </p>
        </div>

        {/* Right Side: Mini Stat Grid */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Resolved Mini Stat */}
          <div className="bg-[#222228] border border-[#2e2e36] rounded-xl p-3.5 min-w-[120px] flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">RESOLVED</p>
              <p className="text-base font-bold text-white leading-tight">
                {resolvedCount}/{totalCount}
              </p>
            </div>
          </div>

          {/* Open Mini Stat */}
          <div className="bg-[#222228] border border-[#2e2e36] rounded-xl p-3.5 min-w-[120px] flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">OPEN</p>
              <p className="text-base font-bold text-white leading-tight">
                {openCount}
              </p>
            </div>
          </div>

          {/* Escalated Mini Stat */}
          <div className="bg-[#222228] border border-[#2e2e36] rounded-xl p-3.5 min-w-[120px] flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">ESCALATED</p>
              <p className="text-base font-bold text-white leading-tight">
                {escalatedCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Search Bar & Action Toolbar */}
      <div className="flex items-center justify-between gap-3">
        {/* Dark Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            placeholder="Search tickets by ID, problem, room, or equipment..."
            className="w-full bg-[#1c1c21] border border-[#2a2a32] rounded-lg pl-11 pr-4 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        {/* Action Buttons Toolbar on Right */}
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh Queue"
              className="w-9 h-9 bg-[#1c1c21] border border-[#2a2a32] hover:border-[#3f3f4a] rounded-lg flex items-center justify-center text-zinc-400 hover:text-white transition"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          )}

          {onActionClick && (
            <button
              type="button"
              onClick={onActionClick}
              className="h-9 px-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>{actionButtonLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
