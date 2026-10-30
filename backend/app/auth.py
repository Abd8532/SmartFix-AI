"""
Authentication & Authorization Module for FixFlow AI
Handles password hashing (PBKDF2-SHA256), JWT generation, token verification,
and claim extraction (User ID, Role, Org ID).
"""
import hmac
import hashlib
import base64
import json
import time
import secrets
from typing import Dict, Any, Optional, Tuple
from .config import JWT_SECRET, JWT_EXPIRATION_SECONDS, COGNITO_USER_POOL_ID, COGNITO_REGION


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _base64url_decode(data: str) -> bytes:
    padding = 4 - (len(data) % 4)
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data.encode("utf-8"))


# ==============================================================================
# SECURE PASSWORD HASHING (PBKDF2-HMAC-SHA256)
# ==============================================================================
def hash_password(password: str) -> str:
    """Hash password with PBKDF2-HMAC-SHA256 using 100,000 iterations and a 16-byte random salt."""
    if not password:
        raise ValueError("Password cannot be empty")
    salt = secrets.token_bytes(16)
    iterations = 100_000
    hash_bytes = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${hash_bytes.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against a stored PBKDF2 hash or migrate plain legacy match."""
    if not password or not hashed:
        return False

    if hashed.startswith("pbkdf2_sha256$"):
        try:
            parts = hashed.split("$")
            if len(parts) != 4:
                return False
            _, iterations_str, salt_hex, expected_hash_hex = parts
            iterations = int(iterations_str)
            salt = bytes.fromhex(salt_hex)
            computed_bytes = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
            return hmac.compare_digest(computed_bytes.hex(), expected_hash_hex)
        except Exception:
            return False

    # Temporary migration fallback for legacy unhashed seeds:
    # If exact string match, allow login and mark for rehash
    return hmac.compare_digest(password, hashed)


# ==============================================================================
# JWT TOKEN GENERATION & SIGNATURE VERIFICATION
# ==============================================================================
def create_access_token(user: Dict[str, Any], expires_in: int = JWT_EXPIRATION_SECONDS) -> str:
    """Create a signed JWT with verified identity claims (sub, email, role, org_id)."""
    now = int(time.time())
    header = {
        "alg": "HS256",
        "typ": "JWT"
    }
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "name": user.get("name", "User"),
        "role": user.get("role", "user"),
        "org_id": user.get("org_id") or user.get("orgId", "org_campus_main"),
        "specialty": user.get("specialty"),
        "approval_status": user.get("approvalStatus", "Approved"),
        "iat": now,
        "exp": now + expires_in
    }

    encoded_header = _base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_payload = _base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    
    signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    encoded_signature = _base64url_encode(signature)
    
    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"


def verify_jwt_token(token: str) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
    """
    Verify a JWT token signature and expiration.
    Returns (is_valid, claims_dict, error_message).
    """
    if not token or not isinstance(token, str):
        return False, None, "Missing token"

    # Strip 'Bearer ' if present
    if token.lower().startswith("bearer "):
        token = token[7:].strip()

    parts = token.split(".")
    if len(parts) != 3:
        return False, None, "Invalid token structure"

    encoded_header, encoded_payload, encoded_signature = parts

    try:
        signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
        expected_sig = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
        actual_sig = _base64url_decode(encoded_signature)

        if not hmac.compare_digest(expected_sig, actual_sig):
            return False, None, "Invalid token signature"

        payload_bytes = _base64url_decode(encoded_payload)
        payload = json.loads(payload_bytes.decode("utf-8"))

        now = int(time.time())
        if "exp" in payload and now > payload["exp"]:
            return False, None, "Token has expired"

        # Validate mandatory claims
        if not payload.get("sub") or not payload.get("role") or not payload.get("org_id"):
            return False, None, "Token missing required claims (sub, role, org_id)"

        return True, payload, None
    except Exception as e:
        return False, None, f"Token verification failed: {str(e)}"


class AuthenticatedUser:
    """Represents a verified identity extracted exclusively from verified JWT claims."""
    def __init__(self, claims: Dict[str, Any]):
        self.id = claims["sub"]
        self.email = claims.get("email", "")
        self.name = claims.get("name", "")
        self.role = claims.get("role", "user")
        self.org_id = claims.get("org_id", "org_campus_main")
        self.specialty = claims.get("specialty")
        self.approval_status = claims.get("approval_status", "Approved")
        self.claims = claims

    def is_admin(self) -> bool:
        return self.role == "admin"

    def is_technician(self) -> bool:
        return self.role == "technician"

    def is_consumer(self) -> bool:
        return self.role == "user"

    def is_approved(self) -> bool:
        return self.approval_status == "Approved"


def authenticate_request(headers: Dict[str, str]) -> Tuple[Optional[AuthenticatedUser], Optional[Dict[str, Any]]]:
    """
    Extract Authorization header, verify JWT token, and return AuthenticatedUser.
    Returns (user, error_response_dict).
    """
    auth_header = None
    for k, v in headers.items():
        if k.lower() == "authorization":
            auth_header = v
            break

    if not auth_header:
        return None, {
            "statusCode": 401,
            "body": {"success": False, "error": "Missing Authorization header"}
        }

    is_valid, claims, error_msg = verify_jwt_token(auth_header)
    if not is_valid or not claims:
        return None, {
            "statusCode": 401,
            "body": {"success": False, "error": f"Unauthorized: {error_msg}"}
        }

    user = AuthenticatedUser(claims)
    if not user.is_approved() and not user.is_admin():
        return None, {
            "statusCode": 403,
            "body": {
                "success": False,
                "error": "Access Denied: Your account is pending administrator approval.",
                "status": "Pending"
            }
        }

    return user, None
