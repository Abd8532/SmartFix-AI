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
  const { tickets, updateTicketStatus, handleTicketClosure, deleteTicket, role } = useTickets();

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
      <div className="space-y-6 text-slate-900">
        {/* Status & Priority Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusStyle.pill}`}>
              <span>{statusStyle.label}</span>
            </span>

            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${priorityBadgeClass}`}>
              {ticket.priority === 'Critical' ? 'Emergency' : ticket.priority === 'High' ? 'Urgent' : ticket.priority}
            </span>

            <span className="px-3 py-1 rounded-full bg-white text-slate-700 text-xs border border-[#E6EFF5] font-semibold">
              {ticket.category}
            </span>

            {ticket.isHazard && (
              <span className="px-2.5 py-0.5 rounded text-[10px] font-extrabold bg-[#FFE0EB] text-[#FF4B4A] border border-[#FF4B4A]/30">
                HAZARD
              </span>
            )}
          </div>

          <div className="text-right text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Reported: {new Date(ticket.createdAt).toLocaleString()}</span>
            </span>
          </div>
        </div>

        {/* Photo View */}
        {ticket.photo && (
          <div className="rounded-2xl overflow-hidden border border-[#E6EFF5] bg-[#F5F7FA] relative max-h-80 flex items-center justify-center shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]">
            <img
              src={ticket.photo}
              alt="Submitted fault documentation"
              className="w-full h-full object-contain max-h-80"
            />
            <a
              href={ticket.photo}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-3 right-3 h-10 px-4 rounded-xl bg-black/60 hover:bg-black/80 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/20 shadow-sm transition-all duration-200 active:scale-[0.98]"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Full Photo</span>
            </a>
          </div>
        )}

        {/* Problem Description */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-['Plus_Jakarta_Sans']">
            Problem Description
          </h4>
          <h3 className="text-lg font-bold text-slate-900 mb-2 font-['Plus_Jakarta_Sans'] tracking-tight">{ticket.title}</h3>
          <div className="p-5 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2] text-sm text-slate-800 leading-relaxed whitespace-pre-wrap shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]">
            {ticket.description}
          </div>
        </div>

        {/* Location & Reporter Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]">
            <p className="text-xs text-slate-500 mb-1 font-medium">Location</p>
            <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#2D60FF]" />
              <span>{ticket.location || 'General Campus Area'}</span>
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]">
            <p className="text-xs text-slate-500 mb-1 font-medium">Reported By</p>
            <div className="flex items-center gap-2">
              <Avatar
                src={ticket.reportedBy?.avatar}
                name={ticket.reportedBy?.name}
                size="w-7 h-7"
                className="ring-1 ring-[#DFEAF2]"
              />
              <span className="text-xs font-bold text-slate-900">{ticket.reportedBy?.name || 'Campus Operator'}</span>
            </div>
          </div>
        </div>

        {/* Resolution Notes */}
        {ticket.resolutionNotes && (
          <div className="p-4 rounded-2xl bg-[#DCFAF8] border border-[#16DBCC]/30 text-xs text-[#16DBCC] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]">
            <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-4 h-4 text-[#16DBCC]" />
              <span>Technician Resolution Log</span>
            </div>
            <p className="leading-relaxed text-slate-800 font-medium">{ticket.resolutionNotes}</p>
            {ticket.resolvedAt && (
              <p className="text-xs text-slate-500 mt-1">
                Resolved: {new Date(ticket.resolvedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Dual-Approval Status Banner */}
        <div className="p-4 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">Dual-Sign-off:</span>
            <span className={`px-2.5 py-1 rounded-full font-bold ${
              ticket.userConfirmed ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' : 'bg-slate-200/70 text-slate-600'
            }`}>
              User {ticket.userConfirmed ? '✓ Confirmed' : '— Pending'}
            </span>
            <span className={`px-2.5 py-1 rounded-full font-bold ${
              ticket.techConfirmed ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' : 'bg-slate-200/70 text-slate-600'
            }`}>
              Technician {ticket.techConfirmed ? '✓ Confirmed' : '— Pending'}
            </span>
          </div>

          <span className="font-bold text-slate-500">
            {ticket.userConfirmed && ticket.techConfirmed 
              ? 'Status: Fully Completed'
              : ticket.userConfirmed 
              ? 'Status: Awaiting Tech Sign-off'
              : ticket.techConfirmed 
              ? 'Status: Pending User Verification'
              : 'Status: In Queue / Assigned'}
          </span>
        </div>

        {/* User Action Controls (Mark Complete & Delete Ticket) */}
        {role === 'user' && (
          <div className="pt-4 border-t border-[#E6EFF5] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {!ticket.userConfirmed ? (
                <button
                  type="button"
                  onClick={() => handleTicketClosure(ticket.id, 'user')}
                  className={`h-11 px-6 rounded-2xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all duration-200 active:scale-[0.98] shadow-md ${
                    ticket.techConfirmed
                      ? 'bg-[#16DBCC] hover:bg-emerald-600 text-white shadow-emerald-500/25'
                      : 'bg-[#2D60FF] hover:bg-[#1814F3] text-white shadow-[#2D60FF]/25'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{ticket.techConfirmed ? 'Verify & Complete' : 'Mark Complete'}</span>
                </button>
              ) : !ticket.techConfirmed ? (
                <div className="h-11 px-5 rounded-2xl bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/30 font-bold text-xs flex items-center gap-2 shadow-xs cursor-default">
                  <Clock className="w-4 h-4 text-[#FFBB38]" />
                  <span>Marked Done (Waiting for Tech)</span>
                </div>
              ) : (
                <div className="h-11 px-5 rounded-2xl bg-[#DCFAF8] text-[#16DBCC] border border-[#16DBCC]/30 font-bold text-xs flex items-center gap-2 shadow-xs">
                  <CheckCircle2 className="w-4 h-4 text-[#16DBCC]" />
                  <span>Completed ✓</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete ticket #${ticket.id}? This will permanently remove it.`)) {
                  handleDelete();
                }
              }}
              className="h-11 px-5 rounded-2xl bg-[#FFE0EB] hover:bg-rose-100 text-[#FF4B4A] text-xs font-semibold border border-[#FF4B4A]/30 flex items-center gap-1.5 transition-all duration-200 active:scale-[0.98] shadow-xs"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Ticket</span>
            </button>
          </div>
        )}

        {/* Technician or Admin Action Controls */}
        {(role === 'technician' || role === 'admin') && (
          <div className="pt-4 border-t border-[#E6EFF5] space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-['Plus_Jakarta_Sans']">
              <Wrench className="w-3.5 h-3.5 text-[#2D60FF]" />
              <span>Maintenance Status Actions</span>
            </h4>

            {ticket.status !== 'Done' && (
              <div>
                <input
                  type="text"
                  placeholder="Optional resolution or inspection note..."
                  value={resolutionInput}
                  onChange={(e) => setResolutionInput(e.target.value)}
                  className="w-full h-11 px-4 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2] text-xs font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#2D60FF] focus:ring-2 focus:ring-[#2D60FF]/20 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {role === 'technician' && !ticket.techConfirmed && (
                <button
                  type="button"
                  onClick={() => handleTicketClosure(ticket.id, 'technician')}
                  className="h-11 px-6 rounded-2xl bg-[#2D60FF] hover:bg-[#1814F3] text-white text-xs font-bold transition-all duration-200 active:scale-[0.98] flex items-center gap-1.5 shadow-md shadow-[#2D60FF]/25"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Mark as Fixed (Dual-Approval)</span>
                </button>
              )}

              {ticket.status !== 'In Progress' && ticket.status !== 'Done' && (
                <button
                  onClick={() => handleStatusChange('In Progress')}
                  className="h-11 px-5 rounded-2xl bg-[#F5F7FA] hover:bg-[#E6EFF5] text-slate-900 text-xs font-semibold border border-[#DFEAF2] transition-all duration-200 active:scale-[0.98] shadow-xs"
                >
                  Mark as In Progress
                </button>
              )}

              {ticket.status !== 'Done' ? (
                <button
                  onClick={() => handleStatusChange('Done')}
                  className="h-11 px-6 rounded-2xl bg-[#2D60FF] hover:bg-[#1814F3] text-white text-xs font-bold transition-all duration-200 active:scale-[0.98] flex items-center gap-1.5 shadow-md shadow-[#2D60FF]/25"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Mark as Done (Resolved)</span>
                </button>
              ) : (
                <button
                  onClick={() => handleStatusChange('Open')}
                  className="h-11 px-5 rounded-2xl bg-[#F5F7FA] hover:bg-[#E6EFF5] text-slate-600 text-xs font-semibold border border-[#DFEAF2] transition-all duration-200 active:scale-[0.98]"
                >
                  Reopen Ticket
                </button>
              )}

              <button
                onClick={handleDelete}
                className="ml-auto h-11 px-5 rounded-2xl bg-[#FFE0EB] hover:bg-rose-100 text-[#FF4B4A] text-xs font-semibold border border-[#FF4B4A]/30 flex items-center gap-1.5 transition-all duration-200 active:scale-[0.98] shadow-xs"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Ticket</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
