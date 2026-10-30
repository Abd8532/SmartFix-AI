import React from 'react';

export default function SlaPriorityRingWidget({ stats, tickets = [] }) {
  // Compute counts
  let routineCount = 0;
  let urgentCount = 0;
  let emergencyCount = 0;
  let totalResolved = 0;

  tickets.forEach((t) => {
    const isDone = t.status === 'Completed' || t.status === 'Done' || t.status === 'Resolved';
    if (isDone) totalResolved++;

    const prio = (t.priority || t.urgency || '').toLowerCase();
    if (prio === 'emergency' || prio === 'critical') {
      emergencyCount++;
    } else if (prio === 'urgent' || prio === 'moderate') {
      urgentCount++;
    } else {
      routineCount++;
    }
  });

  const totalTickets = tickets.length || 1;
  const resolvedPercent = Math.min(100, Math.round((totalResolved / totalTickets) * 100));

  // SVG ring properties
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (resolvedPercent / 100) * circumference;

  return (
    <div className="bg-[#1c1c21] border border-[#2a2a32] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          SLA & Priority Metrics
        </h3>
        <span className="text-[11px] font-medium text-zinc-500">Live Queue</span>
      </div>

      <div className="flex items-center justify-between gap-4">
        {/* Left Side: Priority breakdown rows */}
        <div className="space-y-3 flex-1 min-w-0">
          {/* Routine */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-zinc-300 font-medium truncate">Routine</span>
            </div>
            <span className="text-emerald-400 font-semibold">{routineCount}</span>
          </div>

          {/* Moderate / Urgent */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span className="text-zinc-300 font-medium truncate">Urgent</span>
            </div>
            <span className="text-amber-400 font-semibold">{urgentCount}</span>
          </div>

          {/* Emergency */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span className="text-zinc-300 font-medium truncate">Emergency</span>
            </div>
            <span className="text-rose-500 font-semibold">{emergencyCount}</span>
          </div>
        </div>

        {/* Right Side: NeetCode Core-Skills style circular progress ring */}
        <div className="relative flex items-center justify-center shrink-0 w-24 h-24">
          <svg className="w-24 h-24 transform -rotate-90">
            {/* Background Ring */}
            <circle
              cx="48"
              cy="48"
              r={radius}
              stroke="#2a2a32"
              strokeWidth="7"
              fill="transparent"
            />
            {/* Active Resolved Stroke */}
            <circle
              cx="48"
              cy="48"
              r={radius}
              stroke="#6366f1"
              strokeWidth="7"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-700 ease-out"
            />
          </svg>

          {/* Center Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-sm font-extrabold text-white leading-none">
              {totalResolved} / {tickets.length}
            </span>
            <span className="text-[10px] text-zinc-400 mt-1 uppercase tracking-tight font-medium">
              Resolved
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
