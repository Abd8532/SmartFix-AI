import React, { useState, useEffect } from 'react';
import { useTickets } from '../../context/TicketContext';
import apiClient from '../../services/apiClient';
import Modal from '../common/Modal';
import Avatar from '../common/Avatar';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  Wrench, 
  Trash2,
  ExternalLink,
  AlertTriangle,
  XCircle,
  RotateCcw,
  ShieldAlert,
  FileText
} from 'lucide-react';
import { STATUS_CONFIG } from '../../types/mockData';

export default function TicketDetailModal({ ticketId, onClose }) {
  const { 
    tickets, 
    updateTicketStatus, 
    techCompleteTicket, 
    verifyTicketClosure, 
    rejectTicketClosure, 
    deleteTicket, 
    role,
    currentUser
  } = useTickets();

  const ticket = tickets.find((t) => t.id === ticketId);
  const [resolutionInput, setResolutionInput] = useState('');
  const [showRejectionForm, setShowRejectionForm] = useState(false);
  const [rejectionInput, setRejectionInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [presignedViewUrl, setPresignedViewUrl] = useState(null);

  const rawImage = ticket?.image || ticket?.photo || ticket?.imageUrl;
  const isDirectUrl = Boolean(
    rawImage &&
    !rawImage.startsWith('uploads/') &&
    !rawImage.startsWith('s3://')
  );

  useEffect(() => {
    const rawKey = ticket?.fileKey || (ticket?.photo && ticket.photo.startsWith('uploads/') ? ticket.photo : null);
    if (rawKey && ticket?.id && !isDirectUrl) {
      apiClient.uploads.getViewUrl(rawKey, ticket.id)
        .then((res) => {
          if (res?.viewUrl) setPresignedViewUrl(res.viewUrl);
        })
        .catch(() => {});
    }
  }, [ticket?.fileKey, ticket?.photo, ticket?.id, isDirectUrl]);

  if (!ticket) return null;

  const displayPhoto = presignedViewUrl || (isDirectUrl ? rawImage : null);

  const statusStyle = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.Open;

  let priorityBadgeClass = "bg-[#047857] text-white";
  if (ticket.priority === 'Emergency' || ticket.priority === 'Critical') {
    priorityBadgeClass = "bg-[#b91c1c] text-white";
  } else if (ticket.priority === 'Urgent' || ticket.priority === 'High') {
    priorityBadgeClass = "bg-[#b45309] text-white";
  }

  // Handle Technician Work Sign-off
  const handleTechComplete = async () => {
    setIsSubmitting(true);
    try {
      await techCompleteTicket(ticket.id, resolutionInput.trim());
      setResolutionInput('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Consumer Approval
  const handleUserVerify = async () => {
    setIsSubmitting(true);
    try {
      await verifyTicketClosure(ticket.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Consumer Rejection
  const handleUserReject = async () => {
    if (!rejectionInput.trim()) return;
    setIsSubmitting(true);
    try {
      await rejectTicketClosure(ticket.id, rejectionInput.trim());
      setRejectionInput('');
      setShowRejectionForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle In Progress transition
  const handleStartWork = async () => {
    setIsSubmitting(true);
    try {
      await updateTicketStatus(ticket.id, 'In Progress');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    deleteTicket(ticket.id);
    onClose();
  };

  return (
    <Modal
      isOpen={Boolean(ticketId)}
      onClose={onClose}
      title={`Work Order #${ticket.id}`}
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

          <div className="text-right text-xs text-zinc-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span>Reported: {new Date(ticket.createdAt).toLocaleString()}</span>
            </span>
          </div>
        </div>

        {/* Rejection Warning Banner (if reopened due to rejection) */}
        {ticket.rejectionReason && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400">
            <div className="font-bold flex items-center gap-1.5 mb-1 text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Consumer Rejection Reason (Reopened)</span>
            </div>
            <p className="leading-relaxed text-zinc-300 font-medium whitespace-pre-wrap">{ticket.rejectionReason}</p>
          </div>
        )}

        {/* Photo View */}
        {displayPhoto && (
          <div className="rounded-xl overflow-hidden border border-[#32323b] bg-[#18181c] relative max-h-80 flex items-center justify-center">
            <img
              src={displayPhoto}
              alt="Submitted fault documentation"
              className="w-full h-full object-contain max-h-80"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                if (e.currentTarget.parentElement) {
                  e.currentTarget.parentElement.style.display = 'none';
                }
              }}
            />
            <a
              href={displayPhoto}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-3 right-3 h-8 px-3 rounded-lg bg-black/70 hover:bg-black text-white text-xs font-medium flex items-center gap-1.5 border border-white/20 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Full Photo</span>
            </a>
          </div>
        )}

        {/* Problem Description */}
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5 font-['Plus_Jakarta_Sans',sans-serif]">
            Problem Description
          </h4>
          <h3 className="text-base font-bold text-white mb-2 font-['Plus_Jakarta_Sans',sans-serif] tracking-tight">{ticket.title}</h3>
          <div className="p-4 rounded-xl bg-[#24242b] border border-[#32323b] text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
            {ticket.description}
          </div>
        </div>

        {/* Location & Reporter Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-[#24242b] border border-[#32323b]">
            <p className="text-[11px] text-zinc-400 mb-1 font-medium">Location</p>
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-indigo-400" />
              <span>{ticket.location || 'General Campus Area'}</span>
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#24242b] border border-[#32323b]">
            <p className="text-[11px] text-zinc-400 mb-1 font-medium">Reported By</p>
            <div className="flex items-center gap-2">
              <Avatar
                src={ticket.reportedBy?.avatar}
                name={ticket.reportedBy?.name}
                size="w-6 h-6"
                className="ring-1 ring-white/10"
              />
              <span className="text-xs font-bold text-white">{ticket.reportedBy?.name || 'Campus Operator'}</span>
            </div>
          </div>
        </div>

        {/* Technician Resolution Notes */}
        {ticket.resolutionNotes && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
            <div className="font-bold text-emerald-300 flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Technician Resolution Report</span>
            </div>
            <p className="leading-relaxed text-zinc-200 font-medium">{ticket.resolutionNotes}</p>
            {ticket.resolvedAt && (
              <p className="text-[10px] text-zinc-400 mt-1">
                Completed: {new Date(ticket.resolvedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Dual-Approval Status Banner */}
        <div className="p-3.5 rounded-xl bg-[#24242b] border border-[#32323b] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-300">Dual-Sign-off:</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              ticket.techConfirmed ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-[#1c1c21] text-zinc-400 border border-[#32323b]'
            }`}>
              Technician {ticket.techConfirmed ? '✓ Confirmed' : '— Pending'}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              ticket.userConfirmed ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-[#1c1c21] text-zinc-400 border border-[#32323b]'
            }`}>
              Consumer {ticket.userConfirmed ? '✓ Confirmed' : '— Pending'}
            </span>
          </div>

          <span className="text-zinc-400 font-medium text-[11px]">
            {ticket.status === 'Completed'
              ? 'Status: Fully Completed & Verified'
              : ticket.status === 'Pending User Verification'
              ? 'Status: Awaiting Consumer Verification'
              : ticket.status === 'In Progress'
              ? 'Status: Technician Repair in Progress'
              : 'Status: Assigned in Queue'}
          </span>
        </div>

        {/* Consumer Actions (Dual Approval Verification or Rejection) */}
        {role === 'user' && (
          <div className="pt-4 border-t border-[#2a2a32] space-y-4">
            {ticket.status === 'Pending User Verification' && !ticket.userConfirmed && (
              <div className="p-4 rounded-xl bg-[#24242b] border border-[#32323b] space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                  <CheckCircle2 className="w-4 h-4 text-amber-400" />
                  <span>The technician has marked this issue as resolved. Please inspect the repair:</span>
                </div>

                {!showRejectionForm ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleUserVerify}
                      disabled={isSubmitting}
                      className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verify & Complete Work Order</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowRejectionForm(true)}
                      className="h-9 px-4 rounded-lg bg-[#1c1c21] hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-[#32323b] hover:border-rose-500/30 flex items-center gap-1.5 transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reject Work (Repair Incomplete)</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    <label className="text-xs font-bold text-zinc-200 block">
                      Explain why the repair is unsatisfactory (Mandatory):
                    </label>
                    <textarea
                      rows={3}
                      value={rejectionInput}
                      onChange={(e) => setRejectionInput(e.target.value)}
                      placeholder="e.g. The pipe is still dripping slightly under high pressure..."
                      className="w-full p-3 rounded-lg border border-[#32323b] bg-[#1c1c21] text-xs font-medium text-white focus:outline-none focus:border-rose-500"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleUserReject}
                        disabled={isSubmitting || !rejectionInput.trim()}
                        className="h-8 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Confirm Rejection & Reopen</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRejectionForm(false)}
                        className="h-8 px-3 rounded-lg bg-[#24242b] border border-[#32323b] text-zinc-300 hover:text-white text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {ticket.status === 'Completed' && (
              <div className="h-9 px-4 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Work Order Fully Verified & Closed</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete ticket #${ticket.id}? This will permanently remove it.`)) {
                    handleDelete();
                  }
                }}
                className="h-8 px-3.5 rounded-lg bg-[#1c1c21] hover:bg-rose-500/20 text-rose-400 text-xs font-medium border border-[#32323b] hover:border-rose-500/30 flex items-center gap-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Ticket</span>
              </button>
            </div>
          </div>
        )}

        {/* Technician Action Controls */}
        {role === 'technician' && (
          <div className="pt-4 border-t border-[#2a2a32] space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 font-['Plus_Jakarta_Sans',sans-serif]">
              <Wrench className="w-3.5 h-3.5 text-indigo-400" />
              <span>Technician Maintenance Actions</span>
            </h4>

            {ticket.status !== 'Completed' && (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Technician resolution report or parts replaced..."
                  value={resolutionInput}
                  onChange={(e) => setResolutionInput(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-[#24242b] border border-[#32323b] text-xs font-medium text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />

                <div className="flex flex-wrap items-center gap-2.5">
                  {ticket.status === 'Assigned' && (
                    <button
                      type="button"
                      onClick={handleStartWork}
                      disabled={isSubmitting}
                      className="h-9 px-4 rounded-lg bg-[#24242b] hover:bg-[#2e2e38] text-zinc-200 border border-[#32323b] text-xs font-medium transition"
                    >
                      Start Work (Mark In Progress)
                    </button>
                  )}

                  {!ticket.techConfirmed && (
                    <button
                      type="button"
                      onClick={handleTechComplete}
                      disabled={isSubmitting}
                      className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Complete Work (Send for User Verification)</span>
                    </button>
                  )}

                  {ticket.techConfirmed && !ticket.userConfirmed && (
                    <div className="h-9 px-3.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium text-xs flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Waiting for Consumer Verification</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Administrator Action Controls */}
        {role === 'admin' && (
          <div className="pt-4 border-t border-[#2a2a32] space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 font-['Plus_Jakarta_Sans',sans-serif]">
              <ShieldAlert className="w-3.5 h-3.5 text-indigo-400" />
              <span>Admin Operations</span>
            </h4>

            <div className="flex flex-wrap items-center gap-3">
              {ticket.status === 'Assigned' && (
                <button
                  type="button"
                  onClick={handleStartWork}
                  disabled={isSubmitting}
                  className="h-8 px-3 rounded-lg bg-[#24242b] hover:bg-[#2e2e38] text-zinc-200 border border-[#32323b] text-xs font-medium transition"
                >
                  Mark as In Progress
                </button>
              )}

              <button
                type="button"
                onClick={handleDelete}
                className="ml-auto h-8 px-3 rounded-lg bg-[#1c1c21] hover:bg-rose-500/20 text-rose-400 text-xs font-medium border border-[#32323b] hover:border-rose-500/30 flex items-center gap-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Ticket</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
