"""
Configuration & Environment Settings for FixFlow AI
"""
import os

# Security & JWT configuration
JWT_SECRET = os.environ.get("JWT_SECRET", "fixflow-ai-super-secure-production-hmac-key-2026")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION_SECONDS = int(os.environ.get("JWT_EXPIRATION_SECONDS", "86400"))  # 24 hours

# Optional Amazon Cognito Configuration
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
COGNITO_APP_CLIENT_ID = os.environ.get("COGNITO_APP_CLIENT_ID", "")
COGNITO_REGION = os.environ.get("COGNITO_REGION", "us-east-1")

# AI & Multimodal credentials (Server-side ONLY, never in client)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
MULTIMODAL_MODEL = os.environ.get("MULTIMODAL_MODEL", "gemini-1.5-flash")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "models/text-embedding-004")

# Pinecone Vector Store
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
