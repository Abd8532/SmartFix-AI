"""
REST API Router & Request Handler for SmartFix AI
Authoritative routing with strict JWT verification, multi-tenant isolation,
optimistic concurrency control, queue separation, presigned uploads, and dual-approval enforcement.
"""
import json
import secrets
import base64
import time
from datetime import datetime
from typing import Dict, Any, Tuple, Optional

from .config import (
    DEFAULT_ORG_ID,
    DEV_DEFAULT_ORG_ID,
    ENVIRONMENT,
    DATA_BACKEND,
    ALLOWED_ORIGINS,
    MAX_UPLOAD_SIZE_BYTES,
    ALLOWED_MIME_TYPES,
    S3_BUCKET_NAME,
    S3_REGION
)
from .auth import (
    authenticate_request,
    hash_password,
    verify_password,
    create_access_token,
    check_rate_limit,
    check_endpoint_rate_limit,
    record_failed_login,
    reset_failed_login,
    generate_session_cookie_header,
    generate_csrf_cookie_header,
    AuthenticatedUser
)
from .models import (
    UserRole,
    TicketStatus,
    TicketPriority,
    sanitize_user,
    sanitize_ticket
)
from .storage import storage, ConcurrencyError
from .s3 import (
    generate_presigned_upload_url,
    generate_presigned_post_data,
    generate_presigned_view_url,
    validate_s3_key_tenant,
    validate_upload_request,
    verify_uploaded_s3_object,
    get_s3_client
)
from .lifecycle import (
    transition_ticket_status,
    tech_complete_ticket,
    consumer_verify_closure,
    consumer_reject_closure,
    can_technician_work_on_ticket,
    claim_ticket_for_technician,
    validate_technician_skill_for_category
)
from .rag import (
    query_knowledge_base,
    ingest_verified_repair_to_rag
)
from .ai import analyze_maintenance_fault
from .audit import record_audit_event


def _json_response(
    status_code: int,
    body: Any,
    req_origin: Optional[str] = None,
    extra_headers: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """Build standardized JSON response with strict CORS, security headers, and optional cookies."""
    allow_origin = None
    if req_origin:
        clean_req = req_origin.rstrip("/")
        for allowed in ALLOWED_ORIGINS:
            if clean_req == allowed.rstrip("/"):
                allow_origin = req_origin
                break

    if not allow_origin:
        allow_origin = ALLOWED_ORIGINS[0] if ALLOWED_ORIGINS else "http://localhost:5173"

    resp_headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": allow_origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-CSRF-Token,X-XSRF-Token,X-Requested-With,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Cache-Control": "no-store, no-cache, must-revalidate"
    }

    if ENVIRONMENT == "production":
        resp_headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

    if extra_headers:
        resp_headers.update(extra_headers)

    return {
        "statusCode": status_code,
        "headers": resp_headers,
        "body": json.dumps(body) if not isinstance(body, str) else body
    }


def validate_image_payload(image_data: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Validates MIME type, file size, and magic bytes for image uploads.
    Returns (is_valid, detected_mime, error_message).
    """
    if not image_data or not isinstance(image_data, str):
        return False, None, "Image data is missing or empty"

    clean_b64 = image_data
    if "," in clean_b64:
        clean_b64 = clean_b64.split(",", 1)[1]

    try:
        raw_bytes = base64.b64decode(clean_b64)
    except Exception as e:
        return False, None, f"Malformed base64 image data: {str(e)}"

    if len(raw_bytes) > MAX_UPLOAD_SIZE_BYTES:
        return False, None, f"Image exceeds maximum allowed size of {MAX_UPLOAD_SIZE_BYTES // (1024*1024)}MB"

    if len(raw_bytes) < 12:
        return False, None, "Image payload is too small to contain valid headers"

    # Magic Bytes Validation
    # JPEG: \xFF\xD8\xFF
    if raw_bytes[:3] == b"\xff\xd8\xff":
        return True, "image/jpeg", None

    # PNG: \x89PNG\r\n\x1a\n
    if raw_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return True, "image/png", None

    # WebP: starts with RIFF and has WEBP at offset 8..12
    if raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP":
        return True, "image/webp", None

    return False, None, "Invalid or corrupted image format. Only authentic JPEG, PNG, or WebP images are permitted."


def handle_api_request(
    path: str,
    method: str,
    headers: Dict[str, str],
    body_data: Any
) -> Dict[str, Any]:
    """
    Main dispatch router matching the API specification.
    Normalizes path and method, enforces JWT authentication, tenant isolation,
    optimistic concurrency, and returns standard JSON responses.
    """
    req_origin = headers.get("Origin") or headers.get("origin")

    # Normalize path and extract query parameters
    raw_path = "/" + path.strip("/")
    query_params: Dict[str, str] = {}
    if "?" in raw_path:
        norm_path, query_str = raw_path.split("?", 1)
        for param in query_str.split("&"):
            if "=" in param:
                k, v = param.split("=", 1)
                query_params[k.strip().lower()] = v.strip()
            else:
                query_params[param.strip().lower()] = "true"
    else:
        norm_path = raw_path

    method = method.upper()

    # Pre-flight OPTIONS CORS support
    if method == "OPTIONS":
        return _json_response(200, {"success": True}, req_origin)

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

    # Health check endpoint (clean minimal payload in production to prevent reconnaissance)
    if (norm_path == "/api/v1/health" or norm_path == "/health") and method == "GET":
        resp_payload = {
            "status": "healthy",
            "version": "1.0.0"
        }
        if ENVIRONMENT != "production":
            resp_payload["environment"] = ENVIRONMENT
            resp_payload["dataBackend"] = DATA_BACKEND
        return _json_response(200, resp_payload, req_origin)

    # ==========================================================================
    # 1. PUBLIC AUTH ROUTES
    # ==========================================================================
    if (norm_path == "/api/v1/auth/logout" or norm_path == "/api/logout") and method == "POST":
        clear_cookie = {
            "Set-Cookie": "smartfix_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Strict, smartfix_csrf=; Path=/; Max-Age=0; SameSite=Strict"
        }
        return _json_response(200, {"success": True, "message": "Logged out successfully."}, req_origin, extra_headers=clear_cookie)

    if (norm_path == "/api/v1/auth/login" or norm_path == "/api/login") and method == "POST":
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")

        is_allowed, rate_err = check_rate_limit(email)
        if not is_allowed:
            return _json_response(429, {"success": False, "error": rate_err}, req_origin)

        user = storage.get_user_by_email(email)
        if not user:
            record_failed_login(email)
            return _json_response(401, {"success": False, "error": "Invalid email or password."}, req_origin)

        stored_hash = user.get("passwordHash") or user.get("password") or ""
        if not verify_password(password, stored_hash):
            record_failed_login(email)
            return _json_response(401, {"success": False, "error": "Invalid email or password."}, req_origin)

        reset_failed_login(email)

        if user.get("approvalStatus") == "Pending" and user.get("role") != "admin":
            return _json_response(403, {
                "success": False,
                "status": "Pending",
                "error": "Access Denied: Your account is pending administrator approval."
            }, req_origin)

        if user.get("approvalStatus") == "Rejected":
            return _json_response(403, {
                "success": False,
                "status": "Rejected",
                "error": "Access Denied: Your registration was rejected by an administrator."
            }, req_origin)

        user_org = user.get("org_id") or user.get("orgId")
        if not user_org:
            if ENVIRONMENT == "production":
                return _json_response(403, {
                    "success": False,
                    "error": "Account configuration error: No verified organization membership."
                }, req_origin)
            user_org = DEV_DEFAULT_ORG_ID
            user["org_id"] = user_org

        token = create_access_token(user)
        safe_user = sanitize_user(user)
        safe_user["token"] = token

        # Generate CSRF token and Set-Cookie session headers for secure cookie migration
        csrf_token = secrets.token_hex(24)
        session_cookie = generate_session_cookie_header(token)
        csrf_cookie = generate_csrf_cookie_header(csrf_token)
        cookie_headers = {
            "Set-Cookie": f"{session_cookie}, {csrf_cookie}"
        }

        record_audit_event(
            action="USER_LOGIN",
            org_id=user_org,
            details={"email": user["email"], "role": user.get("role")}
        )

        return _json_response(200, {
            "success": True,
            "token": token,
            "csrfToken": csrf_token,
            "user": safe_user
        }, req_origin, extra_headers=cookie_headers)

    if (norm_path == "/api/v1/auth/register" or norm_path == "/api/register") and method == "POST":
        # Rate limit registrations to prevent automated account creation abuse
        client_tag = headers.get("Origin", "global")
        is_reg_ok, reg_err = check_endpoint_rate_limit(f"reg_{client_tag}", max_requests=15, window_seconds=60)
        if not is_reg_ok:
            return _json_response(429, {"success": False, "error": reg_err}, req_origin)
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        role = body.get("role", "user").strip().lower()
        name = body.get("name", "").strip() or email.split("@")[0]
        specialty = body.get("specialty") if role == "technician" else None
        org_id = (body.get("org_id") or body.get("orgId") or "").strip()

        # Requirement 1: Public registration as administrator is strictly prohibited
        if role == "admin":
            return _json_response(403, {
                "success": False,
                "error": "Security Restriction: Public administrator registration is prohibited. Administrator accounts must be provisioned internally."
            }, req_origin)

        # Requirement 2: Reject missing or unknown organization membership in production
        if not org_id:
            if ENVIRONMENT == "production":
                return _json_response(400, {
                    "success": False,
                    "error": "Organisation ID (org_id) is mandatory for registration."
                }, req_origin)
            org_id = DEV_DEFAULT_ORG_ID

        if not email or not password:
            return _json_response(400, {
                "success": False,
                "error": "Email and password are required for registration."
            }, req_origin)

        if len(password) < 6:
            return _json_response(400, {
                "success": False,
                "error": "Password must be at least 6 characters long."
            }, req_origin)

        existing = storage.get_user_by_email(email)
        if existing:
            return _json_response(400, {
                "success": False,
                "error": "An account with this email already exists."
            }, req_origin)

        prefix = "tech" if role == "technician" else "usr"
        user_id = f"{prefix}_{int(datetime.utcnow().timestamp()*1000)}_{secrets.randbelow(1000)}"

        new_user = {
            "id": user_id,
            "org_id": org_id,
            "orgId": org_id,
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
            org_id=org_id,
            details={"userId": user_id, "email": email, "role": role, "specialty": specialty}
        )

        return _json_response(201, {
            "success": True,
            "message": "Account created. Please wait for an administrator to approve your account.",
            "user": saved
        }, req_origin)

    # ==========================================================================
    # ALL SUBSEQUENT ROUTES REQUIRE JWT OR COOKIE AUTHENTICATION
    # ==========================================================================
    user, auth_error = authenticate_request(headers, method=method)
    if auth_error:
        return _json_response(auth_error["statusCode"], auth_error["body"], req_origin)

    # Reject caller if organization is missing or untrusted
    if not user.org_id:
        return _json_response(403, {
            "success": False,
            "error": "Access Denied: Missing verified organisation membership claim."
        }, req_origin)

    # 2. CURRENT USER INFO (/api/v1/auth/me)
    if norm_path == "/api/v1/auth/me" and method == "GET":
        u_data = storage.get_user_by_id(user.id, user.org_id)
        if not u_data:
            return _json_response(404, {"success": False, "error": "User not found in tenant organization"}, req_origin)
        return _json_response(200, {"success": True, "user": sanitize_user(u_data)}, req_origin)

    # ==========================================================================
    # 3. UPLOAD & PRESIGNED S3 ENDPOINTS
    # ==========================================================================
    if (norm_path == "/api/v1/uploads/presign" or norm_path == "/api/uploads/presign") and method == "POST":
        # Rate limit upload URL requests per user
        is_up_ok, up_err = check_endpoint_rate_limit(f"up_{user.id}", max_requests=25, window_seconds=60)
        if not is_up_ok:
            return _json_response(429, {"success": False, "error": up_err}, req_origin)

        mime_type = (body.get("mimeType") or "").strip().lower()
        file_size = int(body.get("fileSize", 0) or 0)
        file_name = (body.get("fileName") or "upload.jpg").strip()
        upload_mode = (body.get("uploadMode") or "put").strip().lower()

        try:
            if upload_mode == "post":
                result = generate_presigned_post_data(
                    org_id=user.org_id,
                    file_name=file_name,
                    mime_type=mime_type,
                    max_bytes=MAX_UPLOAD_SIZE_BYTES,
                    expires_in=900
                )
            else:
                result = generate_presigned_upload_url(
                    org_id=user.org_id,
                    file_name=file_name,
                    mime_type=mime_type,
                    file_size=file_size,
                    expires_in=900
                )
            return _json_response(200, result, req_origin)
        except ValueError as ve:
            return _json_response(400, {"success": False, "error": str(ve)}, req_origin)
        except Exception as e:
            return _json_response(500, {"success": False, "error": f"Upload URL generation failed: {str(e)}"}, req_origin)

    if (norm_path == "/api/v1/uploads/presigned-view" or norm_path == "/api/uploads/presigned-view") and method == "GET":
        from urllib.parse import parse_qs, urlparse
        parsed = urlparse(path)
        qs = parse_qs(parsed.query)
        file_key = qs.get("key", [None])[0]
        if not file_key:
            return _json_response(400, {"success": False, "error": "Query parameter 'key' is required."}, req_origin)

        # 1. Enforce strict tenant isolation on S3 key prefix
        if not validate_s3_key_tenant(file_key, user.org_id):
            return _json_response(403, {
                "success": False,
                "error": f"Cross-tenant access violation: key '{file_key}' does not belong to organization '{user.org_id}'."
            }, req_origin)

        # 2. Verify attachment is actually linked to a ticket and check authorization
        ticket_id = qs.get("ticket_id", [None])[0] or qs.get("ticketId", [None])[0]
        associated_ticket = None
        if ticket_id:
            associated_ticket = storage.get_ticket(ticket_id, user.org_id)
        else:
            tenant_tickets = storage.list_tickets(org_id=user.org_id, role="admin", user_id=user.id)
            associated_ticket = next((t for t in tenant_tickets if t.get("fileKey") == file_key or t.get("photoKey") == file_key), None)

        if not associated_ticket:
            return _json_response(404, {
                "success": False,
                "error": "Attachment is not associated with any authorized ticket in this organization."
            }, req_origin)

        # Consumer Authorization: Consumer may view only attachments on tickets they reported
        if user.is_consumer():
            rep_id = associated_ticket.get("reporterId") or associated_ticket.get("reportedBy", {}).get("id")
            rep_email = (associated_ticket.get("reporterEmail") or associated_ticket.get("reportedBy", {}).get("email") or "").lower()
            if rep_id != user.id and rep_email != user.email.lower():
                return _json_response(403, {
                    "success": False,
                    "error": "Access Denied: Consumers may view attachments only for tickets they reported."
                }, req_origin)

        # Technician Authorization: Technician may view only assigned or claimable ticket attachments
        if user.is_technician():
            assigned_tech = associated_ticket.get("assignedTechId")
            if assigned_tech and assigned_tech != user.id:
                return _json_response(403, {
                    "success": False,
                    "error": "Access Denied: Work order attachment belongs to another technician's ticket."
                }, req_origin)

        try:
            view_url = generate_presigned_view_url(file_key=file_key, org_id=user.org_id, expires_in=3600)
            return _json_response(200, {"success": True, "viewUrl": view_url, "fileKey": file_key}, req_origin)
        except ValueError as ve:
            return _json_response(403, {"success": False, "error": str(ve)}, req_origin)
        except Exception as e:
            return _json_response(500, {"success": False, "error": str(e)}, req_origin)

    # ==========================================================================
    # 4. ADMIN USER MANAGEMENT ROUTES (ADMIN ONLY)
    # ==========================================================================
    if norm_path == "/api/v1/admin/users" and method == "GET":
        if not user.is_admin():
            return _json_response(403, {"success": False, "error": "Administrative permissions required."}, req_origin)
        users_list = storage.list_users(user.org_id)
        return _json_response(200, {"success": True, "users": users_list}, req_origin)

    if norm_path.startswith("/api/v1/admin/users/") and norm_path.endswith("/approve") and method == "POST":
        if not user.is_admin():
            return _json_response(403, {"success": False, "error": "Administrative permissions required."}, req_origin)
        target_id = norm_path.split("/")[-2]
        target = storage.get_user_by_id(target_id, user.org_id)
        if not target:
            return _json_response(404, {"success": False, "error": "User not found in this organization"}, req_origin)
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
        return _json_response(200, {"success": True, "user": saved}, req_origin)

    if norm_path.startswith("/api/v1/admin/users/") and norm_path.endswith("/reject") and method == "POST":
        if not user.is_admin():
            return _json_response(403, {"success": False, "error": "Administrative permissions required."}, req_origin)
        target_id = norm_path.split("/")[-2]
        target = storage.get_user_by_id(target_id, user.org_id)
        if not target:
            return _json_response(404, {"success": False, "error": "User not found in this organization"}, req_origin)
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
        return _json_response(200, {"success": True, "user": saved}, req_origin)

    # ==========================================================================
    # 5. TICKET ENDPOINTS (STRICT TENANT ISOLATION & QUEUE SEPARATION)
    # ==========================================================================
    # GET /api/v1/tickets & GET /api/v1/tickets/claimable
    if (norm_path == "/api/v1/tickets" or norm_path == "/api/tickets" or norm_path == "/api/v1/tickets/claimable") and method == "GET":
        queue = query_params.get("queue")
        if norm_path.endswith("/claimable"):
            queue = "claimable"

        tickets = storage.list_tickets(
            org_id=user.org_id,
            role=user.role,
            user_id=user.id,
            specialty=user.specialty,
            queue=queue
        )
        return _json_response(200, {"success": True, "tickets": tickets, "count": len(tickets)}, req_origin)

    # POST /api/v1/tickets: Create ticket with mandatory image + server-side validation + AI triage
    if (norm_path == "/api/v1/tickets" or norm_path == "/api/tickets") and method == "POST":
        # Rate limit ticket creation per user to prevent flooding
        is_tck_ok, tck_err = check_endpoint_rate_limit(f"ticket_{user.id}", max_requests=30, window_seconds=60)
        if not is_tck_ok:
            return _json_response(429, {"success": False, "error": tck_err}, req_origin)

        complaint = body.get("complaint") or body.get("description") or ""
        image_data = body.get("image") or body.get("photo") or ""
        file_key = body.get("fileKey") or body.get("photoKey") or ""
        mime_type = body.get("mimeType", "image/jpeg")

        if not complaint.strip():
            return _json_response(400, {"success": False, "error": "A complaint description is required."}, req_origin)

        if not image_data and not file_key:
            return _json_response(400, {
                "success": False,
                "error": "A photo of the maintenance fault (or verified S3 upload key) is mandatory for verification."
            }, req_origin)

        # Validate S3 tenant scoping and verify actual uploaded object in storage
        if file_key:
            if not validate_s3_key_tenant(file_key, user.org_id):
                return _json_response(403, {
                    "success": False,
                    "error": f"Invalid attachment key: file key does not belong to tenant '{user.org_id}'."
                }, req_origin)
            try:
                verify_uploaded_s3_object(file_key, user.org_id)
            except Exception as e:
                return _json_response(400, {
                    "success": False,
                    "error": f"S3 attachment verification failed: {str(e)}"
                }, req_origin)

        # Server-side Image Security Validation (MIME type, file size, magic bytes)
        effective_mime = mime_type
        if image_data:
            is_valid_img, detected_mime, img_err = validate_image_payload(image_data)
            if not is_valid_img:
                return _json_response(400, {
                    "success": False,
                    "error": f"Image security validation failed: {img_err}"
                }, req_origin)
            effective_mime = detected_mime or mime_type

        try:
            # 1. Query RAG vector store for past similar repairs
            rag_matches, search_mode = query_knowledge_base(complaint, org_id=user.org_id)

            # 2. Run multimodal vision triage (fallback transparently if image is only in S3)
            effective_img_b64 = image_data
            if not effective_img_b64 and file_key:
                effective_img_b64 = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="  # Stub 1x1 for AI pipeline when in S3
            triage = analyze_maintenance_fault(
                complaint=complaint,
                image_base64=effective_img_b64,
                mime_type=effective_mime,
                historical_matches=rag_matches
            )

            # 3. Create authoritative ticket with version: 1
            ticket_id = f"TCK-{secrets.randbelow(9000)+1000}"
            now_iso = datetime.utcnow().isoformat() + "Z"

            ticket = {
                "id": ticket_id,
                "org_id": user.org_id,
                "orgId": user.org_id,
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
                "assignedTechId": None,
                "photo": image_data,
                "fileKey": file_key or None,
                "photoKey": file_key or None,
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
                "version": 1,
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

            return _json_response(201, {"success": True, "ticket": saved}, req_origin)
        except Exception as e:
            return _json_response(422, {"success": False, "error": str(e)}, req_origin)

    # Single Ticket Sub-Routes
    if norm_path.startswith("/api/v1/tickets/"):
        ticket_id = norm_path.split("/")[4] if len(norm_path.split("/")) > 4 else ""
        ticket = storage.get_ticket(ticket_id, user.org_id)

        if not ticket:
            return _json_response(404, {"success": False, "error": "Ticket not found or access denied."}, req_origin)

        # Consumer Isolation: Consumers may retrieve only tickets they reported
        if user.is_consumer():
            rep_id = ticket.get("reporterId") or ticket.get("reportedBy", {}).get("id")
            rep_email = (ticket.get("reporterEmail") or ticket.get("reportedBy", {}).get("email") or "").lower()
            if rep_id != user.id and rep_email != user.email.lower():
                return _json_response(403, {
                    "success": False,
                    "error": "Access Denied: Consumers may retrieve only tickets they reported."
                }, req_origin)

        # Technician Isolation: Technicians cannot fetch another technician's private ticket
        if user.is_technician():
            assigned_tech_id = ticket.get("assignedTechId")
            if assigned_tech_id and assigned_tech_id != user.id:
                return _json_response(403, {
                    "success": False,
                    "error": "Access Denied: You are not assigned to this work order."
                }, req_origin)

        # GET /api/v1/tickets/:id
        if norm_path == f"/api/v1/tickets/{ticket_id}" and method == "GET":
            return _json_response(200, {"success": True, "ticket": ticket}, req_origin)

        # POST /api/v1/tickets/:id/claim (Atomic Technician Claim Operation)
        if norm_path == f"/api/v1/tickets/{ticket_id}/claim" and method == "POST":
            if not user.is_technician():
                return _json_response(403, {
                    "success": False,
                    "error": "Access Denied: Only field technicians can claim unassigned work orders."
                }, req_origin)

            try:
                # Workload check: active In Progress count
                active_workload = [
                    t for t in storage.list_tickets(user.org_id, role="technician", user_id=user.id, queue="assigned")
                    if t.get("status") == TicketStatus.IN_PROGRESS
                ]
                updated = claim_ticket_for_technician(ticket, user, active_workload_count=len(active_workload))
                expected_ver = int(body.get("version") or ticket.get("version", 1) or 1)

                saved = storage.save_ticket(updated, user.org_id, expected_version=expected_ver)
                record_audit_event(
                    action="TICKET_CLAIMED",
                    org_id=user.org_id,
                    actor=user,
                    ticket_id=ticket_id,
                    details={"assignedTechId": user.id, "technician": user.name}
                )
                return _json_response(200, {"success": True, "ticket": saved}, req_origin)
            except ConcurrencyError as ce:
                return _json_response(409, {
                    "success": False,
                    "error": f"Conflict: {str(ce)}",
                    "conflict": True
                }, req_origin)
            except (ValueError, PermissionError) as e:
                is_perm = isinstance(e, PermissionError)
                err_msg = str(e)
                is_conflict = "Conflict" in err_msg or "already been claimed" in err_msg
                status_code = 409 if is_conflict else (403 if is_perm else 400)
                resp_payload = {"success": False, "error": err_msg}
                if is_conflict:
                    resp_payload["conflict"] = True
                return _json_response(status_code, resp_payload, req_origin)

        # PATCH /api/v1/tickets/:id/status (Optimistic Concurrency)
        if norm_path == f"/api/v1/tickets/{ticket_id}/status" and method == "PATCH":
            new_status = body.get("status")
            expected_ver = int(body.get("version") or ticket.get("version", 1) or 1)
            try:
                updated = transition_ticket_status(ticket, new_status, user)
                saved = storage.save_ticket(updated, user.org_id, expected_version=expected_ver)
                record_audit_event(
                    action="STATUS_CHANGED",
                    org_id=user.org_id,
                    actor=user,
                    ticket_id=ticket_id,
                    details={"from": ticket.get("status"), "to": new_status, "version": saved.get("version")}
                )
                return _json_response(200, {"success": True, "ticket": saved}, req_origin)
            except ConcurrencyError as ce:
                return _json_response(409, {
                    "success": False,
                    "error": f"Conflict: {str(ce)}",
                    "conflict": True
                }, req_origin)
            except (ValueError, PermissionError) as e:
                return _json_response(403 if isinstance(e, PermissionError) else 400, {
                    "success": False,
                    "error": str(e)
                }, req_origin)

        # POST /api/v1/tickets/:id/tech-complete (Contract: resolutionNotes + Optimistic Concurrency)
        if norm_path == f"/api/v1/tickets/{ticket_id}/tech-complete" and method == "POST":
            notes = body.get("resolutionNotes") or body.get("resolution_notes") or body.get("notes") or ""
            expected_ver = int(body.get("version") or ticket.get("version", 1) or 1)
            try:
                updated = tech_complete_ticket(ticket, user, notes)
                saved = storage.save_ticket(updated, user.org_id, expected_version=expected_ver)
                record_audit_event(
                    action="TECH_CONFIRMED",
                    org_id=user.org_id,
                    actor=user,
                    ticket_id=ticket_id,
                    details={"resolutionNotes": notes, "version": saved.get("version")}
                )
                return _json_response(200, {"success": True, "ticket": saved}, req_origin)
            except ConcurrencyError as ce:
                return _json_response(409, {
                    "success": False,
                    "error": f"Conflict: {str(ce)}",
                    "conflict": True
                }, req_origin)
            except (ValueError, PermissionError) as e:
                return _json_response(403 if isinstance(e, PermissionError) else 400, {
                    "success": False,
                    "error": str(e)
                }, req_origin)

        # POST /api/v1/tickets/:id/verify-closure (Dual confirmation completed + Optimistic Concurrency)
        if norm_path == f"/api/v1/tickets/{ticket_id}/verify-closure" and method == "POST":
            expected_ver = int(body.get("version") or ticket.get("version", 1) or 1)
            try:
                updated = consumer_verify_closure(ticket, user)
                saved = storage.save_ticket(updated, user.org_id, expected_version=expected_ver)
                record_audit_event(
                    action="CONSUMER_CONFIRMED",
                    org_id=user.org_id,
                    actor=user,
                    ticket_id=ticket_id,
                    details={"version": saved.get("version")}
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

                return _json_response(200, {"success": True, "ticket": saved}, req_origin)
            except ConcurrencyError as ce:
                return _json_response(409, {
                    "success": False,
                    "error": f"Conflict: {str(ce)}",
                    "conflict": True
                }, req_origin)
            except (ValueError, PermissionError) as e:
                return _json_response(403 if isinstance(e, PermissionError) else 400, {
                    "success": False,
                    "error": str(e)
                }, req_origin)

        # POST /api/v1/tickets/:id/reject-closure (Contract: rejectionReason + Optimistic Concurrency)
        if norm_path == f"/api/v1/tickets/{ticket_id}/reject-closure" and method == "POST":
            reason = body.get("rejectionReason") or body.get("rejection_reason") or body.get("reason") or ""
            expected_ver = int(body.get("version") or ticket.get("version", 1) or 1)
            try:
                updated = consumer_reject_closure(ticket, user, reason)
                saved = storage.save_ticket(updated, user.org_id, expected_version=expected_ver)
                record_audit_event(
                    action="CONSUMER_REJECTED",
                    org_id=user.org_id,
                    actor=user,
                    ticket_id=ticket_id,
                    details={
                        "rejectionReason": reason,
                        "reopenCount": saved["reopenCount"],
                        "version": saved.get("version")
                    }
                )
                return _json_response(200, {
                    "success": True,
                    "message": "Work order reopened and returned to assigned technician.",
                    "ticket": saved
                }, req_origin)
            except ConcurrencyError as ce:
                return _json_response(409, {
                    "success": False,
                    "error": f"Conflict: {str(ce)}",
                    "conflict": True
                }, req_origin)
            except (ValueError, PermissionError) as e:
                return _json_response(403 if isinstance(e, PermissionError) else 400, {
                    "success": False,
                    "error": str(e)
                }, req_origin)

        # DELETE /api/v1/tickets/:id
        if norm_path == f"/api/v1/tickets/{ticket_id}" and method == "DELETE":
            is_owner = ticket.get("reporterId") == user.id
            if not user.is_admin() and not is_owner:
                return _json_response(403, {"success": False, "error": "Only an administrator or the reporter can delete this ticket."}, req_origin)

            storage.delete_ticket(ticket_id, user.org_id)
            record_audit_event(
                action="TICKET_DELETED",
                org_id=user.org_id,
                actor=user,
                ticket_id=ticket_id
            )
            return _json_response(200, {"success": True, "message": f"Ticket #{ticket_id} deleted."}, req_origin)

    # ==========================================================================
    # 6. AUDIT LOGS ENDPOINT (/api/v1/audit-logs) (ADMIN ONLY)
    # ==========================================================================
    if (norm_path == "/api/v1/audit-logs" or norm_path == "/api/audit-logs") and method == "GET":
        if not user.is_admin():
            return _json_response(403, {"success": False, "error": "Administrative permissions required to view audit logs."}, req_origin)
        logs = storage.list_audit_logs(user.org_id)
        return _json_response(200, {"success": True, "auditLogs": logs, "audit_logs": logs}, req_origin)

    return _json_response(404, {"success": False, "error": f"Endpoint not found: {method} {norm_path}"}, req_origin)
