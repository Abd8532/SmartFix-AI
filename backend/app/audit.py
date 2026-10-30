"""
Audit Logging Service for FixFlow AI
Records immutable trace records for compliance, governance, and security audits.
"""
from typing import Dict, Any, Optional
from datetime import datetime
from .storage import storage
from .auth import AuthenticatedUser


def record_audit_event(
    action: str,
    org_id: str,
    actor: Optional[AuthenticatedUser] = None,
    ticket_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Persist an audit log entry for significant state mutations, auth actions,
    safety-critical triggers, and dual-approval milestones.
    """
    entry = {
        "org_id": org_id,
        "ticket_id": ticket_id,
        "actor_id": actor.id if actor else "system",
        "actor_email": actor.email if actor else "system",
        "actor_role": actor.role if actor else "system",
        "action": action,
        "details": details or {},
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
    return storage.log_audit(entry)
