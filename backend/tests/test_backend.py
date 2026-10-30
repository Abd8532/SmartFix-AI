"""
Comprehensive Test Suite for FixFlow AI Phase 1 Backend Security & Workflow Invariants
Runs under standard Python unittest without requiring external dependencies.
"""
import unittest
import json
import os
import sys
import tempfile
import shutil

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    verify_jwt_token,
    AuthenticatedUser
)
from app.models import TicketStatus, TicketPriority
from app.storage import StorageRepository
from app.lifecycle import (
    evaluate_safety_critical,
    transition_ticket_status,
    tech_complete_ticket,
    consumer_verify_closure,
    consumer_reject_closure,
    can_technician_work_on_ticket
)
from app.rag import ingest_verified_repair_to_rag, query_knowledge_base
from app.api import handle_api_request


class TestFixFlowSecurityAndLifecycle(unittest.TestCase):

    def setUp(self):
        # Create a dedicated temp directory for isolated database tests
        self.test_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.test_dir, "test_db.json")
        self.storage = StorageRepository(db_path=self.db_path)

        # Seed sample organization & test users
        self.org_a = "org_campus_a"
        self.org_b = "org_campus_b"

        # Consumer user
        self.consumer_a = self.storage.save_user({
            "id": "usr_test_1",
            "org_id": self.org_a,
            "email": "consumer@campusa.edu",
            "passwordHash": hash_password("pass123"),
            "name": "Alice Consumer",
            "role": "user",
            "approvalStatus": "Approved"
        })

        # Consumer in Organization B
        self.consumer_b = self.storage.save_user({
            "id": "usr_test_2",
            "org_id": self.org_b,
            "email": "consumer@campusb.edu",
            "passwordHash": hash_password("pass123"),
            "name": "Bob Consumer",
            "role": "user",
            "approvalStatus": "Approved"
        })

        # Plumbing Technician
        self.tech_plumbing = self.storage.save_user({
            "id": "tech_plumb_1",
            "org_id": self.org_a,
            "email": "plumber@campusa.edu",
            "passwordHash": hash_password("pass123"),
            "name": "Peter Plumber",
            "role": "technician",
            "specialty": "Plumbing",
            "approvalStatus": "Approved"
        })

        # Electrical Technician
        self.tech_electrical = self.storage.save_user({
            "id": "tech_elec_1",
            "org_id": self.org_a,
            "email": "sparky@campusa.edu",
            "passwordHash": hash_password("pass123"),
            "name": "Steve Spark",
            "role": "technician",
            "specialty": "Electrical",
            "approvalStatus": "Approved"
        })

        # Admin
        self.admin_a = self.storage.save_user({
            "id": "adm_1",
            "org_id": self.org_a,
            "email": "admin@campusa.edu",
            "passwordHash": hash_password("admin123"),
            "name": "Chief Admin",
            "role": "admin",
            "approvalStatus": "Approved"
        })

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    # ==========================================================================
    # TEST 1: User cannot register as administrator
    # ==========================================================================
    def test_user_cannot_register_as_admin(self):
        req_body = {
            "email": "attacker@campusa.edu",
            "password": "secretpassword",
            "role": "admin"
        }
        res = handle_api_request(
            path="/api/v1/auth/register",
            method="POST",
            headers={},
            body_data=req_body
        )
        self.assertEqual(res["statusCode"], 403)
        body = json.loads(res["body"])
        self.assertFalse(body["success"])
        self.assertIn("Public administrator registration is prohibited", body["error"])

    # ==========================================================================
    # TEST 2: Tenant Isolation — Consumer cannot read another organisation's tickets
    # ==========================================================================
    def test_consumer_cannot_read_another_organization_ticket(self):
        # Create ticket in Org B
        ticket_b = self.storage.save_ticket({
            "id": "TCK-TENANT-B",
            "org_id": self.org_b,
            "title": "Confidential Building B Issue",
            "description": "Sensitive research lab pipe leak",
            "category": "Plumbing",
            "priority": "Routine",
            "status": "Assigned",
            "reporterId": "usr_test_2"
        }, org_id=self.org_b)

        # Consumer A in Org A attempts to fetch ticket from Org B
        token_a = create_access_token(self.consumer_a)
        res = handle_api_request(
            path=f"/api/v1/tickets/{ticket_b['id']}",
            method="GET",
            headers={"Authorization": f"Bearer {token_a}"},
            body_data={}
        )
        # Must be 404 / access denied (zero cross-tenant leakage)
        self.assertEqual(res["statusCode"], 404)
        body = json.loads(res["body"])
        self.assertFalse(body["success"])

    # ==========================================================================
    # TEST 3: Technician cannot confirm a ticket they are not assigned to
    # ==========================================================================
    def test_technician_cannot_confirm_unassigned_ticket(self):
        # Ticket specifically assigned to Electrical department / Electrical Tech
        ticket = self.storage.save_ticket({
            "id": "TCK-ELEC-100",
            "org_id": self.org_a,
            "title": "Subpanel electrical arcing",
            "description": "Panel 3 sparking in server room",
            "category": "Electrical",
            "priority": "Emergency",
            "status": TicketStatus.IN_PROGRESS,
            "assignedTo": "Electrical Tech",
            "assignedTechId": "tech_elec_1",
            "reporterId": "usr_test_1"
        }, org_id=self.org_a)

        # Plumbing technician attempts to complete electrical ticket
        plumber_user = AuthenticatedUser({
            "sub": "tech_plumb_1",
            "email": "plumber@campusa.edu",
            "role": "technician",
            "org_id": self.org_a,
            "specialty": "Plumbing"
        })

        self.assertFalse(can_technician_work_on_ticket(ticket, plumber_user))
        with self.assertRaises(PermissionError):
            tech_complete_ticket(ticket, plumber_user, "Tightened pipe washer")

    # ==========================================================================
    # TEST 4: Ticket cannot become Completed without both required confirmations
    # ==========================================================================
    def test_direct_transition_to_completed_is_strictly_prohibited(self):
        ticket = {
            "id": "TCK-500",
            "status": TicketStatus.ASSIGNED,
            "techConfirmed": False,
            "userConfirmed": False
        }
        actor = AuthenticatedUser({
            "sub": "usr_test_1",
            "email": "consumer@campusa.edu",
            "role": "user",
            "org_id": self.org_a
        })

        with self.assertRaises(ValueError) as ctx:
            transition_ticket_status(ticket, TicketStatus.COMPLETED, actor)
        self.assertIn("Direct transition to Completed is prohibited", str(ctx.exception))

    def test_dual_approval_flow_to_completion(self):
        ticket = {
            "id": "TCK-DUAL-01",
            "status": TicketStatus.IN_PROGRESS,
            "category": "Plumbing",
            "assignedTechId": "tech_plumb_1",
            "assignedTo": "Plumbing Tech",
            "reporterId": "usr_test_1",
            "techConfirmed": False,
            "userConfirmed": False
        }
        plumber_user = AuthenticatedUser({
            "sub": "tech_plumb_1",
            "email": "plumber@campusa.edu",
            "role": "technician",
            "org_id": self.org_a,
            "specialty": "Plumbing"
        })
        consumer_user = AuthenticatedUser({
            "sub": "usr_test_1",
            "email": "consumer@campusa.edu",
            "role": "user",
            "org_id": self.org_a
        })

        # Step 1: Tech completes
        tech_complete_ticket(ticket, plumber_user, "Replaced brass elbow joint and pressure tested")
        self.assertTrue(ticket["techConfirmed"])
        self.assertEqual(ticket["status"], TicketStatus.PENDING_USER_VERIFICATION)
        self.assertFalse(ticket.get("userConfirmed", False))

        # Step 2: Consumer verifies
        consumer_verify_closure(ticket, consumer_user)
        self.assertTrue(ticket["userConfirmed"])
        self.assertEqual(ticket["status"], TicketStatus.COMPLETED)

    # ==========================================================================
    # TEST 5: Rejected repair reopens the same ticket
    # ==========================================================================
    def test_consumer_rejection_reopens_same_ticket(self):
        ticket = {
            "id": "TCK-REJECT-01",
            "status": TicketStatus.PENDING_USER_VERIFICATION,
            "techConfirmed": True,
            "userConfirmed": False,
            "reporterId": "usr_test_1",
            "reopenCount": 0
        }
        consumer_user = AuthenticatedUser({
            "sub": "usr_test_1",
            "email": "consumer@campusa.edu",
            "role": "user",
            "org_id": self.org_a
        })

        # Consumer inspects and finds faucet still leaking
        consumer_reject_closure(ticket, consumer_user, "Sink is still dripping rapidly under pressure")

        self.assertFalse(ticket["techConfirmed"])
        self.assertEqual(ticket["status"], TicketStatus.IN_PROGRESS)
        self.assertEqual(ticket["reopenCount"], 1)
        self.assertEqual(ticket["lastRejectionReason"], "Sink is still dripping rapidly under pressure")
        self.assertEqual(ticket["id"], "TCK-REJECT-01")  # Reopened same ticket

    # ==========================================================================
    # TEST 6: Safety-critical priority overrides cannot be downgraded
    # ==========================================================================
    def test_safety_critical_hazard_override(self):
        complaint = "Smell of natural gas leak near the heating unit in basement"
        priority, score, is_hazard, override = evaluate_safety_critical(
            complaint,
            requested_priority="Routine",
            requested_score=20,
            is_hazard=False
        )
        # Must be elevated to Emergency with hazard flag regardless of requested Routine
        self.assertEqual(priority, TicketPriority.EMERGENCY)
        self.assertTrue(is_hazard)
        self.assertTrue(override)
        self.assertGreaterEqual(score, 95)

    # ==========================================================================
    # TEST 7: Only ingest verified technician repair reports into trusted RAG
    # ==========================================================================
    def test_unverified_tickets_rejected_from_rag_ingestion(self):
        unverified_ticket = {
            "id": "TCK-RAW-01",
            "title": "Raw user complaint",
            "status": TicketStatus.ASSIGNED,
            "techConfirmed": False,
            "userConfirmed": False,
            "resolutionNotes": None
        }
        # Ingestion must be blocked
        success = ingest_verified_repair_to_rag(unverified_ticket, org_id=self.org_a)
        self.assertFalse(success)

    # ==========================================================================
    # TEST 8: Password hashing security
    # ==========================================================================
    def test_password_hashing_and_verification(self):
        pwd = "EnterprisePassword2026!"
        hashed = hash_password(pwd)
        self.assertTrue(hashed.startswith("pbkdf2_sha256$100000$"))
        self.assertTrue(verify_password(pwd, hashed))
        self.assertFalse(verify_password("WrongPassword", hashed))


if __name__ == "__main__":
    unittest.main()
