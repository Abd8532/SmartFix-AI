import React from 'react';
import { useTickets } from '../../context/TicketContext';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

export default function ToastContainer() {
  const { toasts, removeToast } = useTickets();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-4 left-4 md:left-auto md:w-96 z-50 flex flex-col gap-2.5 pointer-events-none">
      {toasts.map((toast) => {
        let Icon = Info;
        let iconColor = "text-sky-400";
        let borderClass = "border-[#2a2a32]";

        if (toast.type === 'success') {
          Icon = CheckCircle2;
          iconColor = "text-emerald-400";
          borderClass = "border-emerald-500/30";
        } else if (toast.type === 'warning') {
          Icon = AlertTriangle;
          iconColor = "text-amber-400";
          borderClass = "border-amber-500/30";
        } else if (toast.type === 'error') {
          Icon = XCircle;
          iconColor = "text-rose-500";
          borderClass = "border-rose-500/30";
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border bg-[#1c1c21] text-zinc-100 shadow-2xl transition-all ${borderClass}`}
          >
            <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iconColor}`} />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-white">{toast.title}</h4>
              {toast.message && (
                <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2 leading-relaxed">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
