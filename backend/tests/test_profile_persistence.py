"""
SmartFix AI - User Profile Persistence & Avatar Refresh Tests
Verifies that profile updates (avatar, name, department) persist across page refreshes,
backend API calls, and tenant storage.
"""
import unittest
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.api import handle_api_request
from app.auth import create_access_token
from app.storage import storage


class TestProfilePersistence(unittest.TestCase):
    def setUp(self):
        self.org_id = "org_campus_main"
        self.user_data = {
            "id": "usr_profile_test_101",
            "org_id": self.org_id,
            "orgId": self.org_id,
            "email": "abhinav_test@campus.edu",
            "name": "Abhinav Test",
            "role": "user",
            "approvalStatus": "Approved",
            "avatar": "https://images.unsplash.com/photo-initial-default?w=120",
            "department": "Campus Operations"
        }
        storage.save_user(self.user_data)
        self.token = create_access_token(self.user_data)
        self.auth_headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Origin": "http://localhost:5173"
        }

    def test_update_profile_avatar_persists_to_storage_and_me(self):
        """Updating avatar via PATCH /api/v1/users/profile immediately reflects in storage and GET /api/v1/auth/me."""
        new_avatar_url = "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&auto=format&fit=crop&q=80"
        update_payload = {
            "avatar": new_avatar_url,
            "name": "Abhinav Updated",
            "department": "Computer Science Faculty"
        }

        # 1. Send profile update request
        patch_res = handle_api_request(
            path="/api/v1/users/profile",
            method="PATCH",
            headers=self.auth_headers,
            body_data=update_payload
        )
        self.assertEqual(patch_res["statusCode"], 200)
        body = json.loads(patch_res["body"])
        self.assertTrue(body["success"])
        self.assertEqual(body["user"]["avatar"], new_avatar_url)
        self.assertEqual(body["user"]["name"], "Abhinav Updated")
        self.assertEqual(body["user"]["department"], "Computer Science Faculty")

        # 2. Simulate browser page refresh: GET /api/v1/auth/me
        me_res = handle_api_request(
            path="/api/v1/auth/me",
            method="GET",
            headers=self.auth_headers,
            body_data=None
        )
        self.assertEqual(me_res["statusCode"], 200)
        me_body = json.loads(me_res["body"])
        self.assertTrue(me_body["success"])
        # CRITICAL ASSERTION: The avatar must NOT revert to the initial default!
        self.assertEqual(me_body["user"]["avatar"], new_avatar_url)
        self.assertEqual(me_body["user"]["name"], "Abhinav Updated")

        # 3. Direct Storage verification: user record in persistent storage has updated avatar
        stored_user = storage.get_user_by_id(self.user_data["id"], self.org_id)
        self.assertIsNotNone(stored_user)
        self.assertEqual(stored_user["avatar"], new_avatar_url)
        self.assertEqual(stored_user["name"], "Abhinav Updated")

    def test_update_profile_with_data_url(self):
        """Verify updating with base64 data URL succeeds and is preserved."""
        data_url = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP"
        update_payload = {
            "avatar": data_url
        }

        patch_res = handle_api_request(
            path="/api/v1/users/profile",
            method="PATCH",
            headers=self.auth_headers,
            body_data=update_payload
        )
        self.assertEqual(patch_res["statusCode"], 200)
        body = json.loads(patch_res["body"])
        self.assertEqual(body["user"]["avatar"], data_url)

        me_res = handle_api_request(
            path="/api/v1/auth/me",
            method="GET",
            headers=self.auth_headers,
            body_data=None
        )
        self.assertEqual(json.loads(me_res["body"])["user"]["avatar"], data_url)

    def test_update_profile_unauthenticated_rejected(self):
        """Unauthenticated profile update request must be rejected with 401."""
        res = handle_api_request(
            path="/api/v1/users/profile",
            method="PATCH",
            headers={"Content-Type": "application/json"},
            body_data={"avatar": "https://example.com/photo.jpg"}
        )
        self.assertEqual(res["statusCode"], 401)


if __name__ == "__main__":
    unittest.main()
