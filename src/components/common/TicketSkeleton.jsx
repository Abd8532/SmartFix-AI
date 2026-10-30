import React from 'react';

export default function TicketSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 animate-pulse">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white rounded-3xl p-6 border border-[#E6EFF5] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] flex flex-col justify-between space-y-4"
        >
          <div>
            {/* Header badges skeleton */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-5 w-20 bg-slate-200 rounded-full" />
                <div className="h-5 w-16 bg-slate-100 rounded-full" />
                <div className="h-5 w-14 bg-slate-100 rounded-full" />
              </div>
              <div className="h-6 w-24 bg-slate-200 rounded-full" />
            </div>

            {/* Photo + Details skeleton */}
            <div className="flex flex-col sm:flex-row gap-4 mb-2">
              <div className="w-full sm:w-36 h-36 bg-slate-200 rounded-2xl shrink-0" />
              <div className="flex-1 space-y-2.5 pt-1">
                <div className="h-5 w-4/5 bg-slate-200 rounded-md" />
                <div className="h-3.5 w-full bg-slate-100 rounded" />
                <div className="h-3.5 w-3/4 bg-slate-100 rounded" />
                <div className="pt-2 flex items-center gap-2">
                  <div className="h-4 w-32 bg-slate-100 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {/* Footer actions skeleton */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <div className="h-4 w-24 bg-slate-100 rounded" />
            <div className="h-10 w-28 bg-slate-200 rounded-2xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
