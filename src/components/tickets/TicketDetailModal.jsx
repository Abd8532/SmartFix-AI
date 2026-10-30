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

          <div className="text-right text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Reported: {new Date(ticket.createdAt).toLocaleString()}</span>
            </span>
          </div>
        </div>

        {/* Rejection Warning Banner (if reopened due to rejection) */}
        {ticket.rejectionReason && (
          <div className="p-4 rounded-2xl bg-[#FFE0EB] border border-[#FF4B4A]/30 text-xs text-[#FF4B4A] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]">
            <div className="font-bold flex items-center gap-1.5 mb-1 text-red-800">
              <AlertTriangle className="w-4 h-4 text-[#FF4B4A]" />
              <span>Consumer Rejection Reason (Reopened)</span>
            </div>
            <p className="leading-relaxed text-red-900 font-medium whitespace-pre-wrap">{ticket.rejectionReason}</p>
          </div>
        )}

        {/* Photo View */}
        {displayPhoto && (
          <div className="rounded-2xl overflow-hidden border border-[#E6EFF5] bg-[#F5F7FA] relative max-h-80 flex items-center justify-center shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]">
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

        {/* Technician Resolution Notes */}
        {ticket.resolutionNotes && (
          <div className="p-4 rounded-2xl bg-[#DCFAF8] border border-[#16DBCC]/30 text-xs text-[#16DBCC] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]">
            <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-4 h-4 text-[#16DBCC]" />
              <span>Technician Resolution Report</span>
            </div>
            <p className="leading-relaxed text-slate-800 font-medium">{ticket.resolutionNotes}</p>
            {ticket.resolvedAt && (
              <p className="text-xs text-slate-500 mt-1">
                Completed: {new Date(ticket.resolvedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Dual-Approval Status Banner */}
        <div className="p-4 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">Dual-Sign-off:</span>
            <span className={`px-2.5 py-1 rounded-full font-bold ${
              ticket.techConfirmed ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' : 'bg-slate-200/70 text-slate-600'
            }`}>
              Technician {ticket.techConfirmed ? '✓ Confirmed' : '— Pending'}
            </span>
            <span className={`px-2.5 py-1 rounded-full font-bold ${
              ticket.userConfirmed ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' : 'bg-slate-200/70 text-slate-600'
            }`}>
              Consumer {ticket.userConfirmed ? '✓ Confirmed' : '— Pending'}
            </span>
          </div>

          <span className="font-bold text-slate-500">
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
          <div className="pt-4 border-t border-[#E6EFF5] space-y-4">
            {ticket.status === 'Pending User Verification' && !ticket.userConfirmed && (
              <div className="p-4 rounded-2xl bg-[#FFF5D9] border border-[#FFBB38]/30 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <CheckCircle2 className="w-4 h-4 text-[#FFBB38]" />
                  <span>The technician has marked this issue as resolved. Please inspect the repair:</span>
                </div>

                {!showRejectionForm ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleUserVerify}
                      disabled={isSubmitting}
                      className="h-11 px-6 rounded-2xl bg-[#16DBCC] hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-2 transition-all duration-200 active:scale-[0.98] shadow-md shadow-emerald-500/25"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Verify & Complete Work Order</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowRejectionForm(true)}
                      className="h-11 px-5 rounded-2xl bg-[#FFE0EB] hover:bg-rose-100 text-[#FF4B4A] text-xs font-semibold border border-[#FF4B4A]/30 flex items-center gap-1.5 transition-all duration-200 active:scale-[0.98]"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Reject Work (Repair Incomplete)</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <label className="text-xs font-bold text-slate-900 block">
                      Explain why the repair is unsatisfactory (Mandatory):
                    </label>
                    <textarea
                      rows={3}
                      value={rejectionInput}
                      onChange={(e) => setRejectionInput(e.target.value)}
                      placeholder="e.g. The pipe is still dripping slightly under high pressure..."
                      className="w-full p-3 rounded-xl border border-red-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleUserReject}
                        disabled={isSubmitting || !rejectionInput.trim()}
                        className="h-10 px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Confirm Rejection & Reopen</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRejectionForm(false)}
                        className="h-10 px-4 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {ticket.status === 'Completed' && (
              <div className="h-11 px-5 rounded-2xl bg-[#DCFAF8] text-[#16DBCC] border border-[#16DBCC]/30 font-bold text-xs flex items-center gap-2 shadow-xs">
                <CheckCircle2 className="w-4 h-4 text-[#16DBCC]" />
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
                className="h-10 px-4 rounded-2xl bg-[#FFE0EB] hover:bg-rose-100 text-[#FF4B4A] text-xs font-semibold border border-[#FF4B4A]/30 flex items-center gap-1.5 transition-all duration-200 active:scale-[0.98]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Ticket</span>
              </button>
            </div>
          </div>
        )}

        {/* Technician Action Controls */}
        {role === 'technician' && (
          <div className="pt-4 border-t border-[#E6EFF5] space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-['Plus_Jakarta_Sans']">
              <Wrench className="w-3.5 h-3.5 text-[#2D60FF]" />
              <span>Technician Maintenance Actions</span>
            </h4>

            {ticket.status !== 'Completed' && (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Technician resolution report or parts replaced..."
                  value={resolutionInput}
                  onChange={(e) => setResolutionInput(e.target.value)}
                  className="w-full h-11 px-4 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2] text-xs font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#2D60FF] focus:ring-2 focus:ring-[#2D60FF]/20 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)]"
                />

                <div className="flex flex-wrap items-center gap-3">
                  {ticket.status === 'Assigned' && (
                    <button
                      type="button"
                      onClick={handleStartWork}
                      disabled={isSubmitting}
                      className="h-11 px-5 rounded-2xl bg-[#F5F7FA] hover:bg-[#E6EFF5] text-slate-900 text-xs font-semibold border border-[#DFEAF2] transition-all duration-200 active:scale-[0.98] shadow-xs"
                    >
                      Start Work (Mark In Progress)
                    </button>
                  )}

                  {!ticket.techConfirmed && (
                    <button
                      type="button"
                      onClick={handleTechComplete}
                      disabled={isSubmitting}
                      className="h-11 px-6 rounded-2xl bg-[#2D60FF] hover:bg-[#1814F3] text-white text-xs font-bold transition-all duration-200 active:scale-[0.98] flex items-center gap-1.5 shadow-md shadow-[#2D60FF]/25"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Complete Work (Send for User Verification)</span>
                    </button>
                  )}

                  {ticket.techConfirmed && !ticket.userConfirmed && (
                    <div className="h-11 px-5 rounded-2xl bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/30 font-bold text-xs flex items-center gap-2">
                      <Clock className="w-4 h-4" />
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
          <div className="pt-4 border-t border-[#E6EFF5] space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-['Plus_Jakarta_Sans']">
              <ShieldAlert className="w-3.5 h-3.5 text-[#2D60FF]" />
              <span>Admin Operations</span>
            </h4>

            <div className="flex flex-wrap items-center gap-3">
              {ticket.status === 'Assigned' && (
                <button
                  type="button"
                  onClick={handleStartWork}
                  disabled={isSubmitting}
                  className="h-11 px-5 rounded-2xl bg-[#F5F7FA] hover:bg-[#E6EFF5] text-slate-900 text-xs font-semibold border border-[#DFEAF2] transition-all duration-200 active:scale-[0.98] shadow-xs"
                >
                  Mark as In Progress
                </button>
              )}

              <button
                type="button"
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
