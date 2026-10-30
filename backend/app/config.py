"""
Configuration & Environment Settings for SmartFix AI
Centralizes security policies, database drivers, cloud credentials,
and tenant boundary rules.
"""
import os

# Environment mode: 'development', 'test', 'production'
ENVIRONMENT = os.environ.get("ENVIRONMENT", os.environ.get("NODE_ENV", "development")).lower()

# Security & JWT configuration
JWT_SECRET = os.environ.get("JWT_SECRET", "")
if ENVIRONMENT == "production":
    if not JWT_SECRET or "super-secure" in JWT_SECRET or "do-not-use" in JWT_SECRET or "untrusted" in JWT_SECRET:
        raise ValueError(
            "CRITICAL SECURITY CONFIGURATION ERROR: Production deployment requires a dedicated, "
            "cryptographically random JWT_SECRET environment variable."
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
MULTIMODAL_MODEL = os.environ.get("MULTIMODAL_MODEL", "gemini-1.5-flash")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "models/text-embedding-004")

# Pinecone Vector Store (Server-side RAG)
PINECONE_API_KEY = os.environ.get("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.environ.get("PINECONE_INDEX_NAME", "fixflow-maintenance-tickets")
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
