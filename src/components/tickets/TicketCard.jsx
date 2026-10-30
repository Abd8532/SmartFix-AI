import React, { useState } from 'react';
import { MapPin, CameraOff, AlertTriangle, CheckCircle2, Clock, Trash2, ArrowUpRight } from 'lucide-react';

const STATUS_CONFIG = {
  Assigned: {
    label: 'Assigned',
    bg: 'bg-[#FFF5D9]',
    text: 'text-[#FFBB38]',
    border: 'border-[#FFBB38]/30',
    dot: 'bg-[#FFBB38]'
  },
  'In Progress': {
    label: 'In Progress',
    bg: 'bg-[#E7EDFF]',
    text: 'text-[#2D60FF]',
    border: 'border-[#2D60FF]/30',
    dot: 'bg-[#2D60FF]'
  },
  'Awaiting User Verification': {
    label: 'Awaiting User Verification',
    bg: 'bg-[#EDE8FF]',
    text: 'text-[#8A5AFF]',
    border: 'border-[#8A5AFF]/30',
    dot: 'bg-[#8A5AFF]'
  },
  Completed: {
    label: 'Completed',
    bg: 'bg-[#DCFAF8]',
    text: 'text-[#16DBCC]',
    border: 'border-[#16DBCC]/30',
    dot: 'bg-[#16DBCC]'
  }
};

export default function TicketCard({
  ticket,
  onClick,
  onDelete,
  onVerifyClosure,
  onRejectClosure,
  showActions = true,
  className = ''
}) {
  const [imgError, setImgError] = useState(false);

  if (!ticket) return null;

  // Robust multi-key image resolution across photo, image, and imageUrl
  const imageUrl = ticket.image || ticket.photo || ticket.imageUrl;
  // If the image is an internal S3 key without presigned protocol, treat as needing fallback until resolved
  const isDirectDisplayable = Boolean(
    imageUrl &&
    !imgError &&
    !imageUrl.startsWith('uploads/') &&
    !imageUrl.startsWith('s3://')
  );

  const statusStyle = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.Assigned;

  return (
    <div
      onClick={onClick}
      className={`group relative bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-[#E6EFF5] hover:border-[#2D60FF]/40 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03),_0_4px_16px_-4px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_-4px_rgba(45,96,255,0.12)] transition-all duration-300 cursor-pointer text-left ${className}`}
    >
      {/* Card Header: Ticket ID & Status */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-slate-400">
            #{ticket.id}
          </span>
          {ticket.isHazard && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
              <AlertTriangle className="w-3 h-3 text-red-600" />
              Safety Hazard
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
            <span>{statusStyle.label}</span>
          </span>

          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete ticket #${ticket.id}? This action cannot be undone.`)) {
                  onDelete(ticket.id);
                }
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all duration-200"
              title="Delete ticket"
              aria-label="Delete ticket"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Thumbnail & Information */}
      <div className="flex gap-3 sm:gap-4 mb-3">
        {/* Robust Image Thumbnail Renderer */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-[#F5F7FA] border border-[#E6EFF5] shrink-0 relative flex items-center justify-center">
          {isDirectDisplayable ? (
            <img
              src={imageUrl}
              alt="Fault"
              className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-xl group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-1">
              <CameraOff className="w-5 h-5 mb-1 text-slate-400" />
              <span className="text-[9px] font-medium leading-none">No photo</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#2D60FF] transition-colors line-clamp-1 mb-1 font-['Plus_Jakarta_Sans']">
            {ticket.title}
          </h4>
          <p className="text-xs text-slate-500 font-medium line-clamp-2 leading-relaxed">
            {ticket.description}
          </p>

          {ticket.location && (
            <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-2 truncate">
              <MapPin className="w-3.5 h-3.5 text-[#2D60FF] shrink-0" />
              <span className="truncate font-semibold text-slate-800">{ticket.location}</span>
            </p>
          )}
        </div>
      </div>

      {/* Dual Confirmation Sign-Off & Verification Action Bar */}
      {showActions && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#E6EFF5]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Sign-off:</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              ticket.userConfirmed ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-500'
            }`}>
              User {ticket.userConfirmed ? '✓' : '—'}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              ticket.techConfirmed ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-500'
            }`}>
              Tech {ticket.techConfirmed ? '✓' : '—'}
            </span>
          </div>

          {ticket.status === 'Awaiting User Verification' && onVerifyClosure && (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => onVerifyClosure(ticket.id)}
                className="h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 transition-all"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm</span>
              </button>
              {onRejectClosure && (
                <button
                  type="button"
                  onClick={() => onRejectClosure(ticket.id)}
                  className="h-8 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all"
                >
                  Reopen
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
