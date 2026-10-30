"""
FixFlow AI - Visual-Textual Verification Gate Unit Tests
Verifies strict rejection of irrelevant or random photos (such as sketches, selfies, or unrelated objects)
that do not match the maintenance problem description.
"""
import unittest
import json
import os
import sys
from unittest.mock import patch, MagicMock

# Ensure backend root is on Python sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from lambda_function import lambda_handler, run_rag_multimodal_analysis
from app.auth import create_access_token
from app.storage import storage


class TestVisualTextualVerificationGate(unittest.TestCase):
    def setUp(self):
        self.org_id = "org_campus_main"
        self.user_data = {
            "id": "usr_verify_test_1",
            "org_id": self.org_id,
            "email": "visualgate@campus.edu",
            "name": "Visual Gate Tester",
            "role": "user",
            "approvalStatus": "Approved"
        }
        storage.save_user(self.user_data)
        self.token = create_access_token(self.user_data)
        self.auth_headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        self.created_ticket_ids = []

    def tearDown(self):
        for tid in self.created_ticket_ids:
            try:
                storage.delete_ticket(tid, self.org_id)
            except Exception:
                pass

    def test_run_rag_multimodal_analysis_sets_image_matches_false_for_irrelevant_photo(self):
        """Verify run_rag_multimodal_analysis sets imageMatchesComplaint: False with warning string."""
        mock_genai = MagicMock()
        mock_model = MagicMock()
        mock_genai.GenerativeModel.return_value = mock_model
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "imageMatchesComplaint": False,
            "imageValidationWarning": "Photo Irrelevant: You described a pipe leak, but the photo shows an artwork. Please upload a real photo of the broken equipment.",
            "title": "Pipe Leak",
            "category": "Plumbing",
            "urgency": "Urgent",
            "priorityScore": 70,
            "isHazard": False,
            "location": "Restroom",
            "assignedTo": "Plumbing Tech",
            "reasoning": "Artwork detected instead of plumbing fixture."
        })
        mock_model.generate_content.return_value = mock_response

        with patch("app.ai.GENAI_AVAILABLE", True), \
             patch("app.ai.GEMINI_API_KEY", "mock_key"), \
             patch("app.ai.genai", mock_genai, create=True):

            res = run_rag_multimodal_analysis(
                complaint="Water leaking from sink drain pipe",
                image_base64="data:image/jpeg;base64,/9j/4AAQSkZJRg==",
                historical_matches=[]
            )

            self.assertFalse(res["imageMatchesComplaint"])
            self.assertIn("Photo Irrelevant", res["imageValidationWarning"])
            self.assertIn("artwork", res["imageValidationWarning"])

            # Verify prompt contains Step 1 and Step 2 visual analysis instructions
            call_args = mock_model.generate_content.call_args[0][0]
            prompt_str = call_args[0]
            self.assertIn("Step 1", prompt_str)
            self.assertIn("Step 2", prompt_str)
            self.assertIn("imageMatchesComplaint", prompt_str)
            self.assertIn("imageValidationWarning", prompt_str)

    def test_lambda_handler_aborts_with_http_422_when_image_does_not_match(self):
        """Verify lambda_handler aborts immediately with HTTP 422 and exact JSON schema on mismatch."""
        with patch("lambda_function.run_rag_multimodal_analysis") as mock_rag, \
             patch("lambda_function.sync_to_airtable") as mock_airtable, \
             patch("app.rag.ingest_verified_repair_to_rag") as mock_pinecone:

            mock_rag.return_value = {
                "imageMatchesComplaint": False,
                "imageValidationWarning": "Photo Irrelevant: You described a pipe leak, but the photo shows an artwork. Please upload a real photo of the broken equipment.",
                "title": "Pipe Leak",
                "category": "Plumbing"
            }

            event = {
                "path": "/api/v1/tickets",
                "httpMethod": "POST",
                "headers": self.auth_headers,
                "body": json.dumps({
                    "complaint": "Pipe burst in basement",
                    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
                })
            }

            response = lambda_handler(event, None)
            self.assertEqual(response["statusCode"], 422)

            body = json.loads(response["body"])
            self.assertFalse(body["success"])
            self.assertTrue(body["warning"])
            self.assertFalse(body["imageMatchesComplaint"])
            self.assertEqual(
                body["message"],
                "Photo Irrelevant: You described a pipe leak, but the photo shows an artwork. Please upload a real photo of the broken equipment."
            )

            # Strict Invariant: Do NOT save to Airtable, and do NOT upsert to Pinecone
            mock_airtable.assert_not_called()
            mock_pinecone.assert_not_called()

    def test_verify_image_endpoint_rejection(self):
        """Verify POST /api/v1/tickets/verify-image returns 422 for irrelevant image."""
        with patch("app.ai.analyze_maintenance_fault") as mock_triage:
            mock_triage.return_value = {
                "imageMatchesComplaint": False,
                "imageValidationWarning": "Photo Irrelevant: You described a chiller malfunction, but the photo shows a pet cat. Please upload a real photo of the HVAC unit."
            }

            event = {
                "path": "/api/v1/tickets/verify-image",
                "httpMethod": "POST",
                "headers": self.auth_headers,
                "body": json.dumps({
                    "complaint": "Chiller 2 compressor not spinning",
                    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
                })
            }

            response = lambda_handler(event, None)
            self.assertEqual(response["statusCode"], 422)
            body = json.loads(response["body"])
            self.assertFalse(body["success"])
            self.assertFalse(body["imageMatchesComplaint"])
            self.assertIn("pet cat", body["message"])

    def test_verify_image_endpoint_success(self):
        """Verify POST /api/v1/tickets/verify-image returns 200 for matching image."""
        with patch("app.ai.analyze_maintenance_fault") as mock_triage:
            mock_triage.return_value = {
                "imageMatchesComplaint": True,
                "imageValidationWarning": None,
                "title": "Chiller Compressor Repair",
                "category": "HVAC",
                "urgency": "Urgent"
            }

            event = {
                "path": "/api/v1/tickets/verify-image",
                "httpMethod": "POST",
                "headers": self.auth_headers,
                "body": json.dumps({
                    "complaint": "Chiller 2 compressor not spinning",
                    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
                })
            }

            response = lambda_handler(event, None)
            self.assertEqual(response["statusCode"], 200)
            body = json.loads(response["body"])
            self.assertTrue(body["success"])
            self.assertTrue(body["imageMatchesComplaint"])


if __name__ == "__main__":
    unittest.main()
