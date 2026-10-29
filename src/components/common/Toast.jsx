import React from 'react';
import { useTickets } from '../../context/TicketContext';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

export default function ToastContainer() {
  const { toasts, removeToast } = useTickets();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:w-96 z-50 flex flex-col gap-2.5 pointer-events-none">
      {toasts.map((toast) => {
        let Icon = Info;
        let iconColor = "text-sky-600";
        let borderClass = "border-slate-200";

        if (toast.type === 'success') {
          Icon = CheckCircle2;
          iconColor = "text-emerald-600";
        } else if (toast.type === 'warning') {
          Icon = AlertTriangle;
          iconColor = "text-amber-600";
        } else if (toast.type === 'error') {
          Icon = XCircle;
          iconColor = "text-rose-600";
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border bg-white shadow-lg animate-slide-up transition-all ${borderClass}`}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-slate-900">{toast.title}</h4>
              {toast.message && (
                <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{toast.message}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
