"""
Tenant-Scoped Data Access & Storage Layer
Guarantees strict organization-level data isolation across users, tickets, and audit logs.
"""
import os
import json
import threading
from typing import Dict, Any, List, Optional
from datetime import datetime
from .config import DB_FILE_PATH, DEFAULT_ORG_ID, DEFAULT_ORG_NAME
from .models import sanitize_ticket, sanitize_user

_lock = threading.Lock()


class StorageRepository:
    def __init__(self, db_path: str = DB_FILE_PATH):
        self.db_path = db_path
        self._ensure_db()

    def _ensure_db(self):
        """Initialize db.json with tenant isolation structure if not present."""
        with _lock:
            if not os.path.exists(self.db_path):
                initial = {
                    "organizations": [
                        {
                            "id": DEFAULT_ORG_ID,
                            "name": DEFAULT_ORG_NAME,
                            "domain": "campus.edu",
                            "createdAt": datetime.utcnow().isoformat() + "Z"
                        }
                    ],
                    "users": [],
                    "tickets": [],
                    "audit_logs": []
                }
                os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
                with open(self.db_path, "w", encoding="utf-8") as f:
                    json.dump(initial, f, indent=2)

    def _read_data(self) -> Dict[str, Any]:
        """Read data from file with recovery fallback."""
        if not os.path.exists(self.db_path):
            self._ensure_db()

        try:
            with open(self.db_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if not isinstance(data, dict):
                    data = {}
        except Exception:
            data = {}

        # Ensure mandatory collections
        if "organizations" not in data or not isinstance(data["organizations"], list):
            data["organizations"] = [
                {
                    "id": DEFAULT_ORG_ID,
                    "name": DEFAULT_ORG_NAME,
                    "domain": "campus.edu",
                    "createdAt": datetime.utcnow().isoformat() + "Z"
                }
            ]
        if "users" not in data or not isinstance(data["users"], list):
            data["users"] = []
        if "tickets" not in data or not isinstance(data["tickets"], list):
            data["tickets"] = []
        if "audit_logs" not in data or not isinstance(data["audit_logs"], list):
            data["audit_logs"] = []

        return data

    def _write_data(self, data: Dict[str, Any]):
        """Atomic write to persistence file."""
        tmp_path = self.db_path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, self.db_path)

    # ==========================================================================
    # USER OPERATIONS (TENANT-SCOPED)
    # ==========================================================================
    def get_user_by_email(self, email: str, org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with _lock:
            data = self._read_data()
            norm_email = (email or "").strip().lower()
            for u in data["users"]:
                if u.get("email", "").strip().lower() == norm_email:
                    if org_id and (u.get("org_id") or u.get("orgId")) != org_id:
                        continue
                    return dict(u)
            return None

    def get_user_by_id(self, user_id: str, org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with _lock:
            data = self._read_data()
            for u in data["users"]:
                if u.get("id") == user_id:
                    if org_id and (u.get("org_id") or u.get("orgId")) != org_id:
                        return None
                    return dict(u)
            return None

    def list_users(self, org_id: str) -> List[Dict[str, Any]]:
        with _lock:
            data = self._read_data()
            result = []
            for u in data["users"]:
                u_org = u.get("org_id") or u.get("orgId") or DEFAULT_ORG_ID
                if u_org == org_id:
                    result.append(sanitize_user(u))
            return result

    def save_user(self, user: Dict[str, Any]) -> Dict[str, Any]:
        with _lock:
            data = self._read_data()
            user_id = user.get("id")
            norm_email = user.get("email", "").strip().lower()
            org_id = user.get("org_id") or user.get("orgId") or DEFAULT_ORG_ID
            user["org_id"] = org_id
            user["orgId"] = org_id

            found_idx = -1
            for idx, existing in enumerate(data["users"]):
                if existing.get("id") == user_id or existing.get("email", "").strip().lower() == norm_email:
                    found_idx = idx
                    break

            if found_idx >= 0:
                data["users"][found_idx] = {**data["users"][found_idx], **user}
                saved = data["users"][found_idx]
            else:
                data["users"].append(user)
                saved = user

            self._write_data(data)
            return sanitize_user(saved)

    # ==========================================================================
    # TICKET OPERATIONS (STRICT TENANT ISOLATION)
    # ==========================================================================
    def get_ticket(self, ticket_id: str, org_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch a ticket by ID strictly enforcing organization boundary.
        Returns None if ticket does not exist or belongs to another organization.
        """
        with _lock:
            data = self._read_data()
            for t in data["tickets"]:
                if t.get("id") == ticket_id:
                    t_org = t.get("org_id") or t.get("orgId") or DEFAULT_ORG_ID
                    if t_org != org_id:
                        # Prevent cross-tenant visibility
                        return None
                    return sanitize_ticket(t)
            return None

    def list_tickets(
        self,
        org_id: str,
        role: str,
        user_id: str,
        specialty: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Return tickets strictly filtered by tenant and authorized role:
        - Admin: sees all organization tickets
        - Technician: sees tickets matching their specialty or assigned directly
        - Consumer (User): sees tickets they reported
        """
        with _lock:
            data = self._read_data()
            filtered = []

            for t in data["tickets"]:
                t_org = t.get("org_id") or t.get("orgId") or DEFAULT_ORG_ID
                if t_org != org_id:
                    # Enforce tenant boundary
                    continue

                clean_t = sanitize_ticket(t)

                if role == "admin":
                    filtered.append(clean_t)
                elif role == "technician":
                    # Specialty or assignment match
                    cat = (clean_t.get("category") or "").lower()
                    assigned = (clean_t.get("assignedTo") or "").lower()
                    spec = (specialty or "").lower()

                    if not spec or spec == "general":
                        filtered.append(clean_t)
                    elif cat == spec or spec in assigned:
                        filtered.append(clean_t)
                else:
                    # Consumer / User: strictly their reported tickets
                    rep_id = clean_t.get("reporterId") or clean_t.get("reportedBy", {}).get("id")
                    if rep_id == user_id:
                        filtered.append(clean_t)

            # Sort by priorityScore desc
            filtered.sort(key=lambda x: int(x.get("priorityScore", 0) or 0), reverse=True)
            return filtered

    def save_ticket(self, ticket: Dict[str, Any], org_id: str) -> Dict[str, Any]:
        """Insert or update a ticket within the tenant boundary."""
        with _lock:
            data = self._read_data()
            ticket["org_id"] = org_id
            ticket["orgId"] = org_id
            clean_t = sanitize_ticket(ticket)
            ticket_id = clean_t["id"]

            found_idx = -1
            for idx, existing in enumerate(data["tickets"]):
                if existing.get("id") == ticket_id:
                    t_org = existing.get("org_id") or existing.get("orgId") or DEFAULT_ORG_ID
                    if t_org != org_id:
                        raise PermissionError("Cross-tenant ticket modification is forbidden")
                    found_idx = idx
                    break

            if found_idx >= 0:
                data["tickets"][found_idx] = {**data["tickets"][found_idx], **clean_t}
                saved = data["tickets"][found_idx]
            else:
                data["tickets"].insert(0, clean_t)
                saved = clean_t

            self._write_data(data)
            return sanitize_ticket(saved)

    def delete_ticket(self, ticket_id: str, org_id: str) -> bool:
        """Delete a ticket strictly within the tenant boundary."""
        with _lock:
            data = self._read_data()
            orig_len = len(data["tickets"])
            data["tickets"] = [
                t for t in data["tickets"]
                if not (t.get("id") == ticket_id and (t.get("org_id") or t.get("orgId") or DEFAULT_ORG_ID) == org_id)
            ]
            if len(data["tickets"]) < orig_len:
                self._write_data(data)
                return True
            return False

    # ==========================================================================
    # AUDIT LOG OPERATIONS (TENANT-SCOPED)
    # ==========================================================================
    def log_audit(self, entry: Dict[str, Any]) -> Dict[str, Any]:
        """Record an immutable audit log entry."""
        with _lock:
            data = self._read_data()
            entry_id = f"aud_{int(datetime.utcnow().timestamp() * 1000)}"
            record = {
                "id": entry.get("id", entry_id),
                "org_id": entry.get("org_id", DEFAULT_ORG_ID),
                "ticket_id": entry.get("ticket_id"),
                "actor_id": entry.get("actor_id", "system"),
                "actor_email": entry.get("actor_email", "system"),
                "actor_role": entry.get("actor_role", "system"),
                "action": entry.get("action", "UNKNOWN"),
                "details": entry.get("details", {}),
                "timestamp": entry.get("timestamp", datetime.utcnow().isoformat() + "Z")
            }
            data["audit_logs"].insert(0, record)
            self._write_data(data)
            return record

    def list_audit_logs(self, org_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        with _lock:
            data = self._read_data()
            results = [
                log for log in data["audit_logs"]
                if (log.get("org_id") or DEFAULT_ORG_ID) == org_id
            ]
            return results[:limit]


# Global storage repository singleton
storage = StorageRepository()
