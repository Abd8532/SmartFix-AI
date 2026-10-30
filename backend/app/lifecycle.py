"""
Lifecycle, State Machine, Safety Overrides & Dual Approval Engine for FixFlow AI
Authoritative rules for ticket state transitions, safety clamps, and dual confirmation.
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

    # If requested is already Emergency or is_hazard is True, preserve it
    final_is_hazard = is_hazard or requested_priority == TicketPriority.EMERGENCY
    return requested_priority, requested_score, final_is_hazard, False


def can_technician_work_on_ticket(ticket: Dict[str, Any], user: AuthenticatedUser) -> bool:
    """
    Enforce that a technician cannot confirm or complete a ticket they are not assigned to.
    Admin can oversee all tickets in the organization.
    """
    if user.is_admin():
        return True

    if not user.is_technician():
        return False

    assigned_tech_id = ticket.get("assignedTechId")
    if assigned_tech_id and assigned_tech_id == user.id:
        return True

    # Check department / specialty match
    cat = (ticket.get("category") or "").strip().lower()
    user_spec = (user.specialty or "").strip().lower()
    assigned_to = (ticket.get("assignedTo") or "").strip().lower()

    if assigned_tech_id and assigned_tech_id != user.id:
        # Assigned specifically to someone else
        return False

    if user_spec == "general" or not user_spec:
        return True

    return cat == user_spec or user_spec in assigned_to


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

    if new_status == TicketStatus.COMPLETED:
        raise ValueError("Direct transition to Completed is prohibited. Dual approval is strictly enforced.")

    if new_status == TicketStatus.IN_PROGRESS:
        if not can_technician_work_on_ticket(ticket, actor) and not actor.is_admin():
            raise PermissionError("Only the assigned technician or administrator can mark a ticket In Progress.")

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
    Advances ticket to 'Pending User Verification'.
    """
    if not can_technician_work_on_ticket(ticket, actor):
        raise PermissionError("Access Denied: You are not assigned to this work order.")

    if not resolution_notes or not resolution_notes.strip():
        raise ValueError("Resolution notes are required when marking a work order as resolved.")

    now_iso = datetime.utcnow().isoformat() + "Z"
    ticket["techConfirmed"] = True
    ticket["TechConfirmed"] = "true"
    ticket["assignedTechId"] = actor.id
    ticket["resolutionNotes"] = resolution_notes.strip()
    ticket["resolvedAt"] = now_iso
    ticket["updatedAt"] = now_iso

    # If consumer had somehow pre-confirmed, both are now confirmed
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
    Consumer (reporter) confirms the repair on site.
    Both confirmations met -> ticket becomes 'Completed'.
    """
    reporter_id = ticket.get("reporterId") or ticket.get("reportedBy", {}).get("id")
    if not actor.is_admin() and reporter_id != actor.id and actor.email.lower() != (ticket.get("reporterEmail") or "").lower():
        raise PermissionError("Only the user who reported this maintenance fault can verify its resolution.")

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
    If consumer finds the fault is still unresolved, they reject the closure with a mandatory reason.
    Resets technician confirmation, increments reopen count, reverts status to 'In Progress'.
    """
    reporter_id = ticket.get("reporterId") or ticket.get("reportedBy", {}).get("id")
    if not actor.is_admin() and reporter_id != actor.id and actor.email.lower() != (ticket.get("reporterEmail") or "").lower():
        raise PermissionError("Only the user who reported this fault can reject and reopen the work order.")

    if ticket.get("status") != TicketStatus.PENDING_USER_VERIFICATION and not ticket.get("techConfirmed"):
        raise ValueError("Only tickets pending verification can be rejected and reopened.")

    if not rejection_reason or not rejection_reason.strip():
        raise ValueError("A clear rejection reason is required to reopen the work order.")

    now_iso = datetime.utcnow().isoformat() + "Z"
    reopen_count = int(ticket.get("reopenCount", 0)) + 1

    ticket["techConfirmed"] = False
    ticket["TechConfirmed"] = "false"
    ticket["userConfirmed"] = False
    ticket["UserConfirmed"] = "false"
    ticket["status"] = TicketStatus.IN_PROGRESS
    ticket["Status"] = TicketStatus.IN_PROGRESS
    ticket["reopenCount"] = reopen_count
    ticket["lastRejectionReason"] = rejection_reason.strip()
    ticket["updatedAt"] = now_iso

    # Append to resolution history
    history = ticket.get("reopenHistory", [])
    history.append({
        "reopenedAt": now_iso,
        "rejectedBy": actor.name or actor.email,
        "reason": rejection_reason.strip(),
        "cycle": reopen_count
    })
    ticket["reopenHistory"] = history

    return ticket
