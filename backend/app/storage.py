"""
Multi-Tenant Persistence Architecture for SmartFix AI
Defines the BaseRepository interface and provides:
1. JsonFileRepository: Local development and testing adapter.
2. DynamoDBRepository: Cloud-native AWS DynamoDB multi-tenant adapter.
Guarantees strict organization data boundary isolation across all entities.
"""
import os
import json
import threading
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from datetime import datetime
from .config import DB_FILE_PATH, DEFAULT_ORG_ID, DEFAULT_ORG_NAME, DATA_BACKEND, DYNAMODB_TABLE_NAME
from .models import sanitize_ticket, sanitize_user

_lock = threading.Lock()


# ==============================================================================
# REPOSITORY INTERFACE (TASK 5)
# ==============================================================================
class BaseRepository(ABC):
    """Abstract interface defining the multi-tenant persistence contract."""

    @abstractmethod
    def get_user_by_email(self, email: str, org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Fetch user by email, optionally enforcing organization membership."""
        pass

    @abstractmethod
    def get_user_by_id(self, user_id: str, org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Fetch user by ID strictly within the organization boundary."""
        pass

    @abstractmethod
    def list_users(self, org_id: str) -> List[Dict[str, Any]]:
        """List all users belonging to the specified organization."""
        pass

    @abstractmethod
    def save_user(self, user: Dict[str, Any]) -> Dict[str, Any]:
        """Save or update user record scoped by verified organization ID."""
        pass

    @abstractmethod
    def get_ticket(self, ticket_id: str, org_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a ticket by ID strictly enforcing organization boundary."""
        pass

    @abstractmethod
    def list_tickets(
        self,
        org_id: str,
        role: str,
        user_id: str,
        specialty: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Return tickets strictly filtered by organization boundary, role, and assignment."""
        pass

    @abstractmethod
    def save_ticket(self, ticket: Dict[str, Any], org_id: str) -> Dict[str, Any]:
        """Insert or update a ticket within the organization boundary."""
        pass

    @abstractmethod
    def delete_ticket(self, ticket_id: str, org_id: str) -> bool:
        """Delete a ticket strictly within the organization boundary."""
        pass

    @abstractmethod
    def log_audit(self, entry: Dict[str, Any]) -> Dict[str, Any]:
        """Record an immutable audit log entry."""
        pass

    @abstractmethod
    def list_audit_logs(self, org_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """List audit records for the specified organization."""
        pass


# ==============================================================================
# JSON FILE ADAPTER (LOCAL DEVELOPMENT & TESTING)
# ==============================================================================
class JsonFileRepository(BaseRepository):
    """
    Local multi-tenant file repository backed by db.json.
    Retained as the active local development and test adapter.
    """
    def __init__(self, db_path: str = DB_FILE_PATH):
        self.db_path = db_path
        self._ensure_db()

    def _ensure_db(self):
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
        if not os.path.exists(self.db_path):
            self._ensure_db()

        try:
            with open(self.db_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if not isinstance(data, dict):
                    data = {}
        except Exception:
            data = {}

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
        tmp_path = self.db_path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, self.db_path)

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

    def get_ticket(self, ticket_id: str, org_id: str) -> Optional[Dict[str, Any]]:
        with _lock:
            data = self._read_data()
            for t in data["tickets"]:
                if t.get("id") == ticket_id:
                    t_org = t.get("org_id") or t.get("orgId") or DEFAULT_ORG_ID
                    if t_org != org_id:
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
        with _lock:
            data = self._read_data()
            filtered = []

            for t in data["tickets"]:
                t_org = t.get("org_id") or t.get("orgId") or DEFAULT_ORG_ID
                if t_org != org_id:
                    continue

                clean_t = sanitize_ticket(t)

                if role == "admin":
                    filtered.append(clean_t)
                elif role == "technician":
                    assigned_tech_id = clean_t.get("assignedTechId")
                    # If ticket is assigned specifically to someone else, hide from other technicians
                    if assigned_tech_id and assigned_tech_id != user_id:
                        continue

                    # If assigned specifically to this technician, include it
                    if assigned_tech_id == user_id:
                        filtered.append(clean_t)
                        continue

                    # If unassigned, show to matching department
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

            filtered.sort(key=lambda x: int(x.get("priorityScore", 0) or 0), reverse=True)
            return filtered

    def save_ticket(self, ticket: Dict[str, Any], org_id: str) -> Dict[str, Any]:
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

    def log_audit(self, entry: Dict[str, Any]) -> Dict[str, Any]:
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


# ==============================================================================
# AMAZON DYNAMODB MULTI-TENANT ADAPTER (AWS PRODUCTION PERSISTENCE)
# ==============================================================================
class DynamoDBRepository(BaseRepository):
    """
    Amazon DynamoDB multi-tenant repository.
    Partition Key: PK = ORG#<org_id>
    Sort Key: SK = USER#<user_id> | TICKET#<ticket_id> | AUDIT#<timestamp>#<id>
    GSI1 (Email index): GSI1PK = EMAIL#<email>, GSI1SK = ORG#<org_id>

    Note: Designed for AWS Serverless deployments. Requires provisioned DynamoDB
    table before running in production.
    """
    def __init__(self, table_name: str = DYNAMODB_TABLE_NAME):
        self.table_name = table_name
        self._table = None

    def _get_table(self):
        if self._table is None:
            try:
                import boto3
                dynamodb = boto3.resource("dynamodb")
                self._table = dynamodb.Table(self.table_name)
            except Exception as e:
                raise RuntimeError(
                    f"DynamoDB connection failed: {str(e)}. "
                    f"Ensure AWS credentials and DynamoDB table '{self.table_name}' exist."
                )
        return self._table

    def get_user_by_email(self, email: str, org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        table = self._get_table()
        norm_email = (email or "").strip().lower()
        try:
            from boto3.dynamodb.conditions import Key
            res = table.query(
                IndexName="GSI1",
                KeyConditionExpression=Key("GSI1PK").eq(f"EMAIL#{norm_email}")
            )
            items = res.get("Items", [])
            for item in items:
                if org_id and item.get("org_id") != org_id:
                    continue
                return sanitize_user(item)
            return None
        except Exception as e:
            raise RuntimeError(f"DynamoDB query user by email failed: {e}")

    def get_user_by_id(self, user_id: str, org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        if not org_id:
            raise ValueError("Organization ID is required for tenant-scoped DynamoDB user lookup")
        table = self._get_table()
        try:
            res = table.get_item(Key={"PK": f"ORG#{org_id}", "SK": f"USER#{user_id}"})
            item = res.get("Item")
            return sanitize_user(item) if item else None
        except Exception as e:
            raise RuntimeError(f"DynamoDB get user by id failed: {e}")

    def list_users(self, org_id: str) -> List[Dict[str, Any]]:
        table = self._get_table()
        try:
            from boto3.dynamodb.conditions import Key
            res = table.query(
                KeyConditionExpression=Key("PK").eq(f"ORG#{org_id}") & Key("SK").begins_with("USER#")
            )
            return [sanitize_user(item) for item in res.get("Items", [])]
        except Exception as e:
            raise RuntimeError(f"DynamoDB list users failed: {e}")

    def save_user(self, user: Dict[str, Any]) -> Dict[str, Any]:
        table = self._get_table()
        org_id = user.get("org_id") or DEFAULT_ORG_ID
        user_id = user["id"]
        norm_email = user.get("email", "").strip().lower()
        item = {
            **user,
            "PK": f"ORG#{org_id}",
            "SK": f"USER#{user_id}",
            "GSI1PK": f"EMAIL#{norm_email}",
            "GSI1SK": f"ORG#{org_id}"
        }
        try:
            table.put_item(Item=item)
            return sanitize_user(item)
        except Exception as e:
            raise RuntimeError(f"DynamoDB save user failed: {e}")

    def get_ticket(self, ticket_id: str, org_id: str) -> Optional[Dict[str, Any]]:
        table = self._get_table()
        try:
            res = table.get_item(Key={"PK": f"ORG#{org_id}", "SK": f"TICKET#{ticket_id}"})
            item = res.get("Item")
            return sanitize_ticket(item) if item else None
        except Exception as e:
            raise RuntimeError(f"DynamoDB get ticket failed: {e}")

    def list_tickets(
        self,
        org_id: str,
        role: str,
        user_id: str,
        specialty: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        table = self._get_table()
        try:
            from boto3.dynamodb.conditions import Key
            res = table.query(
                KeyConditionExpression=Key("PK").eq(f"ORG#{org_id}") & Key("SK").begins_with("TICKET#")
            )
            tickets = [sanitize_ticket(i) for i in res.get("Items", [])]

            filtered = []
            for clean_t in tickets:
                if role == "admin":
                    filtered.append(clean_t)
                elif role == "technician":
                    assigned_tech_id = clean_t.get("assignedTechId")
                    if assigned_tech_id and assigned_tech_id != user_id:
                        continue
                    if assigned_tech_id == user_id:
                        filtered.append(clean_t)
                        continue
                    cat = (clean_t.get("category") or "").lower()
                    assigned = (clean_t.get("assignedTo") or "").lower()
                    spec = (specialty or "").lower()
                    if not spec or spec == "general" or cat == spec or spec in assigned:
                        filtered.append(clean_t)
                else:
                    rep_id = clean_t.get("reporterId") or clean_t.get("reportedBy", {}).get("id")
                    if rep_id == user_id:
                        filtered.append(clean_t)

            filtered.sort(key=lambda x: int(x.get("priorityScore", 0) or 0), reverse=True)
            return filtered
        except Exception as e:
            raise RuntimeError(f"DynamoDB list tickets failed: {e}")

    def save_ticket(self, ticket: Dict[str, Any], org_id: str) -> Dict[str, Any]:
        table = self._get_table()
        ticket_id = ticket["id"]
        item = {
            **ticket,
            "PK": f"ORG#{org_id}",
            "SK": f"TICKET#{ticket_id}",
            "org_id": org_id
        }
        try:
            table.put_item(Item=item)
            return sanitize_ticket(item)
        except Exception as e:
            raise RuntimeError(f"DynamoDB save ticket failed: {e}")

    def delete_ticket(self, ticket_id: str, org_id: str) -> bool:
        table = self._get_table()
        try:
            table.delete_item(Key={"PK": f"ORG#{org_id}", "SK": f"TICKET#{ticket_id}"})
            return True
        except Exception:
            return False

    def log_audit(self, entry: Dict[str, Any]) -> Dict[str, Any]:
        table = self._get_table()
        org_id = entry.get("org_id", DEFAULT_ORG_ID)
        timestamp = entry.get("timestamp", datetime.utcnow().isoformat() + "Z")
        entry_id = entry.get("id") or f"aud_{int(datetime.utcnow().timestamp() * 1000)}"
        item = {
            **entry,
            "id": entry_id,
            "PK": f"ORG#{org_id}",
            "SK": f"AUDIT#{timestamp}#{entry_id}"
        }
        try:
            table.put_item(Item=item)
            return item
        except Exception as e:
            raise RuntimeError(f"DynamoDB log audit failed: {e}")

    def list_audit_logs(self, org_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        table = self._get_table()
        try:
            from boto3.dynamodb.conditions import Key
            res = table.query(
                KeyConditionExpression=Key("PK").eq(f"ORG#{org_id}") & Key("SK").begins_with("AUDIT#"),
                ScanIndexForward=False,
                Limit=limit
            )
            return res.get("Items", [])
        except Exception as e:
            raise RuntimeError(f"DynamoDB list audit logs failed: {e}")


# ==============================================================================
# REPOSITORY SINGLETON FACTORY
# ==============================================================================
def get_repository() -> BaseRepository:
    if DATA_BACKEND == "dynamodb":
        return DynamoDBRepository()
    return JsonFileRepository()


# Global storage instance
storage: BaseRepository = get_repository()
StorageRepository = JsonFileRepository
