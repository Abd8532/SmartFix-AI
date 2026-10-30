import React from 'react';
import { 
  Check, 
  MapPin, 
  Trash2, 
  ExternalLink, 
  CheckCircle2, 
  CameraOff,
  Clock,
  Sparkles,
  AlertTriangle
} from 'lucide-react';

export default function NeetCodeTicketTable({
  tickets = [],
  onSelectTicket,
  onToggleComplete,
  onDeleteTicket,
  role = 'user',
  emptyMessage = 'No tickets match the selected filters.'
}) {
  if (!tickets || tickets.length === 0) {
    return (
      <div className="bg-[#1c1c21] border border-[#2a2a32] rounded-xl p-8 text-center text-zinc-400">
        <Clock className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
        <p className="text-sm font-medium text-zinc-300">{emptyMessage}</p>
        <p className="text-xs text-zinc-500 mt-1">Adjust your search query or category filter above.</p>
      </div>
    );
  }

  // Helper for difficulty-colored urgency matching NeetCode's difficulty labels:
  // Routine -> Emerald green
  // Moderate / Urgent -> Amber/Yellow
  // Emergency -> Coral Red
  const getUrgencyBadge = (urgency) => {
    const u = String(urgency || 'Routine').toLowerCase();
    if (u === 'emergency' || u === 'critical') {
      return (
        <span className="text-rose-500 font-semibold text-xs">
          Emergency
        </span>
      );
    }
    if (u === 'urgent' || u === 'moderate' || u === 'high') {
      return (
        <span className="text-amber-400 font-semibold text-xs">
          Urgent
        </span>
      );
    }
    return (
      <span className="text-emerald-400 font-semibold text-xs">
        Routine
      </span>
    );
  };

  return (
    <div className="bg-[#1c1c21] border border-[#2a2a32] rounded-xl overflow-hidden">
      {/* Table Column Headers */}
      <div className="hidden sm:grid grid-cols-12 gap-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-[#2a2a32] px-4 py-3 bg-[#18181c]">
        <div className="col-span-1 text-center">Status</div>
        <div className="col-span-5">Ticket / Issue</div>
        <div className="col-span-3">Location</div>
        <div className="col-span-2">Priority</div>
        <div className="col-span-1 text-right">Actions</div>
      </div>

      {/* Row List */}
      <div className="divide-y divide-[#24242c]">
        {tickets.map((ticket) => {
          const isResolved = ticket.status === 'Completed' || ticket.status === 'Done' || ticket.status === 'Resolved';
          const isAwaitingVerification = ticket.status === 'Pending User Verification';
          const rawImage = ticket.image || ticket.photo || ticket.imageUrl;
          const ragVolume = Number(ticket.ragTicketVolume || 1);
          const priorityScore = ticket.priorityScore !== undefined ? ticket.priorityScore : 40;

          return (
            <div
              key={ticket.id}
              onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
              className="border-b border-[#24242c] last:border-b-0 hover:bg-[#23232a] px-4 py-3.5 flex flex-col sm:grid sm:grid-cols-12 sm:items-center gap-3 transition cursor-pointer group"
            >
              {/* Column 1: Interactive Circular Completion Checkbox */}
              <div 
                className="col-span-1 flex items-center sm:justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onToggleComplete) onToggleComplete(ticket);
                }}
              >
                <button
                  type="button"
                  title={isResolved ? "Completed" : "Mark as verified/complete"}
                  className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                    isResolved
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : isAwaitingVerification
                      ? 'border-amber-400 hover:border-amber-300 text-amber-400 hover:bg-amber-400/10'
                      : 'border-zinc-600 hover:border-zinc-400 text-transparent hover:text-zinc-500'
                  }`}
                >
                  <Check className="w-3 h-3 stroke-[3]" />
                </button>
              </div>

              {/* Column 2: Title, Thumbnail & RAG Badge */}
              <div className="col-span-5 min-w-0 flex items-center gap-3">
                {/* Thumbnail Preview */}
                <div className="w-10 h-10 rounded-lg bg-[#24242b] border border-[#32323b] overflow-hidden shrink-0 flex items-center justify-center text-zinc-500">
                  {rawImage ? (
                    <img
                      src={rawImage}
                      alt="Fault preview"
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <CameraOff className="w-4 h-4 text-zinc-600" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-100 font-medium text-sm truncate group-hover:text-indigo-300 transition-colors">
                      {ticket.title || ticket.complaint || 'Maintenance Request'}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                      #{String(ticket.id).replace('TCK-', '').slice(-4)}
                    </span>
                  </div>

                  {/* RAG Escalation & Volume Badge */}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-zinc-400 font-medium">
                      {ticket.category || 'General'}
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded">
                      <span>📊 RAG History: {ragVolume} {ragVolume === 1 ? 'Report' : 'Reports'}</span>
                      <span className="text-zinc-400">({priorityScore}/100)</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Column 3: Location */}
              <div className="col-span-3 flex items-center gap-1.5 text-xs text-zinc-300 truncate">
                <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="truncate">{ticket.location || 'Campus Facilities'}</span>
              </div>

              {/* Column 4: Semantic Urgency Badge (NeetCode difficulty colors) */}
              <div className="col-span-2 flex items-center">
                {getUrgencyBadge(ticket.urgency || ticket.priority)}
              </div>

              {/* Column 5: Action buttons */}
              <div 
                className="col-span-1 flex items-center justify-end gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onSelectTicket && onSelectTicket(ticket.id)}
                  title="View ticket details"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#2e2e38] transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>

                {role === 'admin' && onDeleteTicket && (
                  <button
                    type="button"
                    onClick={() => onDeleteTicket(ticket.id)}
                    title="Delete ticket"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
