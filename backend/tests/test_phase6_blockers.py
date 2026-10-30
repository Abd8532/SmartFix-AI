import unittest
import json
import base64
import os
import sys
import re
from unittest.mock import MagicMock, patch
from botocore.exceptions import ClientError

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.auth import create_access_token
from app.storage import get_repository, ConcurrencyError, DynamoDBRepository, storage
from app.s3 import (
    set_s3_client,
    generate_presigned_view_url,
    get_s3_object_base64,
    cleanup_orphaned_s3_object
)
from app.api import handle_api_request


def make_api_call(method: str, path: str, headers: dict = None, body: dict = None):
    """Executes Lambda API handler directly and returns (statusCode, bodyDict, headersDict)."""
    res = handle_api_request(
        path=path,
        method=method.upper(),
        headers=headers or {},
        body_data=body or {}
    )
    status_code = res.get("statusCode", 500)
    raw_body = res.get("body", "{}")
    body_data = json.loads(raw_body) if isinstance(raw_body, str) else raw_body
    return status_code, body_data, res.get("headers", {})


class TestPhase6AttachmentAuthorization(unittest.TestCase):
    """Test suite verifying attachment authorization enforces ticket ownership & key validation."""

    def setUp(self):
        self.mock_s3 = MagicMock()
        self.mock_s3.generate_presigned_url.return_value = "https://mock-s3.amazonaws.com/uploads/org_gamma/test_photo.jpg?signed=true"
        set_s3_client(self.mock_s3)

        # Users in tenant org_gamma
        self.user_alice = {
            "id": "usr_gamma_alice",
            "email": "alice@org_gamma.com",
            "name": "Gamma Alice",
            "role": "user",
            "org_id": "org_gamma",
            "approvalStatus": "Approved"
        }
        self.user_bob = {
            "id": "usr_gamma_bob",
            "email": "bob@org_gamma.com",
            "name": "Gamma Bob",
            "role": "user",
            "org_id": "org_gamma",
            "approvalStatus": "Approved"
        }
        self.tech_plumbing = {
            "id": "tech_gamma_plumb",
            "email": "plumber@org_gamma.com",
            "name": "Gamma Plumber",
            "role": "technician",
            "specialty": "Plumbing",
            "org_id": "org_gamma",
            "approvalStatus": "Approved"
        }
        self.tech_electrical = {
            "id": "tech_gamma_elec",
            "email": "sparky@org_gamma.com",
            "name": "Gamma Sparky",
            "role": "technician",
            "specialty": "Electrical",
            "org_id": "org_gamma",
            "approvalStatus": "Approved"
        }
        self.admin_gamma = {
            "id": "adm_gamma_1",
            "email": "admin@org_gamma.com",
            "name": "Gamma Admin",
            "role": "admin",
            "org_id": "org_gamma",
            "approvalStatus": "Approved"
        }

        storage.save_user(self.user_alice)
        storage.save_user(self.user_bob)
        storage.save_user(self.tech_plumbing)
        storage.save_user(self.tech_electrical)
        storage.save_user(self.admin_gamma)

        self.ticket_gamma = {
            "id": "TCK-GAMMA-001",
            "title": "Severe pipe rupture",
            "description": "Flooding boiler room",
            "category": "Plumbing",
            "urgency": "Emergency",
            "status": "Assigned",
            "priority": "Emergency",
            "priorityScore": 95,
            "photo": "uploads/org_gamma/alice_pipe.jpg",
            "fileKey": "uploads/org_gamma/alice_pipe.jpg",
            "reportedBy": {"id": "usr_gamma_alice", "email": "alice@org_gamma.com", "name": "Gamma Alice"},
            "reporterId": "usr_gamma_alice",
            "reporterEmail": "alice@org_gamma.com",
            "assignedTechId": "tech_gamma_plumb",
            "org_id": "org_gamma"
        }
        storage.save_ticket(self.ticket_gamma, "org_gamma")

        # Tokens
        self.token_alice = create_access_token(self.user_alice)
        self.token_bob = create_access_token(self.user_bob)
        self.token_plumb = create_access_token(self.tech_plumbing)
        self.token_elec = create_access_token(self.tech_electrical)
        self.token_admin = create_access_token(self.admin_gamma)

    def tearDown(self):
        set_s3_client(None)
        try:
            storage.delete_ticket(self.ticket_gamma["id"], "org_gamma")
        except Exception:
            pass

    def test_missing_ticket_id_query_parameter_rejected(self):
        """Presigned view request without ticket_id is rejected with 400 Bad Request."""
        status_code, body, _ = make_api_call(
            method="GET",
            path=f"/api/v1/uploads/presigned-view?key={self.ticket_gamma['fileKey']}",
            headers={"Authorization": f"Bearer {self.token_alice}"}
        )
        self.assertEqual(status_code, 400)
        self.assertIn("ticket_id", body.get("error", ""))

    def test_mismatched_file_key_rejected(self):
        """Requesting a key that does not belong to the given ticket is rejected with 400."""
        foreign_key = "uploads/org_gamma/some_unrelated_file.jpg"
        status_code, body, _ = make_api_call(
            method="GET",
            path=f"/api/v1/uploads/presigned-view?key={foreign_key}&ticket_id={self.ticket_gamma['id']}",
            headers={"Authorization": f"Bearer {self.token_alice}"}
        )
        self.assertEqual(status_code, 400)
        self.assertIn("is not attached to ticket", body.get("error", ""))

    def test_consumer_cannot_view_other_consumer_attachment_in_same_org(self):
        """Bob is denied access to Alice's ticket attachment even though they share org_gamma."""
        status_code, body, _ = make_api_call(
            method="GET",
            path=f"/api/v1/uploads/presigned-view?key={self.ticket_gamma['fileKey']}&ticket_id={self.ticket_gamma['id']}",
            headers={"Authorization": f"Bearer {self.token_bob}"}
        )
        self.assertEqual(status_code, 403)
        self.assertIn("Access Denied", body.get("error", ""))

    def test_assigned_technician_can_view_attachment(self):
        """Technician assigned to the ticket can view the attachment."""
        status_code, body, _ = make_api_call(
            method="GET",
            path=f"/api/v1/uploads/presigned-view?key={self.ticket_gamma['fileKey']}&ticket_id={self.ticket_gamma['id']}",
            headers={"Authorization": f"Bearer {self.token_plumb}"}
        )
        self.assertEqual(status_code, 200)
        self.assertTrue(body.get("success"))
        self.assertIn("viewUrl", body)

    def test_unassigned_technician_denied_for_other_assigned_ticket(self):
        """Electrician technician cannot view an attachment for a ticket assigned to a plumber."""
        status_code, body, _ = make_api_call(
            method="GET",
            path=f"/api/v1/uploads/presigned-view?key={self.ticket_gamma['fileKey']}&ticket_id={self.ticket_gamma['id']}",
            headers={"Authorization": f"Bearer {self.token_elec}"}
        )
        self.assertEqual(status_code, 403)
        self.assertIn("Access Denied", body.get("error", ""))

    def test_org_admin_authorized_for_attachment(self):
        """Tenant admin can view any attachment belonging to tickets within their organization."""
        status_code, body, _ = make_api_call(
            method="GET",
            path=f"/api/v1/uploads/presigned-view?key={self.ticket_gamma['fileKey']}&ticket_id={self.ticket_gamma['id']}",
            headers={"Authorization": f"Bearer {self.token_admin}"}
        )
        self.assertEqual(status_code, 200)
        self.assertTrue(body.get("success"))


class TestPhase6TicketIdCollisionAndAtomicCreation(unittest.TestCase):
    """Test suite verifying cryptographic collision-resistant ticket IDs and conditional writes."""

    def test_new_ticket_id_is_cryptographically_collision_resistant(self):
        """POST /api/v1/tickets creates a ticket with TCK-[A-F0-9]{12} format."""
        user = {
            "id": "usr_tck_test",
            "email": "tck_test@org_gamma.com",
            "name": "TCK Tester",
            "role": "user",
            "org_id": "org_gamma",
            "approvalStatus": "Approved"
        }
        storage.save_user(user)
        token = create_access_token(user)

        valid_jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="

        status_code, body, _ = make_api_call(
            method="POST",
            path="/api/v1/tickets",
            headers={"Authorization": f"Bearer {token}"},
            body={
                "title": "Flickering hallway light fixture",
                "description": "Light switch sparks when flipped",
                "category": "Electrical",
                "urgency": "Urgent",
                "image": valid_jpeg,
                "mimeType": "image/jpeg"
            }
        )
        self.assertEqual(status_code, 201)
        ticket_id = body.get("ticket", {}).get("id")
        self.assertIsNotNone(ticket_id)
        # Verify 12 hex characters (e.g., TCK-A1B2C3D4E5F6)
        self.assertTrue(re.match(r"^TCK-[A-F0-9]{12}$", ticket_id), f"Ticket ID {ticket_id} does not match expected format")

        # Cleanup
        try:
            storage.delete_ticket(ticket_id, "org_gamma")
        except Exception:
            pass

    def test_conditional_write_rejects_duplicate_ticket_id_on_create(self):
        """Repository save_ticket raises ConcurrencyError if expected_version is None and ID already exists."""
        repo = get_repository()
        ticket = {
            "id": "TCK-COLLISION-TEST",
            "title": "First ticket",
            "category": "General",
            "status": "Assigned"
        }
        # First save succeeds
        saved = repo.save_ticket(ticket, "org_gamma", expected_version=None)
        self.assertEqual(saved["id"], "TCK-COLLISION-TEST")

        # Duplicate initial save with same ID raises ConcurrencyError
        duplicate_ticket = {
            "id": "TCK-COLLISION-TEST",
            "title": "Duplicate ticket attempting collision",
            "category": "General",
            "status": "Assigned"
        }
        with self.assertRaises(ConcurrencyError):
            repo.save_ticket(duplicate_ticket, "org_gamma", expected_version=None)

        # Cleanup
        try:
            repo.delete_ticket("TCK-COLLISION-TEST", "org_gamma")
        except Exception:
            pass


class TestPhase6S3OrphanCleanupAndVisionRetrieval(unittest.TestCase):
    """Test suite verifying S3 orphan cleanup on failed ticket creation and image retrieval."""

    def test_cleanup_orphaned_s3_object_calls_delete_object(self):
        """cleanup_orphaned_s3_object properly deletes the S3 object."""
        mock_s3 = MagicMock()
        set_s3_client(mock_s3)

        file_key = "uploads/org_gamma/test_orphan.jpg"
        result = cleanup_orphaned_s3_object(file_key, "org_gamma")
        self.assertTrue(result)
        mock_s3.delete_object.assert_called_once()
        args, kwargs = mock_s3.delete_object.call_args
        self.assertEqual(kwargs.get("Key"), file_key)

        set_s3_client(None)

    def test_get_s3_object_base64_encodes_bytes_correctly(self):
        """get_s3_object_base64 retrieves object bytes and encodes as data URL."""
        mock_s3 = MagicMock()
        dummy_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF"
        mock_body = MagicMock()
        mock_body.read.return_value = dummy_bytes
        mock_s3.get_object.return_value = {
            "Body": mock_body,
            "ContentType": "image/jpeg"
        }
        set_s3_client(mock_s3)

        data_url = get_s3_object_base64("uploads/org_gamma/photo.jpg", "org_gamma")
        self.assertIsNotNone(data_url)
        self.assertTrue(data_url.startswith("data:image/jpeg;base64,"))
        decoded = base64.b64decode(data_url.split(",")[1])
        self.assertEqual(decoded, dummy_bytes)

        set_s3_client(None)


if __name__ == "__main__":
    unittest.main()
