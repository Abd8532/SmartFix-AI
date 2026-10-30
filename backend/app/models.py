"""
Domain Models and Data Classes for FixFlow AI
"""
from typing import Dict, Any, Optional, List
from datetime import datetime


class TicketStatus:
    ASSIGNED = "Assigned"
    IN_PROGRESS = "In Progress"
    PENDING_USER_VERIFICATION = "Pending User Verification"
    COMPLETED = "Completed"

    ALL = [ASSIGNED, IN_PROGRESS, PENDING_USER_VERIFICATION, COMPLETED]


class TicketPriority:
    EMERGENCY = "Emergency"
    URGENT = "Urgent"
    ROUTINE = "Routine"

    ALL = [EMERGENCY, URGENT, ROUTINE]


class UserRole:
    USER = "user"
    TECHNICIAN = "technician"
    ADMIN = "admin"

    ALL = [USER, TECHNICIAN, ADMIN]


class Specialty:
    PLUMBING = "Plumbing"
    ELECTRICAL = "Electrical"
    HVAC = "HVAC"
    IT = "IT"
    GENERAL = "General"

    ALL = [PLUMBING, ELECTRICAL, HVAC, IT, GENERAL]


def sanitize_user(user_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Return user dict without password or sensitive hash fields."""
    safe = dict(user_dict)
    safe.pop("password", None)
    safe.pop("passwordHash", None)
    safe.pop("password_hash", None)
    return safe


def sanitize_ticket(ticket_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure ticket fields comply with frontend contract while preserving backend guarantees."""
    res = dict(ticket_dict)
    # Ensure both camelCase and legacy uppercase keys for seamless frontend compatibility
    status = res.get("status") or res.get("Status") or TicketStatus.ASSIGNED
    res["status"] = status
    res["Status"] = status

    priority = res.get("priority") or res.get("Urgency") or TicketPriority.ROUTINE
    res["priority"] = priority
    res["Urgency"] = priority

    tech_confirmed = bool(res.get("techConfirmed") or res.get("TechConfirmed") == "true")
    user_confirmed = bool(res.get("userConfirmed") or res.get("UserConfirmed") == "true")

    res["techConfirmed"] = tech_confirmed
    res["TechConfirmed"] = "true" if tech_confirmed else "false"
    res["userConfirmed"] = user_confirmed
    res["UserConfirmed"] = "true" if user_confirmed else "false"

    res["isHazard"] = bool(res.get("isHazard", False) or priority == TicketPriority.EMERGENCY)
    res["reopenCount"] = int(res.get("reopenCount", 0))

    return res
