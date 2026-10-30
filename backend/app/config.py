"""
Configuration & Environment Settings for SmartFix AI
Centralizes security policies, database drivers, and cloud credentials.
"""
import os

# Environment mode: 'development', 'test', 'production'
ENVIRONMENT = os.environ.get("ENVIRONMENT", os.environ.get("NODE_ENV", "development")).lower()

# Security & JWT configuration
JWT_SECRET = os.environ.get("JWT_SECRET", "")
if ENVIRONMENT == "production":
    if not JWT_SECRET or "super-secure" in JWT_SECRET or "do-not-use" in JWT_SECRET:
        raise ValueError(
            "CRITICAL SECURITY CONFIGURATION ERROR: Production deployment requires a dedicated, "
            "cryptographically random JWT_SECRET environment variable."
        )
elif not JWT_SECRET:
    # Deterministic development secret for local running only
    JWT_SECRET = "dev-local-hmac-sha256-signing-secret-key-2026-untrusted"

JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION_SECONDS = int(os.environ.get("JWT_EXPIRATION_SECONDS", "86400"))  # 24 hours

# Optional Amazon Cognito Configuration
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
COGNITO_APP_CLIENT_ID = os.environ.get("COGNITO_APP_CLIENT_ID", "")
COGNITO_REGION = os.environ.get("COGNITO_REGION", "us-east-1")

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
DEFAULT_ORG_ID = os.environ.get("DEFAULT_ORG_ID", "org_campus_main")
DEFAULT_ORG_NAME = os.environ.get("DEFAULT_ORG_NAME", "Campus Facilities Operations")

# Storage Path (for local multi-tenant persistence)
DATA_DIR = os.environ.get("DATA_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
DB_FILE_PATH = os.path.join(DATA_DIR, "db.json")
