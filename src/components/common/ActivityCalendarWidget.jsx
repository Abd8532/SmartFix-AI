import React from 'react';
import { CloudSun, Zap, ShieldCheck } from 'lucide-react';

export default function ActivityCalendarWidget({ weatherContext }) {
  // Calendar month days for October 2026 (Starts on Thursday Oct 1)
  // Weekday headers: S M T W T F S
  // Oct 1 is Thursday (index 4 in 0=Sun..6=Sat)
  // Oct 31 is Saturday (31 days)
  const daysInMonth = 31;
  const startDayOffset = 4; // Thursday
  const todayDate = 31; // Current local day

  const calendarCells = [];
  for (let i = 0; i < startDayOffset; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(d);
  }

  const tempF = weatherContext?.temperatureF || 72;
  const condition = weatherContext?.condition || 'Clear Skies';
  const rainRisk = weatherContext?.rainRisk || 'Low';

  return (
    <div className="bg-[#1c1c21] border border-[#2a2a32] rounded-xl p-5 space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          October 2026
        </h3>
        <span className="text-[11px] font-medium text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
          Today
        </span>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 text-center text-[10px] font-medium text-zinc-500">
        <span>S</span>
        <span>M</span>
        <span>T</span>
        <span>W</span>
        <span>T</span>
        <span>F</span>
        <span>S</span>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {calendarCells.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} className="h-6" />;
          }

          const isToday = day === todayDate;
          return (
            <div key={`day-${day}`} className="h-6 flex items-center justify-center">
              {isToday ? (
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[11px] shadow-sm">
                  {day}
                </span>
              ) : (
                <span className="text-zinc-400 hover:text-white transition-colors text-[11px]">
                  {day}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Two Bottom Stat Boxes */}
      <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[#2a2a32]">
        {/* Weather Telemetry Box */}
        <div className="bg-[#24242b] border border-[#32323b] rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
            <CloudSun className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Weather</span>
          </div>
          <p className="text-xs font-bold text-white">{tempF}°F · {condition}</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">Rain Risk: {rainRisk}</p>
        </div>

        {/* SLA & Facility Readiness Box */}
        <div className="bg-[#24242b] border border-[#32323b] rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">SLA Ready</span>
          </div>
          <p className="text-xs font-bold text-emerald-400">99.8% Online</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">Avg Dispatch: 11m</p>
        </div>
      </div>
    </div>
  );
}
