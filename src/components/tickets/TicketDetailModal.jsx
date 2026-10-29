import React, { useState } from 'react';
import { useTickets } from '../../context/TicketContext';
import Modal from '../common/Modal';
import Avatar from '../common/Avatar';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  Wrench, 
  Trash2,
  ExternalLink
} from 'lucide-react';
import { STATUS_CONFIG } from '../../types/mockData';

export default function TicketDetailModal({ ticketId, onClose }) {
  const { tickets, updateTicketStatus, deleteTicket, role } = useTickets();

  const ticket = tickets.find((t) => t.id === ticketId);
  const [resolutionInput, setResolutionInput] = useState('');

  if (!ticket) return null;

  const statusStyle = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.Open;

  let priorityBadgeClass = "bg-[#047857] text-white";
  if (ticket.priority === 'Emergency' || ticket.priority === 'Critical') {
    priorityBadgeClass = "bg-[#b91c1c] text-white";
  } else if (ticket.priority === 'Urgent' || ticket.priority === 'High') {
    priorityBadgeClass = "bg-[#b45309] text-white";
  }

  const handleStatusChange = (newStatus) => {
    updateTicketStatus(ticket.id, newStatus, resolutionInput.trim());
    setResolutionInput('');
  };

  const handleDelete = () => {
    deleteTicket(ticket.id);
    onClose();
  };

  return (
    <Modal
      isOpen={Boolean(ticketId)}
      onClose={onClose}
      title={`Ticket #${ticket.id} Details`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-6">
        {/* Status & Priority Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusStyle.pill}`}>
              <span>{statusStyle.label}</span>
            </span>

            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${priorityBadgeClass}`}>
              {ticket.priority === 'Critical' ? 'Emergency' : ticket.priority === 'High' ? 'Urgent' : ticket.priority}
            </span>

            <span className="px-2.5 py-1 rounded-md bg-white text-slate-700 text-xs border border-slate-200 font-medium">
              {ticket.category}
            </span>

            {ticket.isHazard && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#b91c1c] text-white">
                HAZARD
              </span>
            )}
          </div>

          <div className="text-right text-[11px] text-slate-500 font-medium">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Reported: {new Date(ticket.createdAt).toLocaleString()}</span>
            </span>
          </div>
        </div>

        {/* Photo View */}
        {ticket.photo && (
          <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 relative max-h-80 flex items-center justify-center">
            <img
              src={ticket.photo}
              alt="Submitted fault documentation"
              className="w-full h-full object-contain max-h-80"
            />
            <a
              href={ticket.photo}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-3 right-3 p-2 rounded-xl bg-white/90 hover:bg-white text-slate-800 text-xs flex items-center gap-1.5 border border-slate-200 shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Full Photo</span>
            </a>
          </div>
        )}

        {/* Problem Description */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Problem Description
          </h4>
          <h3 className="text-base font-bold text-slate-900 mb-2">{ticket.title}</h3>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {ticket.description}
          </div>
        </div>

        {/* Location & Reporter Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-[11px] text-slate-500 mb-1 font-medium">Location</p>
            <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-sky-600" />
              <span>{ticket.location || 'General Campus Area'}</span>
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-[11px] text-slate-500 mb-1 font-medium">Reported By</p>
            <div className="flex items-center gap-2">
              <Avatar
                src={ticket.reportedBy?.avatar}
                name={ticket.reportedBy?.name}
                size="w-6 h-6"
                className="ring-1 ring-slate-200"
              />
              <span className="text-xs font-bold text-slate-900">{ticket.reportedBy?.name || 'Campus Operator'}</span>
            </div>
          </div>
        </div>

        {/* Resolution Notes */}
        {ticket.resolutionNotes && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
            <div className="font-bold text-emerald-800 flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Technician Resolution Log</span>
            </div>
            <p className="leading-relaxed">{ticket.resolutionNotes}</p>
            {ticket.resolvedAt && (
              <p className="text-[10px] text-emerald-700 mt-1">
                Resolved: {new Date(ticket.resolvedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Technician or Admin Action Controls */}
        {(role === 'technician' || role === 'admin') && (
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-amber-600" />
              <span>Maintenance Status Actions</span>
            </h4>

            {ticket.status !== 'Done' && (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Optional resolution or inspection note..."
                  value={resolutionInput}
                  onChange={(e) => setResolutionInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 shadow-2xs"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {ticket.status !== 'In Progress' && ticket.status !== 'Done' && (
                <button
                  onClick={() => handleStatusChange('In Progress')}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-300 transition-all shadow-2xs"
                >
                  Mark as In Progress
                </button>
              )}

              {ticket.status !== 'Done' ? (
                <button
                  onClick={() => handleStatusChange('Done')}
                  className="px-4 py-2 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Mark as Done (Resolved)</span>
                </button>
              ) : (
                <button
                  onClick={() => handleStatusChange('Open')}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition-all"
                >
                  Reopen Ticket
                </button>
              )}

              {role === 'admin' && (
                <button
                  onClick={handleDelete}
                  className="ml-auto px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200 flex items-center gap-1.5 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Ticket</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
