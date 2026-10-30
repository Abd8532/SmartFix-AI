"""
Multi-Tenant Storage Architecture for SmartFix AI
Enforces strict organization boundary isolation, optimistic concurrency locking,
unassigned claim vs assigned work queues, and cloud-ready DynamoDB partitioning.
"""
import os
import json
import threading
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from datetime import datetime

from .config import (
    DB_FILE_PATH,
    DEFAULT_ORG_ID,
    DEFAULT_ORG_NAME,
    DEV_DEFAULT_ORG_ID,
    DATA_BACKEND,
    DYNAMODB_TABLE_NAME,
    ENVIRONMENT
)
from .models import sanitize_ticket, sanitize_user, TicketStatus

_lock = threading.RLock()


class ConcurrencyError(Exception):
    """Raised when an optimistic concurrency check detects a version mismatch."""
    pass


# ==============================================================================
# ABSTRACT REPOSITORY INTERFACE
# ==============================================================================
class BaseRepository(ABC):
    """
    Abstract Base Class defining the authoritative multi-tenant persistence contract.
    All data queries and mutations MUST be bounded by org_id.
    """

    @abstractmethod
    def get_organization(self, org_id: str) -> Optional[Dict[str, Any]]:
        """Fetch tenant organization record by id."""
        pass

    @abstractmethod
    def save_organization(self, org: Dict[str, Any]) -> Dict[str, Any]:
        """Save tenant organization record."""
        pass

    @abstractmethod
    def get_user_by_email(self, email: str, org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Retrieve user profile by unique email within tenant scope."""
        pass

    @abstractmethod
    def get_user_by_id(self, user_id: str, org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Retrieve user profile by primary user ID strictly within tenant scope."""
        pass

    @abstractmethod
    def list_users(self, org_id: str) -> List[Dict[str, Any]]:
        """List all users belonging to the specified organization."""
        pass

    @abstractmethod
    def save_user(self, user: Dict[str, Any]) -> Dict[str, Any]:
        """Insert or update a user record within tenant scope."""
        pass

    @abstractmethod
    def get_ticket(self, ticket_id: str, org_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a single ticket by ID strictly within the organization boundary."""
        pass

    @abstractmethod
    def list_tickets(
        self,
        org_id: str,
        role: str,
        user_id: str,
        specialty: Optional[str] = None,
        queue: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        List organization tickets with queue separation:
        - For technicians: 'assigned' (personal queue) vs 'claimable' (unassigned eligible queue).
        - For consumers: strictly tickets reported by caller.
        - For administrators: all tickets within the organization.
        """
        pass

    @abstractmethod
    def save_ticket(
        self,
        ticket: Dict[str, Any],
        org_id: str,
        expected_version: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Insert or atomically update a ticket with optimistic concurrency control.
        Raises ConcurrencyError if expected_version does not match current version.
        """
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
    Active development adapter with optimistic locking and queue separation.
    """
    def __init__(self, db_path: str = DB_FILE_PATH):
        self.db_path = db_path
        self._ensure_db()

    def _ensure_db(self):
        with _lock:
            if not os.path.exists(self.db_path):
                # In production, seed zero dummy data!
                # In development, create initial tenant and default structures
                initial_org_id = DEV_DEFAULT_ORG_ID if ENVIRONMENT != "production" else "org_default"
                initial = {
                    "organizations": [
                        {
                            "id": initial_org_id,
                            "name": DEFAULT_ORG_NAME,
                            "domain": "campus.edu",
                            "createdAt": datetime.utcnow().isoformat() + "Z"
                        }
                    ],
                    "users": [],
                    "tickets": [],
                    "audit_logs": []
                }
                os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
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
            data["organizations"] = []
        if "users" not in data or not isinstance(data["users"], list):
            data["users"] = []
        if "tickets" not in data or not isinstance(data["tickets"], list):
            data["tickets"] = []
        if "audit_logs" not in data or not isinstance(data["audit_logs"], list):
            data["audit_logs"] = []

        return data

    def _write_data(self, data: Dict[str, Any]):
        tmp_path = self.db_path + f".tmp.{os.getpid()}"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

        # Windows-safe atomic replace with retry on transient file lock
        for attempt in range(5):
            try:
                os.replace(tmp_path, self.db_path)
                return
            except (PermissionError, OSError):
                if attempt == 4:
                    try:
                        with open(self.db_path, "w", encoding="utf-8") as f:
                            json.dump(data, f, indent=2)
                    finally:
                        if os.path.exists(tmp_path):
                            try:
                                os.remove(tmp_path)
                            except OSError:
                                pass
                    return
                time.sleep(0.05 * (attempt + 1))

    def get_organization(self, org_id: str) -> Optional[Dict[str, Any]]:
        if not org_id:
            return None
        with _lock:
            data = self._read_data()
            for org in data.get("organizations", []):
                if org.get("id") == org_id:
                    return dict(org)
            return None

    def save_organization(self, org: Dict[str, Any]) -> Dict[str, Any]:
        with _lock:
            data = self._read_data()
            org_id = org.get("id")
            if not org_id:
                raise ValueError("Organization id is required")
            found = False
            for idx, existing in enumerate(data.get("organizations", [])):
                if existing.get("id") == org_id:
                    data["organizations"][idx] = {**existing, **org}
                    found = True
                    break
            if not found:
                data["organizations"].append(org)
            self._write_data(data)
            return org

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
                        continue
                    return dict(u)
            return None

    def list_users(self, org_id: str) -> List[Dict[str, Any]]:
        if not org_id:
            raise ValueError("Tenant isolation: org_id is required to list users")
        with _lock:
            data = self._read_data()
            scoped = []
            for u in data["users"]:
                u_org = u.get("org_id") or u.get("orgId")
                if u_org == org_id:
                    scoped.append(sanitize_user(u))
            return scoped

    def save_user(self, user: Dict[str, Any]) -> Dict[str, Any]:
        with _lock:
            data = self._read_data()
            org_id = user.get("org_id") or user.get("orgId")
            if not org_id:
                if ENVIRONMENT == "production":
                    raise ValueError("Tenant isolation error: org_id is required to save user.")
                org_id = DEV_DEFAULT_ORG_ID
                user["org_id"] = org_id
                user["orgId"] = org_id

            clean_user = dict(user)
            user_id = clean_user["id"]

            found_idx = -1
            for idx, existing in enumerate(data["users"]):
                if existing.get("id") == user_id:
                    found_idx = idx
                    break

            if found_idx >= 0:
                data["users"][found_idx] = {**data["users"][found_idx], **clean_user}
                saved = data["users"][found_idx]
            else:
                data["users"].append(clean_user)
                saved = clean_user

            self._write_data(data)
            return sanitize_user(saved)

    def get_ticket(self, ticket_id: str, org_id: str) -> Optional[Dict[str, Any]]:
        if not org_id:
            raise ValueError("Tenant isolation: org_id is required to fetch ticket")
        with _lock:
            data = self._read_data()
            for t in data["tickets"]:
                t_org = t.get("org_id") or t.get("orgId")
                if t.get("id") == ticket_id and t_org == org_id:
                    return sanitize_ticket(t)
            return None

    def list_tickets(
        self,
        org_id: str,
        role: str,
        user_id: str,
        specialty: Optional[str] = None,
        queue: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        if not org_id:
            raise ValueError("Tenant isolation: org_id is required to list tickets")
        with _lock:
            data = self._read_data()
            filtered = []

            for t in data["tickets"]:
                t_org = t.get("org_id") or t.get("orgId")
                if t_org != org_id:
                    continue

                clean_t = sanitize_ticket(t)

                if role == "admin":
                    filtered.append(clean_t)
                elif role == "technician":
                    assigned_tech_id = clean_t.get("assignedTechId")
                    status = clean_t.get("status") or TicketStatus.ASSIGNED

                    # Queue 1: 'claimable' (Unassigned Claim Queue)
                    if queue == "claimable":
                        if assigned_tech_id is not None:
                            continue
                        if status not in (TicketStatus.ASSIGNED, "Assigned"):
                            continue

                        # Skill restriction: general tech CANNOT bypass skill restrictions!
                        cat = (clean_t.get("category") or "").strip().lower()
                        spec = (specialty or "").strip().lower()
                        specialized = {"plumbing", "electrical", "hvac", "lift"}

                        if cat in specialized:
                            if spec != cat:
                                continue
                        else:
                            # General/Other category
                            if spec not in ("general", "other", "") and spec != cat:
                                continue

                        filtered.append(clean_t)

                    # Queue 2: 'assigned' (Personal Work Queue - Default)
                    elif queue == "assigned" or queue is None:
                        if assigned_tech_id == user_id:
                            filtered.append(clean_t)

                    # Queue 3: 'all' (Assigned to caller + claimable)
                    elif queue == "all":
                        if assigned_tech_id == user_id:
                            filtered.append(clean_t)
                        elif assigned_tech_id is None and status in (TicketStatus.ASSIGNED, "Assigned"):
                            cat = (clean_t.get("category") or "").strip().lower()
                            spec = (specialty or "").strip().lower()
                            specialized = {"plumbing", "electrical", "hvac", "lift"}
                            if cat in specialized:
                                if spec == cat:
                                    filtered.append(clean_t)
                            else:
                                filtered.append(clean_t)

                else:
                    # Consumer / User: strictly their reported tickets
                    rep_id = clean_t.get("reporterId") or clean_t.get("reportedBy", {}).get("id")
                    if rep_id == user_id:
                        filtered.append(clean_t)

            filtered.sort(key=lambda x: int(x.get("priorityScore", 0) or 0), reverse=True)
            return filtered

    def save_ticket(
        self,
        ticket: Dict[str, Any],
        org_id: str,
        expected_version: Optional[int] = None
    ) -> Dict[str, Any]:
        if not org_id:
            raise ValueError("Tenant isolation: org_id is required to save ticket")

        with _lock:
            data = self._read_data()
            ticket["org_id"] = org_id
            ticket["orgId"] = org_id
            clean_t = sanitize_ticket(ticket)
            ticket_id = clean_t["id"]

            found_idx = -1
            for idx, existing in enumerate(data["tickets"]):
                if existing.get("id") == ticket_id:
                    t_org = existing.get("org_id") or existing.get("orgId")
                    if t_org != org_id:
                        raise PermissionError("Cross-tenant ticket modification is forbidden")
                    found_idx = idx
                    break

            if found_idx >= 0:
                existing = data["tickets"][found_idx]
                curr_version = int(existing.get("version", 1) or 1)

                # Optimistic Concurrency Check
                if expected_version is not None and curr_version != expected_version:
                    raise ConcurrencyError(
                        f"Optimistic concurrency conflict on ticket '{ticket_id}': "
                        f"current version is {curr_version}, but operation expected version {expected_version}."
                    )

                new_version = curr_version + 1
                clean_t["version"] = new_version
                # Merge existing to protect immutable root creation fields
                data["tickets"][found_idx] = {**existing, **clean_t, "version": new_version}
                saved = data["tickets"][found_idx]
            else:
                # Brand new ticket creation
                clean_t["version"] = 1
                data["tickets"].insert(0, clean_t)
                saved = clean_t

            self._write_data(data)
            return sanitize_ticket(saved)

    def delete_ticket(self, ticket_id: str, org_id: str) -> bool:
        if not org_id:
            raise ValueError("Tenant isolation: org_id is required to delete ticket")
        with _lock:
            data = self._read_data()
            orig_len = len(data["tickets"])
            data["tickets"] = [
                t for t in data["tickets"]
                if not (t.get("id") == ticket_id and (t.get("org_id") or t.get("orgId")) == org_id)
            ]
            if len(data["tickets"]) < orig_len:
                self._write_data(data)
                return True
            return False

    def log_audit(self, entry: Dict[str, Any]) -> Dict[str, Any]:
        org_id = entry.get("org_id")
        if not org_id:
            if ENVIRONMENT == "production":
                raise ValueError("Tenant isolation: org_id is required for audit logs")
            org_id = DEV_DEFAULT_ORG_ID
            entry["org_id"] = org_id

        with _lock:
            data = self._read_data()
            entry_id = f"aud_{int(datetime.utcnow().timestamp() * 1000)}"
            record = {
                "id": entry.get("id", entry_id),
                "org_id": org_id,
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
        if not org_id:
            raise ValueError("Tenant isolation: org_id is required to list audit logs")
        with _lock:
            data = self._read_data()
            results = [
                log for log in data["audit_logs"]
                if (log.get("org_id") or log.get("orgId")) == org_id
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
    Supports atomic conditional writes for optimistic concurrency.
    """
    def __init__(self, table_name: str = DYNAMODB_TABLE_NAME):
        self.table_name = table_name
        self._table = None

    def validate_table(self) -> Dict[str, Any]:
        """
        Validates DynamoDB table status and required indexes for production readiness.
        Requires table status to be ACTIVE, primary keys PK/SK, and secondary index GSI1.
        """
        try:
            import boto3
            client = boto3.client("dynamodb")
            desc = client.describe_table(TableName=self.table_name)
            table_meta = desc.get("Table", {})
            status = table_meta.get("TableStatus")
            if status != "ACTIVE":
                raise ValueError(
                    f"DynamoDB table '{self.table_name}' status is '{status}', expected 'ACTIVE'."
                )

            # Validate primary key schema
            key_schema = {k["AttributeName"]: k["KeyType"] for k in table_meta.get("KeySchema", [])}
            if key_schema.get("PK") != "HASH" or key_schema.get("SK") != "RANGE":
                raise ValueError(
                    f"DynamoDB table '{self.table_name}' has invalid key schema {key_schema}. Expected PK (HASH) and SK (RANGE)."
                )

            gsi_meta = {g.get("IndexName"): g for g in table_meta.get("GlobalSecondaryIndexes", [])}
            if "GSI1" not in gsi_meta:
                raise ValueError(
                    f"DynamoDB table '{self.table_name}' is missing required secondary index 'GSI1'. "
                    f"Existing GSIs: {list(gsi_meta.keys())}"
                )

            gsi1_keys = {k["AttributeName"]: k["KeyType"] for k in gsi_meta["GSI1"].get("KeySchema", [])}
            if gsi1_keys.get("GSI1PK") != "HASH" or gsi1_keys.get("GSI1SK") != "RANGE":
                raise ValueError(
                    f"DynamoDB table '{self.table_name}' index GSI1 has invalid schema {gsi1_keys}. Expected GSI1PK (HASH) and GSI1SK (RANGE)."
                )

            return {
                "valid": True,
                "tableName": self.table_name,
                "status": status,
                "primaryKeys": key_schema,
                "indexes": list(gsi_meta.keys())
            }
        except Exception as e:
            raise RuntimeError(f"DynamoDB schema validation failed: {str(e)}")

    def _get_table(self):
        if self._table is None:
            try:
                import boto3
                from botocore.config import Config
                cfg = Config(retries={"max_attempts": 5, "mode": "adaptive"})
                dynamodb = boto3.resource("dynamodb", config=cfg)
                self._table = dynamodb.Table(self.table_name)
            except Exception as e:
                raise RuntimeError(
                    f"DynamoDB connection failed: {str(e)}. "
                    f"Ensure AWS credentials and DynamoDB table '{self.table_name}' exist."
                )
        return self._table

    def get_organization(self, org_id: str) -> Optional[Dict[str, Any]]:
        table = self._get_table()
        try:
            res = table.get_item(Key={"PK": f"ORG#{org_id}", "SK": "METADATA"})
            return res.get("Item")
        except Exception:
            return None

    def save_organization(self, org: Dict[str, Any]) -> Dict[str, Any]:
        table = self._get_table()
        org_id = org["id"]
        item = {**org, "PK": f"ORG#{org_id}", "SK": "METADATA"}
        table.put_item(Item=item)
        return org

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
            items = []
            query_kwargs = {
                "KeyConditionExpression": Key("PK").eq(f"ORG#{org_id}") & Key("SK").begins_with("USER#")
            }
            while True:
                res = table.query(**query_kwargs)
                items.extend(res.get("Items", []))
                lek = res.get("LastEvaluatedKey")
                if not lek:
                    break
                query_kwargs["ExclusiveStartKey"] = lek
            return [sanitize_user(item) for item in items]
        except Exception as e:
            raise RuntimeError(f"DynamoDB list users failed: {e}")

    def save_user(self, user: Dict[str, Any]) -> Dict[str, Any]:
        table = self._get_table()
        org_id = user.get("org_id")
        if not org_id:
            raise ValueError("Tenant isolation error: org_id is required to save user.")
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
        specialty: Optional[str] = None,
        queue: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        table = self._get_table()
        try:
            from boto3.dynamodb.conditions import Key
            items = []
            query_kwargs = {
                "KeyConditionExpression": Key("PK").eq(f"ORG#{org_id}") & Key("SK").begins_with("TICKET#")
            }
            while True:
                res = table.query(**query_kwargs)
                items.extend(res.get("Items", []))
                lek = res.get("LastEvaluatedKey")
                if not lek:
                    break
                query_kwargs["ExclusiveStartKey"] = lek
            tickets = [sanitize_ticket(i) for i in items]

            filtered = []
            for clean_t in tickets:
                if role == "admin":
                    filtered.append(clean_t)
                elif role == "technician":
                    assigned_tech_id = clean_t.get("assignedTechId")
                    status = clean_t.get("status") or TicketStatus.ASSIGNED

                    if queue == "claimable":
                        if assigned_tech_id is not None or status not in (TicketStatus.ASSIGNED, "Assigned"):
                            continue
                        cat = (clean_t.get("category") or "").strip().lower()
                        spec = (specialty or "").strip().lower()
                        specialized = {"plumbing", "electrical", "hvac", "lift"}
                        if cat in specialized:
                            if spec != cat:
                                continue
                        else:
                            if spec not in ("general", "other", "") and spec != cat:
                                continue
                        filtered.append(clean_t)
                    elif queue == "assigned" or queue is None:
                        if assigned_tech_id == user_id:
                            filtered.append(clean_t)
                    elif queue == "all":
                        if assigned_tech_id == user_id:
                            filtered.append(clean_t)
                        elif assigned_tech_id is None and status in (TicketStatus.ASSIGNED, "Assigned"):
                            filtered.append(clean_t)
                else:
                    rep_id = clean_t.get("reporterId") or clean_t.get("reportedBy", {}).get("id")
                    if rep_id == user_id:
                        filtered.append(clean_t)

            filtered.sort(key=lambda x: int(x.get("priorityScore", 0) or 0), reverse=True)
            return filtered
        except Exception as e:
            raise RuntimeError(f"DynamoDB list tickets failed: {e}")

    def save_ticket(
        self,
        ticket: Dict[str, Any],
        org_id: str,
        expected_version: Optional[int] = None
    ) -> Dict[str, Any]:
        table = self._get_table()
        ticket_id = ticket["id"]
        pk = f"ORG#{org_id}"
        sk = f"TICKET#{ticket_id}"

        clean_t = sanitize_ticket(ticket)
        clean_t["PK"] = pk
        clean_t["SK"] = sk
        clean_t["org_id"] = org_id

        try:
            if expected_version is not None:
                # Conditional optimistic write requiring version to match
                new_version = expected_version + 1
                clean_t["version"] = new_version
                table.put_item(
                    Item=clean_t,
                    ConditionExpression="attribute_exists(PK) AND #v = :expected_version",
                    ExpressionAttributeNames={"#v": "version"},
                    ExpressionAttributeValues={":expected_version": expected_version}
                )
            else:
                curr_version = int(clean_t.get("version", 1) or 1)
                clean_t["version"] = curr_version
                table.put_item(Item=clean_t)

            return clean_t
        except Exception as e:
            err_str = str(e)
            if "ConditionalCheckFailedException" in err_str:
                raise ConcurrencyError(
                    f"Optimistic concurrency conflict on ticket '{ticket_id}' in DynamoDB: "
                    f"expected version {expected_version}."
                )
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
        org_id = entry.get("org_id")
        if not org_id:
            raise ValueError("Tenant isolation: org_id is required for audit logs")
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
    if ENVIRONMENT == "production" and DATA_BACKEND != "dynamodb":
        raise ValueError(
            f"CRITICAL CONFIGURATION ERROR: ENVIRONMENT is 'production', but DATA_BACKEND is '{DATA_BACKEND}'. "
            "Production deployments strictly require DATA_BACKEND='dynamodb'. Local file storage is forbidden."
        )
    if DATA_BACKEND == "dynamodb":
        return DynamoDBRepository()
    return JsonFileRepository()


# Global storage instance
storage: BaseRepository = get_repository()
StorageRepository = JsonFileRepository
