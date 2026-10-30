import unittest
import json
import os
import sys
import tempfile
import shutil
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.storage import JsonFileRepository
from app.api import handle_api_request
from app.auth import create_access_token, hash_password


class TestAdminSignupToggle(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.test_dir, "test_db.json")
        self.repo = JsonFileRepository(self.db_path)

        # Patch global storage in backend.app.api
        import app.api as api_mod
        self.orig_storage = api_mod.storage
        api_mod.storage = self.repo

        # Seed an admin and a regular user
        self.admin_user = {
            "id": "adm_test_001",
            "org_id": "org_campus_main",
            "name": "Super Admin",
            "email": "superadmin@campus.edu",
            "passwordHash": hash_password("adminpass123"),
            "role": "admin",
            "roleDisplay": "Administrator",
            "approvalStatus": "Approved",
            "approved": True,
            "status": "approved",
            "createdAt": datetime.utcnow().isoformat() + "Z"
        }
        self.repo.save_user(self.admin_user)

        self.regular_user = {
            "id": "usr_test_001",
            "org_id": "org_campus_main",
            "name": "Regular User",
            "email": "user@campus.edu",
            "passwordHash": hash_password("userpass123"),
            "role": "user",
            "roleDisplay": "Campus User",
            "approvalStatus": "Approved",
            "approved": True,
            "status": "approved",
            "createdAt": datetime.utcnow().isoformat() + "Z"
        }
        self.repo.save_user(self.regular_user)

        self.admin_token = create_access_token(self.admin_user)
        self.user_token = create_access_token(self.regular_user)

    def tearDown(self):
        import app.api as api_mod
        api_mod.storage = self.orig_storage
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_public_settings_get(self):
        """Unauthenticated clients can read public settings including allowAdminSignup."""
        res = handle_api_request(method="GET", path="/api/v1/settings", headers={}, body_data=None)
        self.assertEqual(res["statusCode"], 200)
        body = json.loads(res["body"])
        self.assertTrue(body["success"])
        self.assertIn("allowAdminSignup", body["settings"])
        self.assertTrue(body["settings"]["allowAdminSignup"])

    def test_admin_signup_allowed_when_enabled(self):
        """When allowAdminSignup is True (default), admin registration succeeds and is auto-approved."""
        self.repo.save_setting("allow_admin_signup", True)

        payload = {
            "name": "New Admin User",
            "email": "newadmin@campus.edu",
            "password": "strongpassword123",
            "role": "admin",
            "org_id": "org_campus_main"
        }
        res = handle_api_request(method="POST", path="/api/v1/auth/register", headers={}, body_data=payload)
        self.assertEqual(res["statusCode"], 201)
        body = json.loads(res["body"])
        self.assertTrue(body["success"])
        self.assertIn("approved", body["message"].lower())
        self.assertEqual(body["user"]["role"], "admin")
        self.assertEqual(body["user"]["approvalStatus"], "Approved")
        self.assertTrue(body["user"]["approved"])

        # Immediate login succeeds
        login_res = handle_api_request(method="POST", path="/api/v1/auth/login", headers={}, body_data={
            "email": "newadmin@campus.edu",
            "password": "strongpassword123"
        })
        self.assertEqual(login_res["statusCode"], 200)

    def test_admin_signup_blocked_when_disabled(self):
        """When allowAdminSignup is False, admin registration is blocked with 403."""
        self.repo.save_setting("allow_admin_signup", False)

        payload = {
            "name": "Intruder Admin",
            "email": "intruder@campus.edu",
            "password": "strongpassword123",
            "role": "admin",
            "org_id": "org_campus_main"
        }
        res = handle_api_request(method="POST", path="/api/v1/auth/register", headers={}, body_data=payload)
        self.assertEqual(res["statusCode"], 403)
        body = json.loads(res["body"])
        self.assertFalse(body["success"])
        self.assertEqual(
            body["error"],
            "Administrator registration is currently locked by system security settings."
        )

    def test_non_admin_cannot_update_settings(self):
        """Regular users or anonymous callers cannot modify system settings."""
        # Anonymous
        res_anon = handle_api_request(method="PATCH", path="/api/v1/admin/settings", headers={}, body_data={"allowAdminSignup": False})
        self.assertEqual(res_anon["statusCode"], 401)

        # Non-admin user
        headers_user = {"Authorization": f"Bearer {self.user_token}"}
        res_user = handle_api_request(method="PATCH", path="/api/v1/admin/settings", headers=headers_user, body_data={"allowAdminSignup": False})
        self.assertEqual(res_user["statusCode"], 403)

    def test_admin_can_update_settings(self):
        """Admin can toggle allowAdminSignup through PATCH /api/v1/admin/settings."""
        headers_admin = {"Authorization": f"Bearer {self.admin_token}"}

        # Toggle to False
        res = handle_api_request(method="PATCH", path="/api/v1/admin/settings", headers=headers_admin, body_data={"allowAdminSignup": False})
        self.assertEqual(res["statusCode"], 200)
        body = json.loads(res["body"])
        self.assertTrue(body["success"])
        self.assertFalse(body["settings"]["allowAdminSignup"])
        self.assertFalse(self.repo.get_setting("allow_admin_signup"))

        # Verify public settings reflects False
        pub_res = handle_api_request(method="GET", path="/api/v1/settings", headers={}, body_data=None)
        pub_body = json.loads(pub_res["body"])
        self.assertFalse(pub_body["settings"]["allowAdminSignup"])

        # Toggle back to True
        res_on = handle_api_request(method="PATCH", path="/api/v1/admin/settings", headers=headers_admin, body_data={"allowAdminSignup": True})
        self.assertEqual(res_on["statusCode"], 200)
        body_on = json.loads(res_on["body"])
        self.assertTrue(body_on["settings"]["allowAdminSignup"])
        self.assertTrue(self.repo.get_setting("allow_admin_signup"))


if __name__ == "__main__":
    unittest.main()
