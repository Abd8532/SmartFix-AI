"""
REST API Router & Request Handler for FixFlow AI
Serves standard HTTP requests and AWS Lambda API Gateway proxy events.
"""
import json
import secrets
from datetime import datetime
from typing import Dict, Any, Tuple

from .config import DEFAULT_ORG_ID
from .auth import (
    authenticate_request,
    hash_password,
    verify_password,
    create_access_token,
    AuthenticatedUser
)
from .models import (
    UserRole,
    TicketStatus,
    TicketPriority,
    sanitize_user,
    sanitize_ticket
)
from .storage import storage
from .lifecycle import (
    transition_ticket_status,
    tech_complete_ticket,
    consumer_verify_closure,
    consumer_reject_closure,
    can_technician_work_on_ticket
)
from .rag import (
    query_knowledge_base,
    ingest_verified_repair_to_rag
)
from .ai import analyze_maintenance_fault
from .audit import record_audit_event


def _json_response(status_code: int, body: Any) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        },
        "body": json.dumps(body) if not isinstance(body, str) else body
    }


def handle_api_request(
    path: str,
    method: str,
    headers: Dict[str, str],
    body_data: Any
) -> Dict[str, Any]:
    """
    Main dispatch router matching the API specification.
    Normalizes path and method, enforces JWT authentication, tenant isolation,
    and returns standard JSON responses.
    """
    # Normalize path: strip trailing slash and ensure leading slash
    norm_path = "/" + path.strip("/")
    method = method.upper()

    # Pre-flight OPTIONS CORS support
    if method == "OPTIONS":
        return _json_response(200, {"success": True})

    # Parse body
    if isinstance(body_data, str) and body_data:
        try:
            body = json.loads(body_data)
        except Exception:
            body = {}
    elif isinstance(body_data, dict):
        body = body_data
    else:
        body = {}

    # ==========================================================================
    # 1. PUBLIC AUTH ROUTES
    # ==========================================================================
    if (norm_path == "/api/v1/auth/login" or norm_path == "/api/login") and method == "POST":
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")

        user = storage.get_user_by_email(email)
        if not user:
            return _json_response(200, {
                "success": False,
                "error": "Invalid email or password. Please verify your credentials."
            })

        stored_hash = user.get("passwordHash") or user.get("password") or ""
        if not verify_password(password, stored_hash):
            return _json_response(200, {
                "success": False,
                "error": "Invalid email or password. Please verify your credentials."
            })

        # Upgrade plain password to PBKDF2 hash on successful login if needed
        if not stored_hash.startswith("pbkdf2_sha256$"):
            user["passwordHash"] = hash_password(password)
            user.pop("password", None)
            storage.save_user(user)

        # Check approval status
        if user.get("approvalStatus") == "Pending" and user.get("role") != "admin":
            return _json_response(200, {
                "success": False,
                "status": "Pending",
                "error": "Access Denied: Your account is pending administrator approval."
            })

        if user.get("approvalStatus") == "Rejected":
            return _json_response(200, {
                "success": False,
                "status": "Rejected",
                "error": "Access Denied: Your registration was rejected by an administrator."
            })

        token = create_access_token(user)
        safe_user = sanitize_user(user)
        safe_user["token"] = token

        record_audit_event(
            action="USER_LOGIN",
            org_id=user.get("org_id", DEFAULT_ORG_ID),
            details={"email": user["email"], "role": user.get("role")}
        )

        return _json_response(200, {
            "success": True,
            "token": token,
            "user": safe_user
        })

    if (norm_path == "/api/v1/auth/register" or norm_path == "/api/register") and method == "POST":
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        role = body.get("role", "user").strip().lower()
        name = body.get("name", "").strip() or email.split("@")[0]
        specialty = body.get("specialty") if role == "technician" else None

        # MANDATORY REQUIREMENT 1: Public registration as administrator is strictly prohibited
        if role == "admin":
            return _json_response(403, {
                "success": False,
                "error": "Security Restriction: Public administrator registration is prohibited. Administrator accounts must be provisioned internally."
            })

        if not email or not password:
            return _json_response(400, {
                "success": False,
                "error": "Email and password are required for registration."
            })

        if len(password) < 6:
            return _json_response(400, {
                "success": False,
                "error": "Password must be at least 6 characters long."
            })

        existing = storage.get_user_by_email(email)
        if existing:
            return _json_response(400, {
                "success": False,
                "error": "An account with this email already exists."
            })

        prefix = "tech" if role == "technician" else "usr"
        user_id = f"{prefix}_{int(datetime.utcnow().timestamp()*1000)}_{secrets.randbelow(1000)}"

        new_user = {
            "id": user_id,
            "org_id": DEFAULT_ORG_ID,
            "name": name,
            "email": email,
            "passwordHash": hash_password(password),
            "role": role,
            "roleDisplay": "Field Technician" if role == "technician" else "Campus User",
            "specialty": specialty,
            "approvalStatus": "Pending",  # Strict Admin Gating
            "avatar": (
                "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120"
                if role == "technician" else
                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120"
            ),
            "createdAt": datetime.utcnow().isoformat() + "Z"
        }

        saved = storage.save_user(new_user)
        record_audit_event(
            action="USER_REGISTERED",
            org_id=DEFAULT_ORG_ID,
            details={"userId": user_id, "email": email, "role": role, "specialty": specialty}
        )

        return _json_response(201, {
            "success": True,
            "message": "Account created. Please wait for an administrator to approve your account.",
            "user": saved
        })

    # ==========================================================================
    # ALL SUBSEQUENT ROUTES REQUIRE JWT AUTHENTICATION
    # ==========================================================================
    user, auth_error = authenticate_request(headers)
    if auth_error:
        return _json_response(auth_error["statusCode"], auth_error["body"])

    # 2. CURRENT USER INFO (/api/v1/auth/me)
    if norm_path == "/api/v1/auth/me" and method == "GET":
        u_data = storage.get_user_by_id(user.id, user.org_id)
        if not u_data:
            return _json_response(404, {"success": False, "error": "User not found"})
        return _json_response(200, {"success": True, "user": sanitize_user(u_data)})

    # ==========================================================================
    # 3. ADMIN USER MANAGEMENT ROUTES
    # ==========================================================================
    if norm_path == "/api/v1/admin/users" and method == "GET":
        if not user.is_admin():
            return _json_response(403, {"success": False, "error": "Administrative permissions required."})
        users_list = storage.list_users(user.org_id)
        return _json_response(200, {"success": True, "users": users_list})

    if norm_path.startswith("/api/v1/admin/users/") and norm_path.endswith("/approve") and method == "POST":
        if not user.is_admin():
            return _json_response(403, {"success": False, "error": "Administrative permissions required."})
        target_id = norm_path.split("/")[-2]
        target = storage.get_user_by_id(target_id, user.org_id)
        if not target:
            return _json_response(404, {"success": False, "error": "User not found in this organization"})
        target["approvalStatus"] = "Approved"
        target["approvedAt"] = datetime.utcnow().isoformat() + "Z"
        target["approvedBy"] = user.email
        saved = storage.save_user(target)
        record_audit_event(
            action="USER_APPROVED",
            org_id=user.org_id,
            actor=user,
            details={"approvedUserId": target_id, "email": target.get("email")}
        )
        return _json_response(200, {"success": True, "user": saved})

    if norm_path.startswith("/api/v1/admin/users/") and norm_path.endswith("/reject") and method == "POST":
        if not user.is_admin():
            return _json_response(403, {"success": False, "error": "Administrative permissions required."})
        target_id = norm_path.split("/")[-2]
        target = storage.get_user_by_id(target_id, user.org_id)
        if not target:
            return _json_response(404, {"success": False, "error": "User not found in this organization"})
        target["approvalStatus"] = "Rejected"
        target["rejectedAt"] = datetime.utcnow().isoformat() + "Z"
        target["rejectedBy"] = user.email
        saved = storage.save_user(target)
        record_audit_event(
            action="USER_REJECTED",
            org_id=user.org_id,
            actor=user,
            details={"rejectedUserId": target_id, "email": target.get("email")}
        )
        return _json_response(200, {"success": True, "user": saved})

    # ==========================================================================
    # 4. TICKET ENDPOINTS (STRICT TENANT ISOLATION)
    # ==========================================================================
    # GET /api/v1/tickets: List tenant tickets scoped to user role & specialty
    if (norm_path == "/api/v1/tickets" or norm_path == "/api/tickets") and method == "GET":
        tickets = storage.list_tickets(
            org_id=user.org_id,
            role=user.role,
            user_id=user.id,
            specialty=user.specialty
        )
        return _json_response(200, {"success": True, "tickets": tickets, "count": len(tickets)})

    # POST /api/v1/tickets: Create ticket with mandatory image + AI triage + Safety check
    if (norm_path == "/api/v1/tickets" or norm_path == "/api/tickets") and method == "POST":
        complaint = body.get("complaint") or body.get("description") or ""
        image_data = body.get("image") or body.get("photo") or ""
        mime_type = body.get("mimeType", "image/jpeg")

        if not complaint.strip():
            return _json_response(400, {"success": False, "error": "A complaint description is required."})

        if not image_data:
            return _json_response(400, {
                "success": False,
                "error": "A photo of the maintenance fault is mandatory for verification."
            })

        try:
            # 1. Query RAG vector store for past similar repairs
            rag_matches, search_mode = query_knowledge_base(complaint, org_id=user.org_id)

            # 2. Run multimodal vision triage
            triage = analyze_maintenance_fault(
                complaint=complaint,
                image_base64=image_data,
                mime_type=mime_type,
                historical_matches=rag_matches
            )

            # 3. Create authoritative ticket
            ticket_id = f"TCK-{secrets.randbelow(9000)+1000}"
            now_iso = datetime.utcnow().isoformat() + "Z"

            ticket = {
                "id": ticket_id,
                "org_id": user.org_id,
                "title": triage["title"],
                "description": triage["description"],
                "category": triage["category"],
                "priority": triage["priority"],
                "urgency": triage["urgency"],
                "priorityScore": triage["priorityScore"],
                "isHazard": triage["isHazard"],
                "safetyOverride": triage["safetyOverride"],
                "status": TicketStatus.ASSIGNED,
                "techConfirmed": False,
                "userConfirmed": False,
                "location": triage["location"],
                "assignedTo": triage["assignedTo"],
                "photo": image_data,
                "reporterId": user.id,
                "reporterName": user.name,
                "reporterEmail": user.email,
                "reportedBy": {
                    "id": user.id,
                    "name": user.name,
                    "email": user.email,
                    "role": "User"
                },
                "ragMatches": rag_matches,
                "ragSearchMode": search_mode,
                "reopenCount": 0,
                "createdAt": now_iso,
                "updatedAt": now_iso
            }

            saved = storage.save_ticket(ticket, user.org_id)

            record_audit_event(
                action="TICKET_CREATED",
                org_id=user.org_id,
                actor=user,
                ticket_id=ticket_id,
                details={
                    "category": triage["category"],
                    "priority": triage["priority"],
                    "safetyOverride": triage["safetyOverride"]
                }
            )

            if triage["safetyOverride"]:
                record_audit_event(
                    action="SAFETY_OVERRIDE_TRIGGERED",
                    org_id=user.org_id,
                    actor=user,
                    ticket_id=ticket_id,
                    details={"priority": "Emergency", "reason": "Hazard keywords detected"}
                )

            return _json_response(201, {"success": True, "ticket": saved})
        except Exception as e:
            return _json_response(422, {"success": False, "error": str(e)})

    # Single Ticket Sub-Routes
    if norm_path.startswith("/api/v1/tickets/"):
        ticket_id = norm_path.split("/")[4] if len(norm_path.split("/")) > 4 else ""
        ticket = storage.get_ticket(ticket_id, user.org_id)

        if not ticket:
            # 404 / 403 to prevent cross-tenant enumeration
            return _json_response(404, {"success": False, "error": "Ticket not found or access denied."})

        # GET /api/v1/tickets/:id
        if norm_path == f"/api/v1/tickets/{ticket_id}" and method == "GET":
            return _json_response(200, {"success": True, "ticket": ticket})

        # PATCH /api/v1/tickets/:id/status
        if norm_path == f"/api/v1/tickets/{ticket_id}/status" and method == "PATCH":
            new_status = body.get("status")
            try:
                updated = transition_ticket_status(ticket, new_status, user)
                saved = storage.save_ticket(updated, user.org_id)
                record_audit_event(
                    action="STATUS_CHANGED",
                    org_id=user.org_id,
                    actor=user,
                    ticket_id=ticket_id,
                    details={"from": ticket.get("status"), "to": new_status}
                )
                return _json_response(200, {"success": True, "ticket": saved})
            except (ValueError, PermissionError) as e:
                return _json_response(403 if isinstance(e, PermissionError) else 400, {
                    "success": False,
                    "error": str(e)
                })

        # POST /api/v1/tickets/:id/tech-complete
        if norm_path == f"/api/v1/tickets/{ticket_id}/tech-complete" and method == "POST":
            notes = body.get("resolutionNotes") or body.get("notes") or ""
            try:
                updated = tech_complete_ticket(ticket, user, notes)
                saved = storage.save_ticket(updated, user.org_id)
                record_audit_event(
                    action="TECH_CONFIRMED",
                    org_id=user.org_id,
                    actor=user,
                    ticket_id=ticket_id,
                    details={"resolutionNotes": notes}
                )
                return _json_response(200, {"success": True, "ticket": saved})
            except (ValueError, PermissionError) as e:
                return _json_response(403 if isinstance(e, PermissionError) else 400, {
                    "success": False,
                    "error": str(e)
                })

        # POST /api/v1/tickets/:id/verify-closure (Dual confirmation completed)
        if norm_path == f"/api/v1/tickets/{ticket_id}/verify-closure" and method == "POST":
            try:
                updated = consumer_verify_closure(ticket, user)
                saved = storage.save_ticket(updated, user.org_id)
                record_audit_event(
                    action="CONSUMER_CONFIRMED",
                    org_id=user.org_id,
                    actor=user,
                    ticket_id=ticket_id
                )

                # Ingest verified repair into trusted RAG knowledge base
                rag_ingested = ingest_verified_repair_to_rag(saved, user.org_id)
                if rag_ingested:
                    record_audit_event(
                        action="RAG_KNOWLEDGE_INGESTED",
                        org_id=user.org_id,
                        actor=user,
                        ticket_id=ticket_id
                    )

                return _json_response(200, {"success": True, "ticket": saved})
            except (ValueError, PermissionError) as e:
                return _json_response(403 if isinstance(e, PermissionError) else 400, {
                    "success": False,
                    "error": str(e)
                })

        # POST /api/v1/tickets/:id/reject-closure (Consumer rejection + Reopening)
        if norm_path == f"/api/v1/tickets/{ticket_id}/reject-closure" and method == "POST":
            reason = body.get("rejectionReason") or body.get("reason") or ""
            try:
                updated = consumer_reject_closure(ticket, user, reason)
                saved = storage.save_ticket(updated, user.org_id)
                record_audit_event(
                    action="CONSUMER_REJECTED",
                    org_id=user.org_id,
                    actor=user,
                    ticket_id=ticket_id,
                    details={"rejectionReason": reason, "reopenCount": saved["reopenCount"]}
                )
                return _json_response(200, {
                    "success": True,
                    "message": "Work order reopened and returned to assigned technician.",
                    "ticket": saved
                })
            except (ValueError, PermissionError) as e:
                return _json_response(403 if isinstance(e, PermissionError) else 400, {
                    "success": False,
                    "error": str(e)
                })

        # DELETE /api/v1/tickets/:id
        if norm_path == f"/api/v1/tickets/{ticket_id}" and method == "DELETE":
            # Only admin or ticket reporter can delete
            is_owner = ticket.get("reporterId") == user.id
            if not user.is_admin() and not is_owner:
                return _json_response(403, {"success": False, "error": "Only an administrator or the reporter can delete this ticket."})

            storage.delete_ticket(ticket_id, user.org_id)
            record_audit_event(
                action="TICKET_DELETED",
                org_id=user.org_id,
                actor=user,
                ticket_id=ticket_id
            )
            return _json_response(200, {"success": True, "message": f"Ticket #{ticket_id} deleted."})

    # ==========================================================================
    # 5. AUDIT LOGS ENDPOINT (/api/v1/audit-logs)
    # ==========================================================================
    if (norm_path == "/api/v1/audit-logs" or norm_path == "/api/audit-logs") and method == "GET":
        if not user.is_admin():
            return _json_response(403, {"success": False, "error": "Administrative permissions required to view audit logs."})
        logs = storage.list_audit_logs(user.org_id)
        return _json_response(200, {"success": True, "auditLogs": logs})

    return _json_response(404, {"success": False, "error": f"Endpoint not found: {method} {norm_path}"})
