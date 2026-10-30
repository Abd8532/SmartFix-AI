"""
Configuration & Environment Settings for SmartFix AI
Centralizes security policies, database drivers, cloud credentials,
and tenant boundary rules.
"""
import os
from typing import List, Optional

# Automatically load environment variables from .env file if present
def _load_dotenv():
    cur = os.path.abspath(os.path.dirname(__file__))
    for _ in range(4):
        env_file = os.path.join(cur, ".env")
        if os.path.isfile(env_file):
            try:
                with open(env_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k, v = k.strip(), v.strip().strip('"').strip("'")
                            if k and k not in os.environ:
                                os.environ[k] = v
            except Exception:
                pass
            break
        cur = os.path.dirname(cur)

_load_dotenv()

# Environment mode: 'development', 'test', 'production'
ENVIRONMENT = os.environ.get("ENVIRONMENT", os.environ.get("NODE_ENV", "development")).lower()

# Security & JWT configuration
JWT_SECRET = os.environ.get("JWT_SECRET", "")
if ENVIRONMENT == "production":
    if not JWT_SECRET or "super-secure" in JWT_SECRET or "do-not-use" in JWT_SECRET or "untrusted" in JWT_SECRET or len(JWT_SECRET) < 32:
        raise ValueError(
            "CRITICAL SECURITY CONFIGURATION ERROR: Production deployment requires a dedicated, "
            "cryptographically random JWT_SECRET environment variable of at least 32 characters."
        )
elif not JWT_SECRET:
    # Deterministic development secret for local running only
    JWT_SECRET = "dev-local-hmac-sha256-signing-secret-key-2026-untrusted"

JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION_SECONDS = int(os.environ.get("JWT_EXPIRATION_SECONDS", "86400"))  # 24 hours

# Amazon Cognito Configuration
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
COGNITO_APP_CLIENT_ID = os.environ.get("COGNITO_APP_CLIENT_ID", "")
COGNITO_REGION = os.environ.get("COGNITO_REGION", "us-east-1")
COGNITO_JWKS_URL = os.environ.get(
    "COGNITO_JWKS_URL",
    f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    if COGNITO_USER_POOL_ID else ""
)

# Persistence Backend Selection: 'file' (default development) | 'dynamodb' (AWS production)
DATA_BACKEND = os.environ.get("DATA_BACKEND", "file").lower()
DYNAMODB_TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME", "SmartFix_MultiTenant")

# AI & Multimodal credentials (Server-side ONLY, never sent to frontend)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
MULTIMODAL_MODEL = os.environ.get("MULTIMODAL_MODEL", "gemini-2.5-flash")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "models/text-embedding-004")

# Pinecone Vector Store (Server-side RAG)
PINECONE_API_KEY = os.environ.get("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.environ.get("PINECONE_INDEX_NAME", "smartfix-maintenance-tickets")
PINECONE_CLOUD = os.environ.get("PINECONE_CLOUD", "aws")
PINECONE_REGION = os.environ.get("PINECONE_REGION", "us-east-1")

# Campus Geolocation Telemetry
CAMPUS_LAT = float(os.environ.get("CAMPUS_LAT", "28.6139"))
CAMPUS_LON = float(os.environ.get("CAMPUS_LON", "77.2090"))

# Tenant Settings
# In production, every user, ticket, and resource MUST belong to an explicit, verified organisation.
# Silent fallback to org_campus_main is strictly disabled in production.
DEV_DEFAULT_ORG_ID = "org_campus_main"
DEFAULT_ORG_ID = "" if ENVIRONMENT == "production" else os.environ.get("DEFAULT_ORG_ID", DEV_DEFAULT_ORG_ID)
DEFAULT_ORG_NAME = os.environ.get("DEFAULT_ORG_NAME", "Campus Facilities Operations")

# Technician Assignment & Workload Guardrails
MAX_TECHNICIAN_ACTIVE_WORKLOAD = int(os.environ.get("MAX_TECHNICIAN_ACTIVE_WORKLOAD", "5"))

# Storage & Upload Security
MAX_UPLOAD_SIZE_BYTES = int(os.environ.get("MAX_UPLOAD_SIZE_BYTES", "5242880"))  # 5 MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "smartfix-maintenance-attachments")
S3_REGION = os.environ.get("S3_REGION", "us-east-1")

# Allowed CORS Origins
_raw_origins = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,https://localhost:5173,https://127.0.0.1:5173"
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# Storage Path (for local multi-tenant persistence)
DATA_DIR = os.environ.get("DATA_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
DB_FILE_PATH = os.path.join(DATA_DIR, "db.json")


def validate_production_config(
    env: Optional[str] = None,
    backend: Optional[str] = None,
    table_name: Optional[str] = None,
    bucket_name: Optional[str] = None,
    origins: Optional[List[str]] = None,
    jwt_sec: Optional[str] = None
) -> bool:
    """
    Validates production readiness invariants:
    1. Rejects DATA_BACKEND != 'dynamodb' (fails startup if file storage is configured in production).
    2. Validates DynamoDB table name configuration.
    3. Validates S3 private bucket configuration.
    4. Enforces strong JWT secrets.
    5. Rejects wildcard ('*') and unsafe insecure/development CORS origins in production.
    """
    active_env = (env or ENVIRONMENT).lower()
    if active_env != "production":
        return True

    active_backend = (backend or DATA_BACKEND).lower()
    active_table = table_name or DYNAMODB_TABLE_NAME
    active_bucket = bucket_name or S3_BUCKET_NAME
    active_origins = origins if origins is not None else ALLOWED_ORIGINS
    active_secret = jwt_sec or JWT_SECRET

    errors = []

    # 1. Enforce DynamoDB storage in production
    if active_backend != "dynamodb":
        errors.append(
            f"DATA_BACKEND is configured as '{active_backend}'. "
            "Production deployments strictly require DATA_BACKEND='dynamodb'. Local file storage is forbidden."
        )

    if not active_table or not active_table.strip():
        errors.append("DYNAMODB_TABLE_NAME must be specified for production deployment.")

    # 2. Enforce S3 bucket configuration
    if not active_bucket or not active_bucket.strip():
        errors.append("S3_BUCKET_NAME must be specified for secure attachment storage.")

    # 3. Enforce strong JWT secret
    if not active_secret or len(active_secret) < 32 or any(k in active_secret for k in ["dev-local", "untrusted", "do-not-use", "super-secure"]):
        errors.append(
            "JWT_SECRET must be a cryptographically random secret of at least 32 characters in production."
        )

    # 4. Reject wildcard and unsafe CORS origins
    if not active_origins:
        errors.append("ALLOWED_ORIGINS cannot be empty in production.")
    for o in active_origins:
        if o == "*":
            errors.append("CORS wildcard '*' is strictly prohibited in production environments.")
        elif o.startswith("http://"):
            errors.append(f"Insecure HTTP origin '{o}' is prohibited in production; HTTPS is required.")
        elif "localhost" in o or "127.0.0.1" in o:
            errors.append(f"Local development origin '{o}' is prohibited in production configuration.")

    if errors:
        msg = "CRITICAL PRODUCTION CONFIGURATION ERRORS:\n" + "\n".join(f"  - {err}" for err in errors)
        raise ValueError(msg)

    return True


# Enforce validation on module load when running in production
if ENVIRONMENT == "production":
    validate_production_config()
