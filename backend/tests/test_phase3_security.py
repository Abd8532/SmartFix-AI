"""
Phase 3 Security, Concurrency & Cognito Verification Test Suite for SmartFix AI
Validates:
- Cryptographic RS256 signature verification for Amazon Cognito JWKS tokens.
- Forged Cognito JWT rejection.
- Wrong issuer and audience rejection.
- Expired Cognito token rejection.
- Missing organisation membership rejection.
- Two simultaneous technician claims (optimistic concurrency & conflict handling).
- Two simultaneous confirmation requests (version locking).
- Version conflict returns HTTP 409.
- Consumer cannot view another tenant's ticket.
- Technician cannot claim an incompatible specialty ticket.
- Server-side image magic bytes and MIME validation.
"""
import unittest
import json
import os
import sys
import tempfile
import shutil
import time
import base64
import hashlib

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import app.api
import app.audit
import app.auth
from app.auth import (
    hash_password,
    create_access_token,
    verify_jwt_token,
    set_cognito_jwks_cache,
    clear_cognito_jwks_cache,
    _base64url_encode
)
from app.models import TicketStatus, TicketPriority
from app.storage import JsonFileRepository, ConcurrencyError
from app.api import handle_api_request, validate_image_payload
from app.config import (
    COGNITO_USER_POOL_ID,
    COGNITO_APP_CLIENT_ID,
    COGNITO_REGION
)

# Deterministic 1024-bit RSA Test Keypair Fixture
RSA_N_INT = 138521564526339724193377011322784494468209851995028557771555409293903848852072180639532005479235130877835388992930899619985290506579615619535721437997766210482475642063254492378782721116574374136793677502057297914387018040386936372066709864886140362141675848604831270038289432960569353566688266952428225050841
RSA_D_INT = 137800813599329304950049706733604801888237324117183909127276598933813804869916198315072838689964654969122114542672428271427758363473528234909301537630687463873426842528494156768962134593228440533316344880584710942865697826346239632696843306273748756877898867238471599924360132462032700027798937982645526983409
RSA_E_INT = 65537
RSA_KID = "cognito-test-key-2026"

RSA_N_B64 = _base64url_encode(RSA_N_INT.to_bytes((RSA_N_INT.bit_length() + 7) // 8, "big"))
RSA_E_B64 = _base64url_encode(RSA_E_INT.to_bytes((RSA_E_INT.bit_length() + 7) // 8, "big"))


def rsa_sign_rs256(signing_input: bytes) -> bytes:
    """Sign arbitrary bytes with RSA PKCS#1 v1.5 SHA-256 for test fixtures."""
    k = (RSA_N_INT.bit_length() + 7) // 8
    h = hashlib.sha256(signing_input).digest()
    prefix = bytes.fromhex("3031300d060960864801650304020105000420")
    t = prefix + h
    ps_len = k - 3 - len(t)
    em = b"\x00\x01" + (b"\xff" * ps_len) + b"\x00" + t
    m = int.from_bytes(em, "big")
    s = pow(m, RSA_D_INT, RSA_N_INT)
    return s.to_bytes(k, "big")


def make_cognito_jwt(payload_overrides: dict = None, kid: str = RSA_KID) -> str:
    """Generate an RS256 token signed with test RSA private key."""
    header = {"alg": "RS256", "kid": kid, "typ": "JWT"}
    payload = {
        "sub": "cognito_sub_999",
        "email": "faculty@campus.edu",
        "name": "Prof. Smith",
        "custom:role": "user",
        "custom:org_id": "org_campus_a",
        "token_use": "id",
        "iss": f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID or 'us-east-1_TestPool123'}",
        "aud": COGNITO_APP_CLIENT_ID or "test_cognito_client_id_456",
        "exp": int(time.time()) + 3600
    }
    if payload_overrides:
        payload.update(payload_overrides)

    enc_h = _base64url_encode(json.dumps(header).encode("utf-8"))
    enc_p = _base64url_encode(json.dumps(payload).encode("utf-8"))
    signing_input = f"{enc_h}.{enc_p}".encode("utf-8")
    sig = rsa_sign_rs256(signing_input)
    enc_s = _base64url_encode(sig)
    return f"{enc_h}.{enc_p}.{enc_s}"


class TestPhase3SecurityAndConcurrency(unittest.TestCase):

    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.test_dir, "test_p3_db.json")
        self.storage = JsonFileRepository(db_path=self.db_path)

        self.orig_api_storage = app.api.storage
        self.orig_audit_storage = app.audit.storage
        app.api.storage = self.storage
        app.audit.storage = self.storage

        self.org_a = "org_campus_a"
        self.org_b = "org_campus_b"

        # Register Cognito test JWKS public key in cache
        self.test_pool_id = COGNITO_USER_POOL_ID or "us-east-1_TestPool123"
        self.test_client_id = COGNITO_APP_CLIENT_ID or "test_cognito_client_id_456"
        set_cognito_jwks_cache(self.test_pool_id, [
            {
                "kty": "RSA",
                "kid": RSA_KID,
                "use": "sig",
                "alg": "RS256",
                "n": RSA_N_B64,
                "e": RSA_E_B64
            }
        ])

        # Configure app auth environment for test pool
        self.orig_pool_id = app.auth.COGNITO_USER_POOL_ID
        self.orig_client_id = app.auth.COGNITO_APP_CLIENT_ID
        app.auth.COGNITO_USER_POOL_ID = self.test_pool_id
        app.auth.COGNITO_APP_CLIENT_ID = self.test_client_id

        # Seed Plumbing Technician
        self.tech_plumb = self.storage.save_user({
            "id": "tech_plumber",
            "org_id": self.org_a,
            "email": "mario@campus.edu",
            "name": "Mario Plumbing",
            "role": "technician",
            "specialty": "Plumbing",
            "approvalStatus": "Approved"
        })
        self.token_plumb = create_access_token(self.tech_plumb)

        # Seed Electrical Technician
        self.tech_elec = self.storage.save_user({
            "id": "tech_sparky",
            "org_id": self.org_a,
            "email": "sparky@campus.edu",
            "name": "Steve Sparky",
            "role": "technician",
            "specialty": "Electrical",
            "approvalStatus": "Approved"
        })
        self.token_elec = create_access_token(self.tech_elec)

        # Seed General Technician
        self.tech_general = self.storage.save_user({
            "id": "tech_general_1",
            "org_id": self.org_a,
            "email": "general@campus.edu",
            "name": "General Tech",
            "role": "technician",
            "specialty": "General",
            "approvalStatus": "Approved"
        })
        self.token_general = create_access_token(self.tech_general)

        # Seed Consumers
        self.consumer_a = self.storage.save_user({
            "id": "usr_alice",
            "org_id": self.org_a,
            "email": "alice@campus.edu",
            "name": "Alice Reporter",
            "role": "user",
            "approvalStatus": "Approved"
        })
        self.token_consumer_a = create_access_token(self.consumer_a)

        self.consumer_b = self.storage.save_user({
            "id": "usr_bob",
            "org_id": self.org_b,
            "email": "bob@campusb.edu",
            "name": "Bob Tenant B",
            "role": "user",
            "approvalStatus": "Approved"
        })
        self.token_consumer_b = create_access_token(self.consumer_b)

    def tearDown(self):
        app.auth.COGNITO_USER_POOL_ID = self.orig_pool_id
        app.auth.COGNITO_APP_CLIENT_ID = self.orig_client_id
        clear_cognito_jwks_cache()
        app.api.storage = self.orig_api_storage
        app.audit.storage = self.orig_audit_storage
        shutil.rmtree(self.test_dir, ignore_errors=True)

    # ==========================================================================
    # 1. TEST: Valid Cognito JWT Signature
    # ==========================================================================
    def test_cognito_jwt_valid_signature(self):
        token = make_cognito_jwt()
        is_valid, claims, err = verify_jwt_token(token)
        self.assertTrue(is_valid, f"Verification failed with: {err}")
        self.assertIsNotNone(claims)
        self.assertEqual(claims["sub"], "cognito_sub_999")
        self.assertEqual(claims["org_id"], "org_campus_a")

    # ==========================================================================
    # 2. TEST: Forged Cognito JWT
    # ==========================================================================
    def test_cognito_jwt_forged_signature(self):
        token = make_cognito_jwt()
        parts = token.split(".")
        # Tamper with payload while keeping signature
        tampered_payload = {"sub": "attacker", "custom:org_id": "org_campus_a", "exp": int(time.time()) + 3600}
        bad_token = f"{parts[0]}.{_base64url_encode(json.dumps(tampered_payload).encode())}.{parts[2]}"

        is_valid, claims, err = verify_jwt_token(bad_token)
        self.assertFalse(is_valid)
        self.assertIsNone(claims)
        self.assertIn("cryptographic RS256 check failed", err)

    # ==========================================================================
    # 3. TEST: Wrong Issuer and Audience
    # ==========================================================================
    def test_cognito_jwt_wrong_issuer(self):
        bad_token = make_cognito_jwt({"iss": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_EvilPool"})
        is_valid, claims, err = verify_jwt_token(bad_token)
        self.assertFalse(is_valid)
        self.assertIn("Invalid Cognito token issuer", err)

    def test_cognito_jwt_wrong_audience(self):
        bad_token = make_cognito_jwt({"aud": "wrong_client_id_attacker"})
        is_valid, claims, err = verify_jwt_token(bad_token)
        self.assertFalse(is_valid)
        self.assertIn("audience mismatch", err)

    # ==========================================================================
    # 4. TEST: Expired Cognito Token
    # ==========================================================================
    def test_cognito_jwt_expired(self):
        bad_token = make_cognito_jwt({"exp": int(time.time()) - 3600})
        is_valid, claims, err = verify_jwt_token(bad_token)
        self.assertFalse(is_valid)
        self.assertIn("Cognito token has expired", err)

    # ==========================================================================
    # 5. TEST: Missing Organisation Membership
    # ==========================================================================
    def test_missing_organisation_membership(self):
        bad_token = make_cognito_jwt({"custom:org_id": ""})
        is_valid, claims, err = verify_jwt_token(bad_token)
        self.assertFalse(is_valid)
        self.assertIn("missing required organisation membership claim", err.lower())

    # ==========================================================================
    # 6. TEST: Two Simultaneous Technician Claims (Optimistic Concurrency)
    # ==========================================================================
    def test_two_simultaneous_technician_claims(self):
        # Unassigned plumbing ticket at version 1
        ticket = self.storage.save_ticket({
            "id": "TCK-P3-CLAIM-01",
            "org_id": self.org_a,
            "title": "Burst pipe under sink",
            "description": "Flooding kitchen",
            "category": "Plumbing",
            "priority": "Emergency",
            "status": TicketStatus.ASSIGNED,
            "assignedTechId": None,
            "reporterId": self.consumer_a["id"]
        }, org_id=self.org_a)
        self.assertEqual(ticket["version"], 1)

        # Tech 1 claims ticket
        res1 = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}/claim",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_plumb}"},
            body_data={"version": 1}
        )
        self.assertEqual(res1["statusCode"], 200)
        body1 = json.loads(res1["body"])
        self.assertTrue(body1["success"])
        self.assertEqual(body1["ticket"]["assignedTechId"], self.tech_plumb["id"])
        self.assertEqual(body1["ticket"]["version"], 2)

        # Tech 2 (attempting to claim simultaneously with stale version 1 or after claim)
        res2 = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}/claim",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_plumb}"},
            body_data={"version": 1}  # Stale version
        )
        # Must return HTTP 409 Conflict
        self.assertEqual(res2["statusCode"], 409)
        body2 = json.loads(res2["body"])
        self.assertFalse(body2["success"])
        self.assertTrue(body2.get("conflict"))

    # ==========================================================================
    # 7. TEST: Two Simultaneous Confirmation Requests (Dual Approval Race)
    # ==========================================================================
    def test_two_simultaneous_confirmation_requests(self):
        ticket = self.storage.save_ticket({
            "id": "TCK-P3-RACE-01",
            "org_id": self.org_a,
            "title": "Loose fixture",
            "category": "Plumbing",
            "status": TicketStatus.IN_PROGRESS,
            "assignedTechId": self.tech_plumb["id"],
            "reporterId": self.consumer_a["id"],
            "techConfirmed": False,
            "userConfirmed": False
        }, org_id=self.org_a)
        curr_ver = ticket["version"]

        # Request A succeeds
        res_a = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}/tech-complete",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_plumb}"},
            body_data={"resolutionNotes": "Tightened coupling", "version": curr_ver}
        )
        self.assertEqual(res_a["statusCode"], 200)

        # Concurrent Request B sent with the older version snapshot
        res_b = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}/tech-complete",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_plumb}"},
            body_data={"resolutionNotes": "Different notes", "version": curr_ver}
        )
        self.assertEqual(res_b["statusCode"], 409)
        body_b = json.loads(res_b["body"])
        self.assertTrue(body_b.get("conflict"))

    # ==========================================================================
    # 8. TEST: Version Conflict Returns HTTP 409
    # ==========================================================================
    def test_version_conflict_returns_http_409(self):
        ticket = self.storage.save_ticket({
            "id": "TCK-P3-VER-01",
            "org_id": self.org_a,
            "title": "Plumbing valve test",
            "category": "Plumbing",
            "status": TicketStatus.ASSIGNED,
            "assignedTechId": self.tech_plumb["id"],
            "reporterId": self.consumer_a["id"]
        }, org_id=self.org_a)

        # Send PATCH status with outdated version 99
        res = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}/status",
            method="PATCH",
            headers={"Authorization": f"Bearer {self.token_plumb}"},
            body_data={"status": "In Progress", "version": 99}
        )
        self.assertEqual(res["statusCode"], 409)
        body = json.loads(res["body"])
        self.assertFalse(body["success"])
        self.assertIn("version", body["error"].lower())

    # ==========================================================================
    # 9. TEST: Consumer Cannot View Another Tenant's Ticket
    # ==========================================================================
    def test_consumer_cannot_view_another_tenant_ticket(self):
        ticket_b = self.storage.save_ticket({
            "id": "TCK-TENANT-B-CONFIDENTIAL",
            "org_id": self.org_b,
            "title": "Tenant B Internal Work Order",
            "status": TicketStatus.ASSIGNED,
            "reporterId": self.consumer_b["id"]
        }, org_id=self.org_b)

        res = handle_api_request(
            path=f"/api/v1/tickets/{ticket_b['id']}",
            method="GET",
            headers={"Authorization": f"Bearer {self.token_consumer_a}"},
            body_data={}
        )
        self.assertEqual(res["statusCode"], 404)

    # ==========================================================================
    # 10. TEST: Technician Cannot Claim Incompatible Specialty Ticket
    # ==========================================================================
    def test_technician_cannot_claim_incompatible_specialty(self):
        # Electrical Ticket
        elec_ticket = self.storage.save_ticket({
            "id": "TCK-P3-ELEC-99",
            "org_id": self.org_a,
            "title": "Sparking junction box",
            "category": "Electrical",
            "priority": "Emergency",
            "status": TicketStatus.ASSIGNED,
            "assignedTechId": None,
            "reporterId": self.consumer_a["id"]
        }, org_id=self.org_a)

        # 1. Plumbing Tech tries to claim Electrical ticket -> 403
        res_plumb = handle_api_request(
            path=f"/api/v1/tickets/{elec_ticket['id']}/claim",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_plumb}"},
            body_data={}
        )
        self.assertEqual(res_plumb["statusCode"], 403)
        body_plumb = json.loads(res_plumb["body"])
        self.assertIn("Skill restriction", body_plumb["error"])

        # 2. General Tech tries to claim Electrical ticket -> 403 (General cannot bypass skill restrictions)
        res_gen = handle_api_request(
            path=f"/api/v1/tickets/{elec_ticket['id']}/claim",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_general}"},
            body_data={}
        )
        self.assertEqual(res_gen["statusCode"], 403)
        body_gen = json.loads(res_gen["body"])
        self.assertIn("Skill restriction", body_gen["error"])

        # 3. Electrical Tech claims Electrical ticket -> 200 OK
        res_elec = handle_api_request(
            path=f"/api/v1/tickets/{elec_ticket['id']}/claim",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_elec}"},
            body_data={}
        )
        self.assertEqual(res_elec["statusCode"], 200)

    # ==========================================================================
    # 11. TEST: Server-side Image Magic Bytes & MIME Validation
    # ==========================================================================
    def test_image_magic_bytes_validation(self):
        # Valid JPEG magic bytes (\xFF\xD8\xFF)
        jpeg_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01" + (b"\x00" * 50)
        jpeg_b64 = base64.b64encode(jpeg_bytes).decode("utf-8")
        valid, mime, err = validate_image_payload(jpeg_b64)
        self.assertTrue(valid)
        self.assertEqual(mime, "image/jpeg")

        # Corrupted / Fake Image (Plaintext disguised as base64)
        fake_b64 = base64.b64encode(b"malicious script or text file").decode("utf-8")
        valid_fake, _, err_fake = validate_image_payload(fake_b64)
        self.assertFalse(valid_fake)
        self.assertIn("Invalid or corrupted image format", err_fake)


if __name__ == "__main__":
    unittest.main()
