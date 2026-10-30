"""
Unit and Integration Test Suite for Phase 4: Production Readiness Fixes
Covers:
1. Mocked AWS Boto3 S3 presigned URL generation (PUT & GET).
2. Upload MIME type, file size validation, and private bucket enforcement.
3. Strict tenant isolation on S3 keys (uploads/{org_id}/...).
4. Production configuration validation:
   - Requiring DATA_BACKEND=dynamodb in production.
   - Rejecting local file storage in production.
   - Rejecting wildcard ('*') and unsafe HTTP CORS origins.
   - Enforcing strong JWT secrets and table/bucket configurations.
5. DynamoDB schema and GSI1 index validation.
6. Sanitization of sensitive credentials and secrets.
"""
import unittest
from unittest.mock import MagicMock, patch
import json
import os
import sys
import time

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import (
    validate_production_config,
    MAX_UPLOAD_SIZE_BYTES,
    ALLOWED_MIME_TYPES,
    S3_BUCKET_NAME,
    S3_REGION
)
from app.s3 import (
    generate_presigned_upload_url,
    generate_presigned_view_url,
    validate_upload_request,
    validate_s3_key_tenant,
    set_s3_client
)
from app.models import sanitize_user
from app.storage import DynamoDBRepository, BaseRepository
from app.auth import create_access_token
from app.api import handle_api_request


class TestPhase4S3PresignedUploads(unittest.TestCase):
    """Test suite for S3 presigned uploads and tenant boundary enforcement."""

    def setUp(self):
        self.mock_s3 = MagicMock()
        set_s3_client(self.mock_s3)

    def tearDown(self):
        set_s3_client(None)

    def test_mocked_boto3_presigned_upload_url_generation(self):
        """Verifies generate_presigned_upload_url invokes boto3 generate_presigned_url with correct put_object params."""
        expected_url = "https://s3.amazonaws.com/test-bucket/uploads/org_alpha/123_abc.jpg?signature=mock"
        self.mock_s3.generate_presigned_url.return_value = expected_url

        res = generate_presigned_upload_url(
            org_id="org_alpha",
            file_name="broken_pipe.jpg",
            mime_type="image/jpeg",
            file_size=1024 * 500,  # 500 KB
            expires_in=900
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["uploadUrl"], expected_url)
        self.assertTrue(res["fileKey"].startswith("uploads/org_alpha/"))
        self.assertTrue(res["fileKey"].endswith(".jpg"))
        self.assertEqual(res["bucket"], S3_BUCKET_NAME)
        self.assertEqual(res["expiresIn"], 900)

        # Assert boto3 client was called with exact security parameters
        self.mock_s3.generate_presigned_url.assert_called_once()
        args, kwargs = self.mock_s3.generate_presigned_url.call_args
        self.assertEqual(kwargs.get("ClientMethod"), "put_object")
        params = kwargs.get("Params", {})
        self.assertEqual(params.get("Bucket"), S3_BUCKET_NAME)
        self.assertEqual(params.get("ContentType"), "image/jpeg")
        self.assertEqual(params.get("Key"), res["fileKey"])
        self.assertEqual(kwargs.get("ExpiresIn"), 900)

    def test_presigned_upload_rejects_disallowed_mime_types(self):
        """Rejects executable, script, or non-image MIME types."""
        disallowed = ["application/x-sh", "text/html", "application/pdf", "image/gif"]
        for bad_mime in disallowed:
            with self.assertRaises(ValueError) as ctx:
                validate_upload_request(mime_type=bad_mime, file_size=1000)
            self.assertIn("Invalid MIME type", str(ctx.exception))

    def test_presigned_upload_rejects_oversized_files(self):
        """Rejects uploads exceeding MAX_UPLOAD_SIZE_BYTES (5MB)."""
        oversized = MAX_UPLOAD_SIZE_BYTES + 1
        with self.assertRaises(ValueError) as ctx:
            validate_upload_request(mime_type="image/png", file_size=oversized)
        self.assertIn("exceeds maximum allowed size", str(ctx.exception))

    def test_presigned_upload_rejects_zero_or_negative_size(self):
        """Rejects zero-byte or negative payload sizes."""
        for invalid_size in [0, -50]:
            with self.assertRaises(ValueError) as ctx:
                validate_upload_request(mime_type="image/jpeg", file_size=invalid_size)
            self.assertIn("greater than 0 bytes", str(ctx.exception))

    def test_tenant_scoping_in_s3_keys(self):
        """Ensures file keys are scoped strictly under uploads/{org_id}/..."""
        self.assertTrue(validate_s3_key_tenant("uploads/org_101/ticket_photo.jpg", "org_101"))
        self.assertFalse(validate_s3_key_tenant("uploads/org_999/ticket_photo.jpg", "org_101"))
        self.assertFalse(validate_s3_key_tenant("public/ticket_photo.jpg", "org_101"))
        self.assertFalse(validate_s3_key_tenant("", "org_101"))

    def test_presigned_view_url_enforces_tenant_boundary(self):
        """Prevents cross-tenant retrieval of private S3 objects."""
        # Attempting to generate a view URL for another tenant's attachment must fail
        with self.assertRaises(ValueError) as ctx:
            generate_presigned_view_url(
                file_key="uploads/org_attacker/stolen_blueprint.jpg",
                org_id="org_victim"
            )
        self.assertIn("Cross-tenant access violation", str(ctx.exception))

        # Legitimate access succeeds
        self.mock_s3.generate_presigned_url.return_value = "https://s3.amazonaws.com/test-bucket/valid_view"
        url = generate_presigned_view_url(
            file_key="uploads/org_victim/legit_photo.jpg",
            org_id="org_victim"
        )
        self.assertEqual(url, "https://s3.amazonaws.com/test-bucket/valid_view")


class TestPhase4ProductionStorageEnforcement(unittest.TestCase):
    """Test suite for production storage invariants and configuration validation."""

    def test_production_fails_startup_when_backend_is_file(self):
        """Rejects application startup if ENVIRONMENT=production and DATA_BACKEND=file."""
        with self.assertRaises(ValueError) as ctx:
            validate_production_config(
                env="production",
                backend="file",
                table_name="SmartFix_Prod",
                bucket_name="smartfix-prod",
                origins=["https://maintenance.campus.edu"],
                jwt_sec="cryptographically-strong-production-secret-token-key-2026"
            )
        self.assertIn("Production deployments strictly require DATA_BACKEND='dynamodb'", str(ctx.exception))

    def test_production_fails_when_cors_contains_wildcard(self):
        """Rejects wildcard '*' CORS in production."""
        with self.assertRaises(ValueError) as ctx:
            validate_production_config(
                env="production",
                backend="dynamodb",
                table_name="SmartFix_Prod",
                bucket_name="smartfix-prod",
                origins=["*"],
                jwt_sec="cryptographically-strong-production-secret-token-key-2026"
            )
        self.assertIn("CORS wildcard '*' is strictly prohibited", str(ctx.exception))

    def test_production_fails_when_cors_contains_insecure_http_or_localhost(self):
        """Rejects insecure HTTP and localhost CORS origins in production."""
        with self.assertRaises(ValueError) as ctx:
            validate_production_config(
                env="production",
                backend="dynamodb",
                table_name="SmartFix_Prod",
                bucket_name="smartfix-prod",
                origins=["http://localhost:5173", "http://external-site.com"],
                jwt_sec="cryptographically-strong-production-secret-token-key-2026"
            )
        err = str(ctx.exception)
        self.assertTrue("prohibited in production" in err)

    def test_production_fails_when_jwt_secret_is_weak_or_default(self):
        """Rejects short or default development JWT secrets in production."""
        for weak in ["dev-local-secret", "short", "super-secure-untrusted"]:
            with self.assertRaises(ValueError) as ctx:
                validate_production_config(
                    env="production",
                    backend="dynamodb",
                    table_name="SmartFix_Prod",
                    bucket_name="smartfix-prod",
                    origins=["https://app.smartfix.edu"],
                    jwt_sec=weak
                )
            self.assertIn("JWT_SECRET must be a cryptographically random secret", str(ctx.exception))

    def test_production_passes_when_all_configurations_are_secure(self):
        """Passes validation when all required production security settings are satisfied."""
        valid = validate_production_config(
            env="production",
            backend="dynamodb",
            table_name="SmartFix_Production_Table",
            bucket_name="smartfix-production-attachments",
            origins=["https://smartfix.campus.edu", "https://admin.smartfix.campus.edu"],
            jwt_sec="a-very-long-and-secure-random-token-secret-string-2026-production"
        )
        self.assertTrue(valid)

    @patch("boto3.client")
    def test_dynamodb_table_and_gsi_validation(self, mock_boto):
        """Verifies DynamoDB table status ACTIVE and GSI1 index requirements."""
        mock_client = MagicMock()
        mock_boto.return_value = mock_client

        repo = DynamoDBRepository(table_name="SmartFix_Test")

        # Case 1: Table not ACTIVE
        mock_client.describe_table.return_value = {
            "Table": {
                "TableStatus": "CREATING",
                "KeySchema": [
                    {"AttributeName": "PK", "KeyType": "HASH"},
                    {"AttributeName": "SK", "KeyType": "RANGE"}
                ],
                "GlobalSecondaryIndexes": [{"IndexName": "GSI1"}]
            }
        }
        with self.assertRaises(RuntimeError) as ctx:
            repo.validate_table()
        self.assertIn("expected 'ACTIVE'", str(ctx.exception))

        # Case 2: Missing GSI1 index
        mock_client.describe_table.return_value = {
            "Table": {
                "TableStatus": "ACTIVE",
                "KeySchema": [
                    {"AttributeName": "PK", "KeyType": "HASH"},
                    {"AttributeName": "SK", "KeyType": "RANGE"}
                ],
                "GlobalSecondaryIndexes": [{"IndexName": "OtherIndex"}]
            }
        }
        with self.assertRaises(RuntimeError) as ctx:
            repo.validate_table()
        self.assertIn("missing required secondary index 'GSI1'", str(ctx.exception))

        # Case 3: Fully compliant ACTIVE table with GSI1
        mock_client.describe_table.return_value = {
            "Table": {
                "TableStatus": "ACTIVE",
                "KeySchema": [
                    {"AttributeName": "PK", "KeyType": "HASH"},
                    {"AttributeName": "SK", "KeyType": "RANGE"}
                ],
                "GlobalSecondaryIndexes": [{
                    "IndexName": "GSI1",
                    "KeySchema": [
                        {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                        {"AttributeName": "GSI1SK", "KeyType": "RANGE"}
                    ]
                }]
            }
        }
        res = repo.validate_table()
        self.assertTrue(res["valid"])
        self.assertEqual(res["status"], "ACTIVE")
        self.assertIn("GSI1", res["indexes"])


class TestPhase4SecretsSanitizationAndApiFlow(unittest.TestCase):
    """Test suite ensuring credentials/secrets are never returned in responses."""

    def test_sanitize_user_purges_all_secrets(self):
        """Ensures passwordHash, salt, secrets, and AWS keys are stripped."""
        user_raw = {
            "id": "usr_99",
            "name": "Safety Inspector",
            "email": "inspector@campus.edu",
            "role": "admin",
            "password": "plaintext_should_never_exist",
            "passwordHash": "pbkdf2_sha256$100000$hash",
            "password_hash": "pbkdf2_sha256$hash",
            "salt": "random_salt_123",
            "secret": "top_secret_token",
            "aws_secret_access_key": "AKIASECRET123",
            "org_id": "org_campus_main"
        }
        clean = sanitize_user(user_raw)
        self.assertEqual(clean["id"], "usr_99")
        self.assertEqual(clean["email"], "inspector@campus.edu")
        self.assertNotIn("password", clean)
        self.assertNotIn("passwordHash", clean)
        self.assertNotIn("password_hash", clean)
        self.assertNotIn("salt", clean)
        self.assertNotIn("secret", clean)
        self.assertNotIn("aws_secret_access_key", clean)

    def test_api_upload_presign_endpoint(self):
        """Tests POST /api/v1/uploads/presign generates URL and scopes key by authenticated tenant."""
        token = create_access_token({
            "id": "user_p4_1",
            "name": "Beta User",
            "email": "user_p4@campus.edu",
            "role": "user",
            "org_id": "org_tenant_beta",
            "approval_status": "Approved"
        })

        req_body = {
            "fileName": "hvac_leak.jpg",
            "mimeType": "image/jpeg",
            "fileSize": 1024 * 250
        }

        resp = handle_api_request(
            path="/api/v1/uploads/presign",
            method="POST",
            headers={"Authorization": f"Bearer {token}", "Origin": "http://localhost:5173"},
            body_data=req_body
        )

        status = resp["statusCode"]
        body = json.loads(resp["body"])

        self.assertEqual(status, 200)
        self.assertTrue(body["success"])
        self.assertIn("uploadUrl", body)
        self.assertTrue(body["fileKey"].startswith("uploads/org_tenant_beta/"))
        self.assertEqual(body["expiresIn"], 900)

    def test_api_ticket_creation_rejects_cross_tenant_file_key(self):
        """Rejects ticket creation if fileKey belongs to a different tenant organization."""
        token = create_access_token({
            "id": "user_p4_2",
            "name": "Beta User 2",
            "email": "user_p4_2@campus.edu",
            "role": "user",
            "org_id": "org_tenant_beta",
            "approval_status": "Approved"
        })

        # Alien tenant key
        alien_key = "uploads/org_tenant_alpha/123_leak.jpg"
        req_body = {
            "complaint": "Water leaking from ceiling",
            "fileKey": alien_key
        }

        resp = handle_api_request(
            path="/api/v1/tickets",
            method="POST",
            headers={"Authorization": f"Bearer {token}", "Origin": "http://localhost:5173"},
            body_data=req_body
        )

        status = resp["statusCode"]
        body = json.loads(resp["body"])

        self.assertEqual(status, 403)
        self.assertFalse(body["success"])
        self.assertIn("does not belong to tenant", body["error"])


if __name__ == "__main__":
    unittest.main()
