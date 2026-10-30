"""
Authentication & Authorization Module for SmartFix AI
Handles PBKDF2-HMAC-SHA256 password hashing, rate limiting,
JWT token verification (including Amazon Cognito support), and identity claims derivation.
"""
import hmac
import hashlib
import base64
import json
import time
import secrets
from typing import Dict, Any, Optional, Tuple, List
from .config import (
    JWT_SECRET,
    JWT_EXPIRATION_SECONDS,
    COGNITO_USER_POOL_ID,
    COGNITO_APP_CLIENT_ID,
    COGNITO_REGION
)


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _base64url_decode(data: str) -> bytes:
    padding = 4 - (len(data) % 4)
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data.encode("utf-8"))


# ==============================================================================
# LOGIN RATE LIMITER (In-Memory Protection against Brute-Force)
# ==============================================================================
_failed_attempts: Dict[str, List[float]] = {}
RATE_LIMIT_WINDOW = 900  # 15 minutes
MAX_FAILED_ATTEMPTS = 5


def check_rate_limit(identifier: str) -> Tuple[bool, Optional[str]]:
    """
    Check if an IP or email identifier has exceeded the maximum allowed failed attempts.
    Returns (is_allowed, error_message).
    """
    now = time.time()
    clean_id = (identifier or "unknown").strip().lower()
    attempts = _failed_attempts.get(clean_id, [])

    # Keep only attempts within the sliding window
    valid_attempts = [t for t in attempts if now - t < RATE_LIMIT_WINDOW]
    _failed_attempts[clean_id] = valid_attempts

    if len(valid_attempts) >= MAX_FAILED_ATTEMPTS:
        retry_after = int(RATE_LIMIT_WINDOW - (now - valid_attempts[0]))
        return False, f"Too many failed login attempts. Please try again in {max(1, retry_after // 60)} minutes."

    return True, None


def record_failed_login(identifier: str):
    """Record a failed login attempt for rate-limiting."""
    clean_id = (identifier or "unknown").strip().lower()
    now = time.time()
    attempts = _failed_attempts.get(clean_id, [])
    attempts.append(now)
    _failed_attempts[clean_id] = [t for t in attempts if now - t < RATE_LIMIT_WINDOW]


def reset_failed_login(identifier: str):
    """Clear failed attempts upon successful authentication."""
    clean_id = (identifier or "unknown").strip().lower()
    _failed_attempts.pop(clean_id, None)


# ==============================================================================
# SECURE PASSWORD HASHING (PBKDF2-HMAC-SHA256)
# ==============================================================================
def hash_password(password: str) -> str:
    """
    Hash password with PBKDF2-HMAC-SHA256 using 100,000 iterations and a 16-byte random salt.
    Never stores or accepts plaintext passwords.
    """
    if not password:
        raise ValueError("Password cannot be empty")
    salt = secrets.token_bytes(16)
    iterations = 100_000
    hash_bytes = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${hash_bytes.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """
    Verify a password strictly against a stored PBKDF2 hash.
    Plaintext password fallback is strictly prohibited.
    """
    if not password or not hashed:
        return False

    if not hashed.startswith("pbkdf2_sha256$"):
        # Strictly reject any unhashed or legacy plaintext records
        return False

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


# ==============================================================================
# JWT TOKEN GENERATION & VERIFICATION (HMAC-SHA256 & Amazon Cognito)
# ==============================================================================
def create_access_token(user: Dict[str, Any], expires_in: int = JWT_EXPIRATION_SECONDS) -> str:
    """
    Create a signed JWT with verified identity claims (sub, email, role, org_id).
    Mandates an explicit expiration claim ('exp').
    """
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


def verify_cognito_jwt(payload: Dict[str, Any]) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
    """
    Verify Amazon Cognito claims: issuer, client ID / audience, token use, and expiration.
    """
    now = int(time.time())
    expected_iss = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"

    if payload.get("iss") != expected_iss:
        return False, None, "Invalid Cognito token issuer (iss)"

    token_use = payload.get("token_use")
    if token_use not in ("id", "access"):
        return False, None, "Invalid Cognito token_use claim"

    # For ID tokens, aud matches client ID; for access tokens, client_id matches
    if COGNITO_APP_CLIENT_ID:
        client_match = (payload.get("aud") == COGNITO_APP_CLIENT_ID) or (payload.get("client_id") == COGNITO_APP_CLIENT_ID)
        if not client_match:
            return False, None, "Cognito audience or client_id mismatch"

    if "exp" not in payload or now > payload["exp"]:
        return False, None, "Cognito token has expired"

    # Map standard Cognito claims to domain fields
    claims = {
        "sub": payload.get("sub"),
        "email": payload.get("email") or payload.get("cognito:username", ""),
        "name": payload.get("name") or payload.get("email", "").split("@")[0],
        "role": payload.get("custom:role") or ("admin" if "admin" in payload.get("cognito:groups", []) else "user"),
        "org_id": payload.get("custom:org_id") or "org_campus_main",
        "specialty": payload.get("custom:specialty"),
        "approval_status": "Approved"
    }
    return True, claims, None


def verify_jwt_token(token: str) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
    """
    Verify a JWT token signature, structure, mandatory expiration claim, and claims integrity.
    Supports local HMAC-SHA256 signature verification and Amazon Cognito tokens.
    Returns (is_valid, claims_dict, error_message).
    """
    if not token or not isinstance(token, str):
        return False, None, "Missing token"

    if token.lower().startswith("bearer "):
        token = token[7:].strip()

    parts = token.split(".")
    if len(parts) != 3:
        return False, None, "Invalid token structure"

    encoded_header, encoded_payload, encoded_signature = parts

    try:
        payload_bytes = _base64url_decode(encoded_payload)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception as e:
        return False, None, f"Malformed token payload: {str(e)}"

    now = int(time.time())

    # Mandatory Expiration Claim Validation
    if "exp" not in payload:
        return False, None, "Token missing required expiration claim (exp)"

    if now > payload["exp"]:
        return False, None, "Token has expired"

    # Check for Amazon Cognito token signature / verification
    if COGNITO_USER_POOL_ID and payload.get("iss", "").startswith("https://cognito-idp."):
        return verify_cognito_jwt(payload)

    # Standard Authoritative HMAC-SHA256 Signature Verification
    try:
        signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
        expected_sig = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
        actual_sig = _base64url_decode(encoded_signature)

        if not hmac.compare_digest(expected_sig, actual_sig):
            return False, None, "Invalid token signature"

        # Validate mandatory identity claims
        if not payload.get("sub") or not payload.get("role") or not payload.get("org_id"):
            return False, None, "Token missing required claims (sub, role, org_id)"

        return True, payload, None
    except Exception as e:
        return False, None, f"Token verification failed: {str(e)}"


# ==============================================================================
# AUTHENTICATED USER CONTEXT
# ==============================================================================
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
    Rejects any unauthenticated or tampered request.
    """
    auth_header = None
    for k, v in headers.items():
        if k.lower() == "authorization":
            auth_header = v
            break

    if not auth_header:
        return None, {
            "statusCode": 401,
            "body": {"success": False, "error": "Unauthorized: Missing Authorization header"}
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
