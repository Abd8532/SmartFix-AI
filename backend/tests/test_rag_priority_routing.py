import unittest
import json
import os
import sys
import tempfile
import shutil
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.storage import JsonFileRepository
from app.rag import (
    extract_location_entity,
    extract_category_entity,
    compute_priority_metrics,
    retrieve_rag_ticket_history
)
from app.ai import analyze_maintenance_fault
from app.api import handle_api_request
from app.auth import create_access_token, hash_password
from lambda_function import run_rag_multimodal_analysis, lambda_handler


class TestRagPriorityAndRouting(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.test_dir, "test_db.json")
        self.repo = JsonFileRepository(self.db_path)

        import app.api as api_mod
        self.orig_storage = api_mod.storage
        api_mod.storage = self.repo

        self.user = {
            "id": "usr_test_reporter",
            "org_id": "org_campus_main",
            "name": "Alex Reporter",
            "email": "alex@campus.edu",
            "passwordHash": hash_password("pass123"),
            "role": "user",
            "roleDisplay": "Campus User",
            "approvalStatus": "Approved",
            "approved": True,
            "status": "approved",
            "createdAt": datetime.utcnow().isoformat() + "Z"
        }
        self.repo.save_user(self.user)
        self.token = create_access_token(self.user)
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def tearDown(self):
        import app.api as api_mod
        api_mod.storage = self.orig_storage
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_location_entity_extraction(self):
        """Extracts campus block, room, and landmarks correctly."""
        self.assertEqual(extract_location_entity("water pipe leak in ab 12 room 1"), "AB 12 Room 1")
        self.assertEqual(extract_location_entity("ac failure in ab 7 floor 3"), "AB 7 Floor 3")
        self.assertEqual(extract_location_entity("faucet broken in cafeteria kitchen"), "Cafeteria Kitchen")
        self.assertEqual(extract_location_entity("server room overheating"), "Server Room")
        self.assertEqual(extract_location_entity("room 204 light blinking"), "Room 204")

    def test_single_specialty_category_extraction(self):
        """Strictly routes complaints to ONE of Plumbing, Electrical, HVAC, IT, General."""
        self.assertEqual(extract_category_entity("Pipe burst and spraying cold water under sink"), "Plumbing")
        self.assertEqual(extract_category_entity("Circuit breaker sparking in panel"), "Electrical")
        self.assertEqual(extract_category_entity("AC chiller cooling failed in classroom"), "HVAC")
        self.assertEqual(extract_category_entity("Wi-Fi router offline in lab"), "IT")
        self.assertEqual(extract_category_entity("Door lock jammed"), "General")

    def test_rag_priority_base_criticality_never_stuck_on_routine(self):
        """High operational impact issues (e.g. pipe leakage, AC failure in ab 12) never get stuck on Routine."""
        # 0 prior matches on pipe leakage in ab 12 room 1
        urgency, score, is_hazard, reason = compute_priority_metrics(
            complaint="pipe leakage in ab 12 room 1",
            rag_ticket_volume=0
        )
        self.assertEqual(urgency, "Moderate")
        self.assertEqual(score, 40)
        self.assertFalse(is_hazard)

    def test_rag_volume_escalation_multipliers(self):
        """Test RAG volume escalation tiers: 0 -> Base, 1 -> +20 (bumped 1 tier), 2 -> +35 (>=Urgent), >=3 -> +50 (Emergency)."""
        complaint = "pipe leakage in ab 12 room 1"

        # 0 prior matches (1st ticket): Base 40, Moderate
        u0, s0, h0, _ = compute_priority_metrics(complaint, rag_ticket_volume=0)
        self.assertEqual(u0, "Moderate")
        self.assertEqual(s0, 40)

        # 1 prior match (2nd ticket): +20 pts -> 60, bumped from Moderate to Urgent
        u1, s1, h1, _ = compute_priority_metrics(complaint, rag_ticket_volume=1)
        self.assertEqual(u1, "Urgent")
        self.assertEqual(s1, 60)

        # 2 prior matches (3rd ticket): +35 pts -> 75, forced to at least Urgent
        u2, s2, h2, _ = compute_priority_metrics(complaint, rag_ticket_volume=2)
        self.assertEqual(u2, "Urgent")
        self.assertEqual(s2, 75)

        # 3 prior matches (4th ticket): +50 pts -> forced to Emergency (90-100)
        u3, s3, h3, _ = compute_priority_metrics(complaint, rag_ticket_volume=3)
        self.assertEqual(u3, "Emergency")
        self.assertGreaterEqual(s3, 90)
        self.assertTrue(h3)

    def test_rag_volume_retrieval_and_recurrence_detection(self):
        """RAG pipeline searches prior tickets by location and category to calculate ragTicketVolume."""
        # Seed 2 prior tickets in the database for AB 12 Room 1 Plumbing
        self.repo.save_ticket({
            "id": "TCK-PRIOR-01",
            "org_id": "org_campus_main",
            "title": "Sink Pipe Leak in AB 12 Room 1",
            "description": "Slow drip under sink in AB 12 Room 1",
            "category": "Plumbing",
            "location": "AB 12 Room 1",
            "status": "Completed",
            "rootCause": "Loose compression nut",
            "fixApplied": "Tightened nut"
        }, org_id="org_campus_main")

        self.repo.save_ticket({
            "id": "TCK-PRIOR-02",
            "org_id": "org_campus_main",
            "title": "AB 12 Room 1 Pipe Dripping",
            "description": "Dripping pipe again in AB 12 Room 1",
            "category": "Plumbing",
            "location": "AB 12 Room 1",
            "status": "In Progress"
        }, org_id="org_campus_main")

        vol, summary, matches = retrieve_rag_ticket_history(
            complaint="Active pipe leakage in ab 12 room 1",
            org_id="org_campus_main",
            storage_instance=self.repo
        )
        self.assertEqual(vol, 2)
        self.assertEqual(summary["priorReportsCount"], 2)
        self.assertEqual(summary["location"], "AB 12 Room 1")
        self.assertEqual(summary["category"], "Plumbing")
        self.assertIn("Loose compression nut", summary["pastRootCauses"])

    def test_api_ticket_creation_attaches_rag_volume_and_prepends_description(self):
        """Creating a ticket via POST /api/v1/tickets runs RAG volume calculation and prepends description."""
        # Pre-seed 1 active ticket in AB 12 Room 1
        self.repo.save_ticket({
            "id": "TCK-EXISTING-01",
            "org_id": "org_campus_main",
            "title": "Water leak in AB 12 Room 1",
            "description": "Water dripping under pipe in AB 12 Room 1",
            "category": "Plumbing",
            "location": "AB 12 Room 1",
            "status": "In Progress"
        }, org_id="org_campus_main")

        payload = {
            "complaint": "pipe leakage in ab 12 room 1",
            "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==",
            "mimeType": "image/jpeg"
        }

        res = handle_api_request(
            method="POST",
            path="/api/v1/tickets",
            headers=self.headers,
            body_data=payload
        )
        self.assertEqual(res["statusCode"], 201)
        body = json.loads(res["body"])
        self.assertTrue(body["success"])
        t = body["ticket"]

        # Verification: RAG volume incremented, priority escalated to Urgent, description prepended
        self.assertEqual(t["ragTicketVolume"], 2)  # 1 prior match + current = 2 reports
        self.assertEqual(t["urgency"], "Urgent")
        self.assertEqual(t["category"], "Plumbing")
        self.assertEqual(t["assignedSpecialty"], "Plumbing")
        self.assertEqual(t["assignedTo"], "Plumbing Tech")
        self.assertIn("[RAG ESCALATION - 2 REPORTS DETECTED]", t["description"])
        self.assertIn("Vector search found 1 prior/active ticket(s)", t["description"])
        self.assertIsNotNone(t.get("deviceHistoryLog"))


if __name__ == "__main__":
    unittest.main()
