"""
SmartFix AI - Image Payload Lifecycle & Thumbnail Rendering Verification Tests
Verifies image persistence across 'image', 'photo', and 'imageUrl' keys in lambda_function.py,
api.py, storage, and frontend payload compatibility.
"""
import unittest
import json
import os
import sys

# Ensure backend root is on Python sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from lambda_function import lambda_handler, sync_to_airtable
from app.auth import create_access_token
from app.storage import storage


class TestImagePayloadLifecycle(unittest.TestCase):
    def setUp(self):
        self.org_id = "org_campus_main"
        self.user_data = {
            "id": "usr_img_test_1",
            "org_id": self.org_id,
            "email": "imagetest@campus.edu",
            "name": "Image Tester",
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

    def test_lambda_handler_preserves_image_across_all_keys(self):
        """Verify lambda_handler guarantees 'image', 'photo', and 'imageUrl' in returned ticket JSON."""
        valid_b64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
        
        event = {
            "path": "/api/v1/tickets",
            "httpMethod": "POST",
            "headers": self.auth_headers,
            "body": json.dumps({
                "complaint": "AC unit in server room 204 leaking water onto rack",
                "image": valid_b64,
                "photo": valid_b64,
                "imageUrl": valid_b64
            })
        }

        response = lambda_handler(event, None)
        self.assertEqual(response["statusCode"], 201)

        body = json.loads(response["body"])
        self.assertTrue(body["success"])
        ticket = body["ticket"]
        self.created_ticket_ids.append(ticket["id"])

        # Check all three keys are populated with the valid image payload
        self.assertIn("image", ticket)
        self.assertIn("photo", ticket)
        self.assertIn("imageUrl", ticket)
        self.assertEqual(ticket["image"], valid_b64)
        self.assertEqual(ticket["photo"], valid_b64)
        self.assertEqual(ticket["imageUrl"], valid_b64)

    def test_airtable_sync_safe_fallback(self):
        """Verify Airtable sync gracefully handles absent credentials without exceptions."""
        ticket = {
            "id": "TCK-AIRTEST-01",
            "title": "Air filter replacement",
            "description": "Dirty intake filter",
            "image": "https://example.com/filter.jpg"
        }
        # When environment variables are unset, it should safely return False
        result = sync_to_airtable(ticket)
        self.assertFalse(result)

    def test_ticket_listing_includes_all_image_keys(self):
        """Verify GET /api/v1/tickets populates image, photo, and imageUrl on each ticket."""
        valid_b64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
        event_create = {
            "path": "/api/v1/tickets",
            "httpMethod": "POST",
            "headers": self.auth_headers,
            "body": json.dumps({
                "complaint": "Elevator door stuck on 3rd floor",
                "image": valid_b64,
                "photo": valid_b64,
                "imageUrl": valid_b64
            })
        }
        res_create = lambda_handler(event_create, None)
        ticket = json.loads(res_create["body"])["ticket"]
        self.created_ticket_ids.append(ticket["id"])

        event_get = {
            "path": "/api/v1/tickets",
            "httpMethod": "GET",
            "headers": self.auth_headers
        }
        res_get = lambda_handler(event_get, None)
        self.assertEqual(res_get["statusCode"], 200)

        tickets = json.loads(res_get["body"])["tickets"]
        matched = [t for t in tickets if t["id"] == ticket["id"]]
        self.assertTrue(len(matched) > 0)
        found = matched[0]
        self.assertEqual(found["image"], valid_b64)
        self.assertEqual(found["photo"], valid_b64)
        self.assertEqual(found["imageUrl"], valid_b64)


if __name__ == "__main__":
    unittest.main()
