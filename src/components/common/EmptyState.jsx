import React from 'react';
import { ClipboardCheck } from 'lucide-react';

export default function EmptyState({
  icon: Icon = ClipboardCheck,
  title = 'Queue is clear',
  subtitle = 'Great job, all maintenance requests are resolved.',
  action = null
}) {
  return (
    <div className="bg-white p-8 sm:p-12 rounded-3xl border border-[#E6EFF5] text-center max-w-md mx-auto my-8 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] text-slate-900 animate-slide-up">
      <div className="w-16 h-16 rounded-2xl bg-[#DCFAF8] text-[#16DBCC] border border-[#16DBCC]/30 flex items-center justify-center mx-auto mb-4 shadow-xs">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-1 font-['Plus_Jakarta_Sans'] tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-xs mx-auto">
        {subtitle}
      </p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
