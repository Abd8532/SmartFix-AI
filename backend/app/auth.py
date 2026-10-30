"""
Authentication & Authorization Module for SmartFix AI
Handles PBKDF2-HMAC-SHA256 password hashing, rate limiting,
cryptographic JWT verification (including RS256 Amazon Cognito JWKS validation),
and verified identity claims derivation.
"""
import hmac
import hashlib
import base64
import json
import time
import secrets
import urllib.request
import urllib.error
from typing import Dict, Any, Optional, Tuple, List
from .config import (
    JWT_SECRET,
    JWT_EXPIRATION_SECONDS,
    COGNITO_USER_POOL_ID,
    COGNITO_APP_CLIENT_ID,
    COGNITO_REGION,
    COGNITO_JWKS_URL,
    ENVIRONMENT,
    DEV_DEFAULT_ORG_ID
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
# CRYPTOGRAPHIC RSA PKCS#1 v1.5 VERIFICATION (RS256)
# ==============================================================================
# ASN.1 DigestInfo prefix for SHA-256 (RFC 8017 / PKCS #1 v2.2)
SHA256_DIGEST_INFO_PREFIX = bytes.fromhex("3031300d060960864801650304020105000420")


def verify_rsa_pkcs1v15_signature(
    n_b64: str,
    e_b64: str,
    signing_input: bytes,
    signature_bytes: bytes
) -> bool:
    """
    Cryptographically verify RS256 (RSA PKCS#1 v1.5 with SHA-256) signature.
    RFC 8017 compliant EMSA-PKCS1-v1_5 verification.
    Works natively in standard Python without external dependencies.
    """
    try:
        n = int.from_bytes(_base64url_decode(n_b64), "big")
        e = int.from_bytes(_base64url_decode(e_b64), "big")
        k = (n.bit_length() + 7) // 8

        if len(signature_bytes) != k:
            return False

        s = int.from_bytes(signature_bytes, "big")
        if s >= n or s <= 0:
            return False

        # RSA verification operation: m = s^e mod n
        m = pow(s, e, n)
        em = m.to_bytes(k, "big")

        # Reconstruct expected EMSA-PKCS1-v1_5 encoding
        # EM = 0x00 || 0x01 || PS (0xFF bytes) || 0x00 || T (DigestInfo)
        h = hashlib.sha256(signing_input).digest()
        t = SHA256_DIGEST_INFO_PREFIX + h
        t_len = len(t)
        ps_len = k - 3 - t_len

        if ps_len < 8:
            return False

        expected_em = b"\x00\x01" + (b"\xff" * ps_len) + b"\x00" + t

        return hmac.compare_digest(em, expected_em)
    except Exception:
        return False


# ==============================================================================
# COGNITO JWKS KEY MANAGEMENT & CACHE
# ==============================================================================
_cognito_jwks_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
COGNITO_JWKS_CACHE_TTL = 3600  # 1 hour


def set_cognito_jwks_cache(user_pool_id: str, keys: List[Dict[str, Any]]):
    """Inject or override JWKS keys in memory (used by tests and key provisioning)."""
    _cognito_jwks_cache[user_pool_id] = (time.time(), keys)


def clear_cognito_jwks_cache():
    """Clear cached JWKS signing keys."""
    _cognito_jwks_cache.clear()


def fetch_cognito_jwks(user_pool_id: str, region: str = COGNITO_REGION) -> List[Dict[str, Any]]:
    """
    Retrieve signing keys from the Cognito JWKS endpoint with safe memory caching.
    """
    now = time.time()
    cached = _cognito_jwks_cache.get(user_pool_id)
    if cached:
        cached_at, keys = cached
        if now - cached_at < COGNITO_JWKS_CACHE_TTL:
            return keys

    url = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SmartFix-Cognito-Verifier/2.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
            keys = data.get("keys", [])
            _cognito_jwks_cache[user_pool_id] = (now, keys)
            return keys
    except Exception as e:
        # If cache exists even if expired, use as fallback
        if cached:
            return cached[1]
        return []


def verify_cognito_jwt(
    encoded_header: str,
    encoded_payload: str,
    encoded_signature: str,
    header: Dict[str, Any]
) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
    """
    Full cryptographic RS256 signature verification and claims validation for Amazon Cognito.
    Guarantees:
    - Never trusts decoded claims until RSA signature verification succeeds.
    - Validates matching signing key in Cognito JWKS by 'kid'.
    - Validates token algorithm is strictly 'RS256'.
    - Validates issuer ('iss') matches user pool.
    - Validates audience or client_id according to token_use.
    - Validates token expiration ('exp').
    - Strictly rejects missing organisation ID claim ('custom:org_id').
    """
    kid = header.get("kid")
    if not kid:
        return False, None, "Cognito token header missing key ID ('kid')"

    alg = header.get("alg")
    if alg != "RS256":
        return False, None, f"Cognito token must use RS256 algorithm (received '{alg}')"

    # Step 1: Locate public signing key from Cognito JWKS
    keys = fetch_cognito_jwks(COGNITO_USER_POOL_ID, COGNITO_REGION)
    matching_key = next((k for k in keys if k.get("kid") == kid and k.get("kty") == "RSA"), None)

    if not matching_key:
        return False, None, f"Signing key with kid '{kid}' not found in Cognito JWKS"

    # Step 2: Cryptographically verify signature BEFORE decoding or trusting claims
    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    try:
        signature_bytes = _base64url_decode(encoded_signature)
    except Exception:
        return False, None, "Malformed base64url signature in Cognito token"

    is_sig_valid = verify_rsa_pkcs1v15_signature(
        n_b64=matching_key["n"],
        e_b64=matching_key["e"],
        signing_input=signing_input,
        signature_bytes=signature_bytes
    )

    if not is_sig_valid:
        return False, None, "Invalid Cognito token signature (cryptographic RS256 check failed)"

    # Step 3: Signature is verified! Safely parse payload
    try:
        payload_bytes = _base64url_decode(encoded_payload)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception as e:
        return False, None, f"Malformed token payload: {str(e)}"

    now = int(time.time())

    # Validate Issuer
    expected_iss = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
    if payload.get("iss") != expected_iss:
        return False, None, f"Invalid Cognito token issuer (expected '{expected_iss}', got '{payload.get('iss')}')"

    # Validate Expiration
    if "exp" not in payload:
        return False, None, "Cognito token missing required expiration claim ('exp')"

    if now > payload["exp"]:
        return False, None, "Cognito token has expired"

    # Validate Token Use
    token_use = payload.get("token_use")
    if token_use not in ("id", "access"):
        return False, None, f"Invalid Cognito token_use claim ('{token_use}')"

    # Validate Audience / Client ID
    if COGNITO_APP_CLIENT_ID:
        if token_use == "id":
            if payload.get("aud") != COGNITO_APP_CLIENT_ID:
                return False, None, f"Cognito audience mismatch (expected '{COGNITO_APP_CLIENT_ID}', got '{payload.get('aud')}')"
        elif token_use == "access":
            if payload.get("client_id") != COGNITO_APP_CLIENT_ID:
                return False, None, f"Cognito client_id mismatch (expected '{COGNITO_APP_CLIENT_ID}', got '{payload.get('client_id')}')"

    # Validate Organisation Membership (Requirement 2: Reject missing organisation IDs)
    org_id = payload.get("custom:org_id") or payload.get("org_id")
    if not org_id or not str(org_id).strip():
        return False, None, "Token missing required organisation membership claim ('custom:org_id')"

    clean_org_id = str(org_id).strip()

    # Map verified Cognito claims to domain identity
    claims = {
        "sub": payload.get("sub"),
        "email": payload.get("email") or payload.get("cognito:username", ""),
        "name": payload.get("name") or payload.get("email", "").split("@")[0],
        "role": payload.get("custom:role") or ("admin" if "admin" in payload.get("cognito:groups", []) else "user"),
        "org_id": clean_org_id,
        "specialty": payload.get("custom:specialty"),
        "approval_status": "Approved"
    }

    return True, claims, None


# ==============================================================================
# AUTHORITATIVE JWT TOKEN GENERATION & VERIFICATION
# ==============================================================================
def create_access_token(user: Dict[str, Any], expires_in: int = JWT_EXPIRATION_SECONDS) -> str:
    """
    Create a signed JWT with verified identity claims (sub, email, role, org_id).
    Mandates an explicit expiration claim ('exp') and organization boundary.
    """
    now = int(time.time())
    org_id = user.get("org_id") or user.get("orgId")

    if not org_id:
        if ENVIRONMENT == "production":
            raise ValueError("CRITICAL: Cannot issue JWT for user without a verified organization ID (org_id required in production).")
        org_id = DEV_DEFAULT_ORG_ID

    header = {
        "alg": "HS256",
        "typ": "JWT"
    }
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "name": user.get("name", "User"),
        "role": user.get("role", "user"),
        "org_id": org_id,
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
    Verify a JWT token signature, structure, mandatory expiration claim, and claims integrity.
    Supports local HMAC-SHA256 signature verification and Amazon Cognito RS256 JWKS tokens.
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
        header_bytes = _base64url_decode(encoded_header)
        header = json.loads(header_bytes.decode("utf-8"))
    except Exception as e:
        return False, None, f"Malformed token header: {str(e)}"

    alg = header.get("alg")

    # Route 1: Amazon Cognito RS256 Signature Verification
    if alg == "RS256" or (COGNITO_USER_POOL_ID and header.get("kid")):
        return verify_cognito_jwt(encoded_header, encoded_payload, encoded_signature, header)

    # Route 2: Standard Authoritative HMAC-SHA256 Signature Verification
    if alg != "HS256":
        return False, None, f"Unsupported token algorithm '{alg}'"

    try:
        signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
        expected_sig = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
        actual_sig = _base64url_decode(encoded_signature)

        if not hmac.compare_digest(expected_sig, actual_sig):
            return False, None, "Invalid token signature"

        # Safely parse payload only after HMAC verification
        payload_bytes = _base64url_decode(encoded_payload)
        payload = json.loads(payload_bytes.decode("utf-8"))

        now = int(time.time())

        # Mandatory Expiration Claim Validation
        if "exp" not in payload:
            return False, None, "Token missing required expiration claim (exp)"

        if now > payload["exp"]:
            return False, None, "Token has expired"

        # Validate mandatory identity claims
        if not payload.get("sub") or not payload.get("role"):
            return False, None, "Token missing required identity claims (sub, role)"

        # Validate organization boundary
        org_id = payload.get("org_id")
        if not org_id:
            return False, None, "Token missing verified organisation ID claim (org_id)"

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
        self.org_id = claims.get("org_id")

        # Requirement 2: Reject missing organisation membership
        if not self.org_id:
            raise ValueError("Identity verification failed: missing verified organisation ID claim (org_id)")

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

    try:
        user = AuthenticatedUser(claims)
    except ValueError as e:
        return None, {
            "statusCode": 403,
            "body": {"success": False, "error": str(e)}
        }

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
