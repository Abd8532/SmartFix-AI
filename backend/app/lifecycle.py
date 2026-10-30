"""
Lifecycle, State Machine, Safety Overrides & Dual Approval Engine for SmartFix AI
Authoritative rules for ticket state transitions, safety clamps, and dual confirmation.
Enforces that:
- Direct status transitions to Completed are strictly prohibited.
- Administrators cannot impersonate technician or consumer confirmations.
- Only the assigned technician can complete a repair; unassigned completion is blocked.
- Only the reporting consumer can verify closure or reject and reopen the ticket.
- Rejection reason is persistently recorded and increments reopen count.
"""
import re
from typing import Dict, Any, Tuple
from datetime import datetime
from .models import TicketStatus, TicketPriority
from .auth import AuthenticatedUser

# Safety-critical regex patterns that trigger mandatory Emergency elevation
SAFETY_CRITICAL_PATTERNS = [
    r"\bgas\s+leak\b",
    r"\bnatural\s+gas\b",
    r"\bgas\s+odor\b",
    r"\bcarbon\s+monoxide\b",
    r"\belectrical\s+fire\b",
    r"\bsparking\b",
    r"\barc\s+flash\b",
    r"\blive\s+wire\b",
    r"\bexposed\s+wire\b",
    r"\bsmoke\s+coming\s+from\b",
    r"\bchemical\s+spill\b",
    r"\bstructural\s+collapse\b",
    r"\bactive\s+burst\b",
    r"\bhigh-pressure\s+water\s+leak\b",
    r"\bflooding\s+near\b.*?\b(electrical|socket|panel|breaker)\b"
]

COMPILED_SAFETY_PATTERNS = [re.compile(p, re.IGNORECASE) for p in SAFETY_CRITICAL_PATTERNS]


def evaluate_safety_critical(
    text: str,
    requested_priority: str = TicketPriority.ROUTINE,
    requested_score: int = 30,
    is_hazard: bool = False
) -> Tuple[str, int, bool, bool]:
    """
    Evaluates text against safety-critical hazard rules.
    Returns (priority, priority_score, is_hazard, safety_override_triggered).
    Guarantees that safety-critical hazards cannot be silently downgraded.
    """
    triggered = False
    for pat in COMPILED_SAFETY_PATTERNS:
        if pat.search(text):
            triggered = True
            break

    if triggered:
        return TicketPriority.EMERGENCY, max(requested_score, 95), True, True

    final_is_hazard = is_hazard or requested_priority == TicketPriority.EMERGENCY
    return requested_priority, requested_score, final_is_hazard, False


def can_technician_work_on_ticket(ticket: Dict[str, Any], user: AuthenticatedUser) -> bool:
    """
    Checks if a technician is authorized to work on this ticket.
    A technician can only complete or modify a ticket if it is assigned to them.
    """
    if not user.is_technician():
        return False

    assigned_tech_id = ticket.get("assignedTechId")
    if not assigned_tech_id:
        return False

    return assigned_tech_id == user.id


def transition_ticket_status(
    ticket: Dict[str, Any],
    new_status: str,
    actor: AuthenticatedUser
) -> Dict[str, Any]:
    """
    Authoritative state transition validator.
    Direct setting of status to Completed is strictly prohibited.
    """
    current_status = ticket.get("status") or TicketStatus.ASSIGNED

    if new_status == TicketStatus.COMPLETED or new_status == "Done":
        raise ValueError("Direct transition to Completed is prohibited. Dual approval is strictly enforced.")

    if new_status == TicketStatus.IN_PROGRESS:
        if actor.is_technician():
            assigned_tech_id = ticket.get("assignedTechId")
            cat = (ticket.get("category") or "").strip().lower()
            user_spec = (actor.specialty or "").strip().lower()

            if assigned_tech_id and assigned_tech_id != actor.id:
                raise PermissionError("Access Denied: Work order is assigned to another technician.")

            # If unassigned, technician claims the ticket on starting work if specialty matches
            if not assigned_tech_id:
                if user_spec != "general" and user_spec and cat != user_spec:
                    raise PermissionError(f"Access Denied: Ticket category '{ticket.get('category')}' does not match your specialty '{actor.specialty}'.")
                ticket["assignedTechId"] = actor.id
                ticket["assignedTo"] = actor.name

        elif not actor.is_admin():
            raise PermissionError("Only an assigned technician or administrator can mark a ticket In Progress.")

        ticket["status"] = TicketStatus.IN_PROGRESS
        ticket["Status"] = TicketStatus.IN_PROGRESS
        ticket["updatedAt"] = datetime.utcnow().isoformat() + "Z"
        return ticket

    if new_status == TicketStatus.ASSIGNED:
        if not actor.is_admin():
            raise PermissionError("Only an administrator can revert a ticket back to Assigned.")
        ticket["status"] = TicketStatus.ASSIGNED
        ticket["Status"] = TicketStatus.ASSIGNED
        ticket["updatedAt"] = datetime.utcnow().isoformat() + "Z"
        return ticket

    raise ValueError(f"Unsupported status transition from {current_status} to {new_status}")


def tech_complete_ticket(
    ticket: Dict[str, Any],
    actor: AuthenticatedUser,
    resolution_notes: str
) -> Dict[str, Any]:
    """
    Step 1 of Dual Approval:
    Technician certifies the fix is applied and provides resolution notes.
    Administrators CANNOT impersonate technician confirmation.
    Technicians CANNOT complete an unassigned ticket.
    """
    if not actor.is_technician():
        raise PermissionError("Only an assigned field technician can complete repairs. Administrators cannot impersonate technician confirmation.")

    assigned_tech_id = ticket.get("assignedTechId")
    if not assigned_tech_id or assigned_tech_id != actor.id:
        raise PermissionError("Access Denied: Technician cannot complete an unassigned ticket or a ticket assigned to another technician.")

    if not resolution_notes or not resolution_notes.strip():
        raise ValueError("Resolution notes are required when marking a work order as resolved.")

    now_iso = datetime.utcnow().isoformat() + "Z"
    ticket["techConfirmed"] = True
    ticket["TechConfirmed"] = "true"
    ticket["assignedTechId"] = actor.id
    ticket["resolutionNotes"] = resolution_notes.strip()
    ticket["resolvedAt"] = now_iso
    ticket["updatedAt"] = now_iso

    # Advance to 'Pending User Verification' unless consumer had somehow confirmed
    if ticket.get("userConfirmed"):
        ticket["status"] = TicketStatus.COMPLETED
        ticket["Status"] = TicketStatus.COMPLETED
    else:
        ticket["status"] = TicketStatus.PENDING_USER_VERIFICATION
        ticket["Status"] = TicketStatus.PENDING_USER_VERIFICATION

    return ticket


def consumer_verify_closure(
    ticket: Dict[str, Any],
    actor: AuthenticatedUser
) -> Dict[str, Any]:
    """
    Step 2 of Dual Approval:
    Reporting consumer confirms physical repair on site.
    Administrators CANNOT impersonate consumer confirmation.
    Other consumers CANNOT confirm another person's ticket.
    """
    reporter_id = ticket.get("reporterId") or ticket.get("reportedBy", {}).get("id")
    reporter_email = (ticket.get("reporterEmail") or ticket.get("reportedBy", {}).get("email") or "").lower()
    actor_email = (actor.email or "").lower()

    # Strictly require reporter identity
    if actor.id != reporter_id and actor_email != reporter_email:
        raise PermissionError(
            "Access Denied: Only the reporting consumer can verify and close this work order. "
            "Administrators and other users cannot impersonate consumer confirmation."
        )

    if not ticket.get("techConfirmed"):
        raise ValueError("Ticket cannot be marked Completed before technician completion and resolution notes.")

    now_iso = datetime.utcnow().isoformat() + "Z"
    ticket["userConfirmed"] = True
    ticket["UserConfirmed"] = "true"
    ticket["status"] = TicketStatus.COMPLETED
    ticket["Status"] = TicketStatus.COMPLETED
    ticket["completedAt"] = now_iso
    ticket["updatedAt"] = now_iso

    return ticket


def consumer_reject_closure(
    ticket: Dict[str, Any],
    actor: AuthenticatedUser,
    rejection_reason: str
) -> Dict[str, Any]:
    """
    Consumer Rejection & Reopening:
    Reporting consumer rejects unsatisfactory repair with a mandatory reason.
    Administrators CANNOT impersonate consumer rejection.
    Resets technician confirmation, increments reopen count, reverts status to 'In Progress'.
    """
    reporter_id = ticket.get("reporterId") or ticket.get("reportedBy", {}).get("id")
    reporter_email = (ticket.get("reporterEmail") or ticket.get("reportedBy", {}).get("email") or "").lower()
    actor_email = (actor.email or "").lower()

    if actor.id != reporter_id and actor_email != reporter_email:
        raise PermissionError(
            "Access Denied: Only the reporting consumer can reject and reopen this work order. "
            "Administrators cannot impersonate consumer rejection."
        )

    if not rejection_reason or not rejection_reason.strip():
        raise ValueError("A rejection reason is mandatory to reopen this work order.")

    if ticket.get("status") != TicketStatus.PENDING_USER_VERIFICATION and not ticket.get("techConfirmed"):
        raise ValueError("Only work orders pending user verification can be rejected.")

    now_iso = datetime.utcnow().isoformat() + "Z"
    ticket["techConfirmed"] = False
    ticket["TechConfirmed"] = "false"
    ticket["userConfirmed"] = False
    ticket["UserConfirmed"] = "false"
    ticket["status"] = TicketStatus.IN_PROGRESS
    ticket["Status"] = TicketStatus.IN_PROGRESS
    ticket["reopenCount"] = (ticket.get("reopenCount") or 0) + 1
    ticket["lastRejectionReason"] = rejection_reason.strip()
    ticket["rejectionReason"] = rejection_reason.strip()
    ticket["updatedAt"] = now_iso

    return ticket
