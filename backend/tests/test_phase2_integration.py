"""
Phase 2 API Integration Test Suite for SmartFix AI
Validates authoritative routing, strict identity & role gating, anti-impersonation,
state machine transitions, multi-tenant isolation, and JWT verification.
Invokes handle_api_request directly as the single source of truth.
"""
import unittest
import json
import os
import sys
import tempfile
import shutil

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import app.api
import app.audit
from app.auth import (
    hash_password,
    create_access_token,
    verify_jwt_token,
    _base64url_encode
)
from app.models import TicketStatus, TicketPriority
from app.storage import JsonFileRepository
from app.api import handle_api_request


class TestPhase2ApiIntegration(unittest.TestCase):

    def setUp(self):
        # Create dedicated temp directory and test database
        self.test_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.test_dir, "test_db.json")
        self.storage = JsonFileRepository(db_path=self.db_path)

        # Patch storage singletons in api and audit modules
        self.orig_api_storage = app.api.storage
        self.orig_audit_storage = app.audit.storage
        app.api.storage = self.storage
        app.audit.storage = self.storage

        self.org_a = "org_campus_a"
        self.org_b = "org_campus_b"

        # Consumer 1 (Org A)
        self.consumer_a1 = self.storage.save_user({
            "id": "usr_con_1",
            "org_id": self.org_a,
            "email": "alice@campusa.edu",
            "passwordHash": hash_password("pass123"),
            "name": "Alice Higgins",
            "role": "user",
            "approvalStatus": "Approved"
        })
        self.token_consumer_a1 = create_access_token(self.consumer_a1)

        # Consumer 2 (Org A - different consumer in same org)
        self.consumer_a2 = self.storage.save_user({
            "id": "usr_con_2",
            "org_id": self.org_a,
            "email": "charlie@campusa.edu",
            "passwordHash": hash_password("pass123"),
            "name": "Charlie Day",
            "role": "user",
            "approvalStatus": "Approved"
        })
        self.token_consumer_a2 = create_access_token(self.consumer_a2)

        # Technician 1 (Plumbing, Org A)
        self.tech_plumb = self.storage.save_user({
            "id": "tech_plumb_1",
            "org_id": self.org_a,
            "email": "mario@campusa.edu",
            "passwordHash": hash_password("pass123"),
            "name": "Mario Mario",
            "role": "technician",
            "specialty": "Plumbing",
            "approvalStatus": "Approved"
        })
        self.token_tech_plumb = create_access_token(self.tech_plumb)

        # Technician 2 (Electrical, Org A)
        self.tech_elec = self.storage.save_user({
            "id": "tech_elec_1",
            "org_id": self.org_a,
            "email": "luigi@campusa.edu",
            "passwordHash": hash_password("pass123"),
            "name": "Luigi Mario",
            "role": "technician",
            "specialty": "Electrical",
            "approvalStatus": "Approved"
        })
        self.token_tech_elec = create_access_token(self.tech_elec)

        # Admin (Org A)
        self.admin_a = self.storage.save_user({
            "id": "adm_1",
            "org_id": self.org_a,
            "email": "admin@campusa.edu",
            "passwordHash": hash_password("admin123"),
            "name": "Head Admin",
            "role": "admin",
            "approvalStatus": "Approved"
        })
        self.token_admin_a = create_access_token(self.admin_a)

        # Admin (Org B)
        self.admin_b = self.storage.save_user({
            "id": "adm_b_1",
            "org_id": self.org_b,
            "email": "admin@campusb.edu",
            "passwordHash": hash_password("admin123"),
            "name": "Campus B Admin",
            "role": "admin",
            "approvalStatus": "Approved"
        })
        self.token_admin_b = create_access_token(self.admin_b)

    def tearDown(self):
        # Restore storage singletons
        app.api.storage = self.orig_api_storage
        app.audit.storage = self.orig_audit_storage
        shutil.rmtree(self.test_dir, ignore_errors=True)

    # ==========================================================================
    # 1. test_unauthenticated_request_is_rejected
    # ==========================================================================
    def test_unauthenticated_request_is_rejected(self):
        res = handle_api_request(
            path="/api/v1/tickets",
            method="GET",
            headers={},
            body_data={}
        )
        self.assertEqual(res["statusCode"], 401)
        body = json.loads(res["body"])
        self.assertFalse(body["success"])
        self.assertIn("Unauthorized", body["error"])

    # ==========================================================================
    # 2. test_consumer_cannot_fetch_another_consumer_ticket
    # ==========================================================================
    def test_consumer_cannot_fetch_another_consumer_ticket(self):
        # Ticket reported by Consumer 1
        ticket = self.storage.save_ticket({
            "id": "TCK-P2-001",
            "org_id": self.org_a,
            "title": "Broken window in Room 101",
            "description": "Crack along frame",
            "category": "Other",
            "priority": "Routine",
            "status": TicketStatus.ASSIGNED,
            "reporterId": self.consumer_a1["id"],
            "reportedBy": {"id": self.consumer_a1["id"], "email": self.consumer_a1["email"]}
        }, org_id=self.org_a)

        # Consumer 2 tries to fetch Consumer 1's ticket
        res = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}",
            method="GET",
            headers={"Authorization": f"Bearer {self.token_consumer_a2}"},
            body_data={}
        )
        self.assertEqual(res["statusCode"], 403)
        body = json.loads(res["body"])
        self.assertFalse(body["success"])
        self.assertIn("Consumers may retrieve only tickets they reported", body["error"])

    # ==========================================================================
    # 3. test_technician_cannot_fetch_another_technician_private_ticket
    # ==========================================================================
    def test_technician_cannot_fetch_another_technician_private_ticket(self):
        # Ticket assigned exclusively to Electrical Technician
        ticket = self.storage.save_ticket({
            "id": "TCK-P2-002",
            "org_id": self.org_a,
            "title": "Substation breaker trip",
            "description": "High voltage switch inspection",
            "category": "Electrical",
            "priority": "Emergency",
            "status": TicketStatus.IN_PROGRESS,
            "assignedTechId": self.tech_elec["id"],
            "assignedTo": self.tech_elec["name"],
            "reporterId": self.consumer_a1["id"]
        }, org_id=self.org_a)

        # Plumbing Technician attempts to fetch Electrical Technician's work order
        res = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}",
            method="GET",
            headers={"Authorization": f"Bearer {self.token_tech_plumb}"},
            body_data={}
        )
        self.assertEqual(res["statusCode"], 403)
        body = json.loads(res["body"])
        self.assertFalse(body["success"])
        self.assertIn("not assigned to this work order", body["error"])

    # ==========================================================================
    # 4. test_technician_cannot_complete_unassigned_ticket
    # ==========================================================================
    def test_technician_cannot_complete_unassigned_ticket(self):
        # Unassigned ticket
        ticket = self.storage.save_ticket({
            "id": "TCK-P2-003",
            "org_id": self.org_a,
            "title": "Leaking sink in basement",
            "description": "P-trap loose",
            "category": "Plumbing",
            "priority": "Routine",
            "status": TicketStatus.ASSIGNED,
            "assignedTechId": None,
            "reporterId": self.consumer_a1["id"]
        }, org_id=self.org_a)

        # Tech attempts to mark complete without being assigned
        res = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}/tech-complete",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_tech_plumb}"},
            body_data={"resolutionNotes": "Replaced washer"}
        )
        self.assertEqual(res["statusCode"], 403)
        body = json.loads(res["body"])
        self.assertFalse(body["success"])
        self.assertIn("cannot complete an unassigned ticket", body["error"])

    # ==========================================================================
    # 5. test_admin_cannot_impersonate_consumer_confirmation
    # ==========================================================================
    def test_admin_cannot_impersonate_consumer_confirmation(self):
        # Ticket completed by tech, pending user verification
        ticket = self.storage.save_ticket({
            "id": "TCK-P2-004",
            "org_id": self.org_a,
            "title": "HVAC filter replacement",
            "description": "Filter replaced",
            "category": "HVAC",
            "priority": "Routine",
            "status": TicketStatus.PENDING_USER_VERIFICATION,
            "techConfirmed": True,
            "assignedTechId": self.tech_plumb["id"],
            "reporterId": self.consumer_a1["id"]
        }, org_id=self.org_a)

        # Admin attempts to impersonate consumer verification
        res = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}/verify-closure",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_admin_a}"},
            body_data={}
        )
        self.assertEqual(res["statusCode"], 403)
        body = json.loads(res["body"])
        self.assertFalse(body["success"])
        self.assertIn("cannot impersonate consumer confirmation", body["error"])

    # ==========================================================================
    # 6. test_consumer_cannot_confirm_another_person_ticket
    # ==========================================================================
    def test_consumer_cannot_confirm_another_person_ticket(self):
        # Ticket reported by Consumer 1, pending verification
        ticket = self.storage.save_ticket({
            "id": "TCK-P2-005",
            "org_id": self.org_a,
            "title": "Ceiling tile replacement",
            "description": "Water damaged tile",
            "category": "Other",
            "priority": "Routine",
            "status": TicketStatus.PENDING_USER_VERIFICATION,
            "techConfirmed": True,
            "assignedTechId": self.tech_plumb["id"],
            "reporterId": self.consumer_a1["id"],
            "reportedBy": {"id": self.consumer_a1["id"], "email": self.consumer_a1["email"]}
        }, org_id=self.org_a)

        # Consumer 2 tries to confirm Consumer 1's ticket
        res = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}/verify-closure",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_consumer_a2}"},
            body_data={}
        )
        self.assertEqual(res["statusCode"], 403)
        body = json.loads(res["body"])
        self.assertFalse(body["success"])

    # ==========================================================================
    # 7. test_rejection_reason_is_persisted
    # ==========================================================================
    def test_rejection_reason_is_persisted(self):
        ticket = self.storage.save_ticket({
            "id": "TCK-P2-006",
            "org_id": self.org_a,
            "title": "Bathroom sink leak",
            "description": "Continuous drip",
            "category": "Plumbing",
            "priority": "Routine",
            "status": TicketStatus.PENDING_USER_VERIFICATION,
            "techConfirmed": True,
            "userConfirmed": False,
            "assignedTechId": self.tech_plumb["id"],
            "reporterId": self.consumer_a1["id"],
            "reportedBy": {"id": self.consumer_a1["id"], "email": self.consumer_a1["email"]}
        }, org_id=self.org_a)

        res = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}/reject-closure",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_consumer_a1}"},
            body_data={"rejectionReason": "Sink is still dripping rapidly under water pressure"}
        )
        self.assertEqual(res["statusCode"], 200)
        body = json.loads(res["body"])
        self.assertTrue(body["success"])

        # Verify persistence in database
        saved = self.storage.get_ticket(ticket["id"], self.org_a)
        self.assertEqual(saved["rejectionReason"], "Sink is still dripping rapidly under water pressure")
        self.assertEqual(saved["lastRejectionReason"], "Sink is still dripping rapidly under water pressure")

    # ==========================================================================
    # 8. test_rejection_reopens_same_ticket
    # ==========================================================================
    def test_rejection_reopens_same_ticket(self):
        ticket = self.storage.save_ticket({
            "id": "TCK-P2-007",
            "org_id": self.org_a,
            "title": "Radiator clicking loudly",
            "description": "Air in valve",
            "category": "HVAC",
            "priority": "Routine",
            "status": TicketStatus.PENDING_USER_VERIFICATION,
            "techConfirmed": True,
            "userConfirmed": False,
            "reopenCount": 0,
            "assignedTechId": self.tech_plumb["id"],
            "reporterId": self.consumer_a1["id"],
            "reportedBy": {"id": self.consumer_a1["id"], "email": self.consumer_a1["email"]}
        }, org_id=self.org_a)

        res = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}/reject-closure",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_consumer_a1}"},
            body_data={"rejectionReason": "Radiator still making loud banging noises"}
        )
        self.assertEqual(res["statusCode"], 200)

        saved = self.storage.get_ticket("TCK-P2-007", self.org_a)
        self.assertEqual(saved["id"], "TCK-P2-007")  # Must be the exact same ticket
        self.assertEqual(saved["status"], TicketStatus.IN_PROGRESS)
        self.assertEqual(saved["reopenCount"], 1)
        self.assertFalse(saved["techConfirmed"])
        self.assertFalse(saved["userConfirmed"])

    # ==========================================================================
    # 9. test_completed_requires_both_confirmations
    # ==========================================================================
    def test_completed_requires_both_confirmations(self):
        ticket = self.storage.save_ticket({
            "id": "TCK-P2-008",
            "org_id": self.org_a,
            "title": "Emergency valve repair",
            "description": "Main gate valve jammed",
            "category": "Plumbing",
            "priority": "Emergency",
            "status": TicketStatus.IN_PROGRESS,
            "techConfirmed": False,
            "userConfirmed": False,
            "assignedTechId": self.tech_plumb["id"],
            "reporterId": self.consumer_a1["id"],
            "reportedBy": {"id": self.consumer_a1["id"], "email": self.consumer_a1["email"]}
        }, org_id=self.org_a)

        # Consumer cannot confirm before technician marks it complete
        premature_res = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}/verify-closure",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_consumer_a1}"},
            body_data={}
        )
        self.assertEqual(premature_res["statusCode"], 400)
        premature_body = json.loads(premature_res["body"])
        self.assertIn("before technician completion", premature_body["error"])

        # Step 1: Technician completes with resolutionNotes
        tech_res = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}/tech-complete",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_tech_plumb}"},
            body_data={"resolutionNotes": "Repacked gland and lubricated gate spindle"}
        )
        self.assertEqual(tech_res["statusCode"], 200)
        step1 = self.storage.get_ticket(ticket["id"], self.org_a)
        self.assertEqual(step1["status"], TicketStatus.PENDING_USER_VERIFICATION)
        self.assertTrue(step1["techConfirmed"])
        self.assertFalse(step1.get("userConfirmed", False))

        # Step 2: Consumer verifies closure
        user_res = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}/verify-closure",
            method="POST",
            headers={"Authorization": f"Bearer {self.token_consumer_a1}"},
            body_data={}
        )
        self.assertEqual(user_res["statusCode"], 200)
        step2 = self.storage.get_ticket(ticket["id"], self.org_a)
        self.assertEqual(step2["status"], TicketStatus.COMPLETED)
        self.assertTrue(step2["techConfirmed"])
        self.assertTrue(step2["userConfirmed"])

    # ==========================================================================
    # 10. test_direct_status_transition_to_completed_is_rejected
    # ==========================================================================
    def test_direct_status_transition_to_completed_is_rejected(self):
        ticket = self.storage.save_ticket({
            "id": "TCK-P2-009",
            "org_id": self.org_a,
            "title": "Air vent cleaning",
            "description": "Routine clean",
            "category": "HVAC",
            "priority": "Routine",
            "status": TicketStatus.ASSIGNED,
            "techConfirmed": False,
            "userConfirmed": False,
            "reporterId": self.consumer_a1["id"]
        }, org_id=self.org_a)

        # Attempt to bypass state machine via PATCH /status
        res = handle_api_request(
            path=f"/api/v1/tickets/{ticket['id']}/status",
            method="PATCH",
            headers={"Authorization": f"Bearer {self.token_admin_a}"},
            body_data={"status": "Completed"}
        )
        self.assertEqual(res["statusCode"], 400)
        body = json.loads(res["body"])
        self.assertFalse(body["success"])
        self.assertIn("Direct transition to Completed is prohibited", body["error"])

    # ==========================================================================
    # 11. test_cross_tenant_audit_logs_are_inaccessible
    # ==========================================================================
    def test_cross_tenant_audit_logs_are_inaccessible(self):
        # Insert audit log for Org A
        self.storage.log_audit({
            "org_id": self.org_a,
            "action": "SECRET_ORG_A_ACTION",
            "actor_id": self.admin_a["id"]
        })

        # Insert audit log for Org B
        self.storage.log_audit({
            "org_id": self.org_b,
            "action": "SECRET_ORG_B_ACTION",
            "actor_id": self.admin_b["id"]
        })

        # Org A Admin fetches audit logs
        res_a = handle_api_request(
            path="/api/v1/audit-logs",
            method="GET",
            headers={"Authorization": f"Bearer {self.token_admin_a}"},
            body_data={}
        )
        self.assertEqual(res_a["statusCode"], 200)
        body_a = json.loads(res_a["body"])
        self.assertTrue(body_a["success"])
        logs_a = body_a["auditLogs"]

        # Verify only Org A logs are returned
        for log in logs_a:
            self.assertEqual(log["org_id"], self.org_a)
            self.assertNotEqual(log.get("action"), "SECRET_ORG_B_ACTION")

    # ==========================================================================
    # 12. test_invalid_jwt_and_expired_jwt_are_rejected
    # ==========================================================================
    def test_invalid_jwt_and_expired_jwt_are_rejected(self):
        # Subtest A: Forged/Tampered signature
        valid_parts = self.token_admin_a.split(".")
        fake_sig = _base64url_encode(b"forged_bad_signature_32_bytes!!")
        tampered_token = f"{valid_parts[0]}.{valid_parts[1]}.{fake_sig}"
        res_tampered = handle_api_request(
            path="/api/v1/tickets",
            method="GET",
            headers={"Authorization": f"Bearer {tampered_token}"},
            body_data={}
        )
        self.assertEqual(res_tampered["statusCode"], 401)
        body_tampered = json.loads(res_tampered["body"])
        self.assertIn("Invalid token signature", body_tampered["error"])

        # Subtest B: Expired token
        expired_token = create_access_token(self.admin_a, expires_in=-3600)
        res_expired = handle_api_request(
            path="/api/v1/tickets",
            method="GET",
            headers={"Authorization": f"Bearer {expired_token}"},
            body_data={}
        )
        self.assertEqual(res_expired["statusCode"], 401)
        body_expired = json.loads(res_expired["body"])
        self.assertIn("Token has expired", body_expired["error"])


if __name__ == "__main__":
    unittest.main()
