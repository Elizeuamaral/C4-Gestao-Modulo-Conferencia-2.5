from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.api.dependencies import SESSION_IDLE_MINUTES, SESSION_MAX_HOURS, get_db
from backend.app.db.models import AuthSession, Base, User
from backend.app.main import create_app


class AuthApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        database_path = Path(self.temp_dir.name) / "auth-tests.sqlite"
        self.engine = create_engine(
            f"sqlite:///{database_path.as_posix()}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )

        def get_test_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app = create_app()
        self.app.dependency_overrides[get_db] = get_test_db
        self.client = TestClient(self.app, client=("127.0.0.1", 50000))

    def tearDown(self) -> None:
        self.client.close()
        self.app.dependency_overrides.clear()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def create_admin(self) -> tuple[str, dict[str, str]]:
        response = self.client.post(
            "/auth/setup-admin",
            json={
                "full_name": "Administrador Inicial",
                "username": "admin",
                "password": "initial-password-123",
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        result = response.json()
        self.assertNotIn("password", result["user"])
        self.assertNotIn("password_hash", result["user"])
        token = result["access_token"]
        return token, {"Authorization": f"Bearer {token}"}

    def create_user(
        self,
        headers: dict[str, str],
        *,
        username: str = "conferente",
        role: str = "CONFERENTE",
        password: str = "user-password-123",
    ) -> dict[str, object]:
        response = self.client.post(
            "/auth/users",
            headers=headers,
            json={
                "full_name": "Usuário de Teste",
                "username": username,
                "password": password,
                "role": role,
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_setup_status_initial_admin_and_second_setup_block(self) -> None:
        status_response = self.client.get("/auth/setup-status")
        self.assertEqual(status_response.status_code, 200)
        self.assertEqual(status_response.json(), {"setup_required": True})

        _, admin_headers = self.create_admin()
        self.assertEqual(
            self.client.get("/auth/setup-status").json(),
            {"setup_required": False},
        )
        duplicate = self.client.post(
            "/auth/setup-admin",
            json={
                "full_name": "Outro Administrador",
                "username": "other-admin",
                "password": "another-password-123",
            },
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(self.client.get("/auth/me", headers=admin_headers).status_code, 200)

    def test_initial_setup_rejects_non_loopback_clients(self) -> None:
        self.client.close()
        self.client = TestClient(self.app, client=("192.0.2.10", 50000))
        response = self.client.post(
            "/auth/setup-admin",
            json={
                "full_name": "Administrador Remoto",
                "username": "remote-admin",
                "password": "initial-password-123",
            },
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            self.client.get("/auth/setup-status").json(),
            {"setup_required": True},
        )

    def test_login_accepts_valid_credentials_and_hides_password_data(self) -> None:
        self.create_admin()
        response = self.client.post(
            "/auth/login",
            json={"username": "ADMIN", "password": "initial-password-123"},
        )
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["token_type"], "bearer")
        self.assertNotIn("password", result["user"])
        self.assertNotIn("password_hash", result["user"])
        self.assertNotIn("token_hash", result)

    def test_invalid_and_inactive_login_errors_do_not_disclose_account_state(self) -> None:
        _, admin_headers = self.create_admin()
        self.create_user(admin_headers)
        invalid_password = self.client.post(
            "/auth/login",
            json={"username": "conferente", "password": "wrong-password"},
        )
        unknown_user = self.client.post(
            "/auth/login",
            json={"username": "missing-user", "password": "wrong-password"},
        )
        self.assertEqual(invalid_password.status_code, 401)
        self.assertEqual(invalid_password.json(), unknown_user.json())

        user = self.client.get(
            "/auth/users?include_inactive=true", headers=admin_headers
        ).json()[1]
        deactivated = self.client.post(
            f"/auth/users/{user['id']}/deactivate",
            headers=admin_headers,
        )
        self.assertEqual(deactivated.status_code, 200)
        inactive = self.client.post(
            "/auth/login",
            json={"username": "conferente", "password": "user-password-123"},
        )
        self.assertEqual(inactive.status_code, 401)
        self.assertEqual(inactive.json(), invalid_password.json())

    def test_authenticated_identity_and_protected_routes(self) -> None:
        token, headers = self.create_admin()
        self.assertEqual(self.client.get("/auth/me").status_code, 401)
        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 200)
        self.assertEqual(
            self.client.get("/auth/me", headers={"Authorization": "Bearer invalid"}).status_code,
            401,
        )
        self.assertEqual(self.client.get("/products").status_code, 401)
        self.assertEqual(
            self.client.get(
                "/products", headers={"Authorization": f"Bearer {token}-invalid"}
            ).status_code,
            401,
        )
        self.assertEqual(self.client.get("/products", headers=headers).status_code, 200)

    def test_user_creation_listing_duplicate_and_admin_authorization(self) -> None:
        _, admin_headers = self.create_admin()
        user = self.create_user(admin_headers)
        users = self.client.get("/auth/users", headers=admin_headers)
        self.assertEqual(users.status_code, 200)
        self.assertEqual({item["username"] for item in users.json()}, {"admin", "conferente"})
        self.assertNotIn("password_hash", users.text)

        duplicate = self.client.post(
            "/auth/users",
            headers=admin_headers,
            json={
                "full_name": "Duplicado",
                "username": "CONFERENTE",
                "password": "another-password-123",
                "role": "CONFERENTE",
            },
        )
        self.assertEqual(duplicate.status_code, 409)

        login = self.client.post(
            "/auth/login",
            json={"username": user["username"], "password": "user-password-123"},
        )
        user_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        self.assertEqual(self.client.get("/auth/users", headers=user_headers).status_code, 403)
        forbidden_create = self.client.post(
            "/auth/users",
            headers=user_headers,
            json={
                "full_name": "Sem Privilégio",
                "username": "unauthorized",
                "password": "another-password-123",
            },
        )
        self.assertEqual(forbidden_create.status_code, 403)

    def test_user_update_and_last_active_admin_protection(self) -> None:
        _, admin_headers = self.create_admin()
        user = self.create_user(admin_headers)
        update = self.client.put(
            f"/auth/users/{user['id']}",
            headers=admin_headers,
            json={"full_name": "Nome Atualizado"},
        )
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.json()["full_name"], "Nome Atualizado")
        promotion = self.client.put(
            f"/auth/users/{user['id']}",
            headers=admin_headers,
            json={"role": "ADMIN"},
        )
        self.assertEqual(promotion.status_code, 200)
        self.assertEqual(promotion.json()["role"], "ADMIN")
        demotion = self.client.put(
            f"/auth/users/{user['id']}",
            headers=admin_headers,
            json={"role": "CONFERENTE"},
        )
        self.assertEqual(demotion.status_code, 200)

        admin = self.client.get("/auth/me", headers=admin_headers).json()
        last_admin_demotion = self.client.put(
            f"/auth/users/{admin['id']}",
            headers=admin_headers,
            json={"role": "CONFERENTE"},
        )
        self.assertEqual(last_admin_demotion.status_code, 409)
        deactivation = self.client.post(
            f"/auth/users/{admin['id']}/deactivate",
            headers=admin_headers,
        )
        self.assertEqual(deactivation.status_code, 409)

    def test_last_active_admin_cannot_be_deactivated_by_another_admin(self) -> None:
        _, first_admin_headers = self.create_admin()
        second_admin = self.create_user(
            first_admin_headers,
            username="second-admin",
            role="ADMIN",
        )
        first_admin = self.client.get(
            "/auth/me", headers=first_admin_headers
        ).json()
        second_login = self.client.post(
            "/auth/login",
            json={
                "username": "second-admin",
                "password": "user-password-123",
            },
        )
        second_admin_headers = {
            "Authorization": f"Bearer {second_login.json()['access_token']}"
        }

        deactivate_first = self.client.post(
            f"/auth/users/{first_admin['id']}/deactivate",
            headers=second_admin_headers,
        )
        self.assertEqual(deactivate_first.status_code, 200)
        deactivate_last = self.client.post(
            f"/auth/users/{second_admin['id']}/deactivate",
            headers=second_admin_headers,
        )
        self.assertEqual(deactivate_last.status_code, 409)
        demote_last = self.client.put(
            f"/auth/users/{second_admin['id']}",
            headers=second_admin_headers,
            json={"role": "CONFERENTE"},
        )
        self.assertEqual(demote_last.status_code, 409)

    def test_deactivation_and_reactivation_invalidate_existing_sessions(self) -> None:
        _, admin_headers = self.create_admin()
        user = self.create_user(admin_headers)
        login = self.client.post(
            "/auth/login",
            json={"username": "conferente", "password": "user-password-123"},
        )
        user_token = login.json()["access_token"]
        user_headers = {"Authorization": f"Bearer {user_token}"}

        deactivated = self.client.post(
            f"/auth/users/{user['id']}/deactivate",
            headers=admin_headers,
        )
        self.assertEqual(deactivated.status_code, 200)
        self.assertEqual(self.client.get("/auth/me", headers=user_headers).status_code, 401)
        self.assertEqual(
            self.client.post(
                f"/auth/users/{user['id']}/activate",
                headers=admin_headers,
            ).status_code,
            200,
        )
        self.assertEqual(self.client.get("/auth/me", headers=user_headers).status_code, 401)

    def test_password_reset_and_self_change_revoke_sessions(self) -> None:
        _, admin_headers = self.create_admin()
        user = self.create_user(admin_headers)
        first_login = self.client.post(
            "/auth/login",
            json={"username": "conferente", "password": "user-password-123"},
        )
        old_headers = {"Authorization": f"Bearer {first_login.json()['access_token']}"}
        reset = self.client.post(
            f"/auth/users/{user['id']}/reset-password",
            headers=admin_headers,
            json={"new_password": "reset-password-123"},
        )
        self.assertEqual(reset.status_code, 204)
        self.assertEqual(self.client.get("/auth/me", headers=old_headers).status_code, 401)
        self.assertEqual(
            self.client.post(
                "/auth/login",
                json={"username": "conferente", "password": "user-password-123"},
            ).status_code,
            401,
        )

        new_login = self.client.post(
            "/auth/login",
            json={"username": "conferente", "password": "reset-password-123"},
        )
        new_headers = {"Authorization": f"Bearer {new_login.json()['access_token']}"}
        changed = self.client.put(
            "/auth/me/password",
            headers=new_headers,
            json={
                "current_password": "reset-password-123",
                "new_password": "changed-password-123",
            },
        )
        self.assertEqual(changed.status_code, 204)
        self.assertEqual(self.client.get("/auth/me", headers=new_headers).status_code, 401)
        self.assertEqual(
            self.client.post(
                "/auth/login",
                json={"username": "conferente", "password": "changed-password-123"},
            ).status_code,
            200,
        )

    def test_logout_invalidates_session(self) -> None:
        _, headers = self.create_admin()
        self.assertEqual(self.client.post("/auth/logout").status_code, 401)
        self.assertEqual(
            self.client.post(
                "/auth/logout",
                headers={"Authorization": "Bearer invalid"},
            ).status_code,
            401,
        )
        logout = self.client.post("/auth/logout", headers=headers)
        self.assertEqual(logout.status_code, 204)
        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 401)

    def test_session_tokens_are_random_and_only_hashes_are_persisted(self) -> None:
        _, headers = self.create_admin()
        token = headers["Authorization"].removeprefix("Bearer ")
        with self.session_factory() as db:
            session = db.query(AuthSession).one()
            self.assertNotEqual(session.token_hash, token)
            self.assertEqual(len(session.token_hash), 64)
            self.assertEqual(db.query(User).count(), 1)

    def test_expired_session_is_rejected_and_removed(self) -> None:
        _, headers = self.create_admin()
        with self.session_factory() as db:
            session = db.query(AuthSession).one()
            session.expires_at = (
                datetime.now(timezone.utc) - timedelta(seconds=1)
            ).isoformat()
            db.commit()

        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 401)
        with self.session_factory() as db:
            self.assertEqual(db.query(AuthSession).count(), 0)

    def test_new_session_uses_short_idle_window_and_slides_on_use(self) -> None:
        _, headers = self.create_admin()
        now = datetime.now(timezone.utc)
        with self.session_factory() as db:
            session = db.query(AuthSession).one()
            first_expiry = datetime.fromisoformat(session.expires_at)
            self.assertLessEqual(first_expiry - now, timedelta(minutes=SESSION_IDLE_MINUTES, seconds=5))
            session.expires_at = (now + timedelta(seconds=60)).isoformat()
            db.commit()

        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 200)
        with self.session_factory() as db:
            extended = datetime.fromisoformat(db.query(AuthSession).one().expires_at)
            self.assertGreater(extended - now, timedelta(minutes=SESSION_IDLE_MINUTES - 1))

    def test_idle_session_expires_without_heartbeat(self) -> None:
        _, headers = self.create_admin()
        with self.session_factory() as db:
            session = db.query(AuthSession).one()
            session.expires_at = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
            db.commit()
        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 401)
        self.assertEqual(self.client.get("/products", headers=headers).status_code, 401)

    def test_session_cannot_slide_beyond_absolute_maximum(self) -> None:
        _, headers = self.create_admin()
        now = datetime.now(timezone.utc)
        with self.session_factory() as db:
            session = db.query(AuthSession).one()
            session.created_at = (now - timedelta(hours=SESSION_MAX_HOURS, seconds=-30)).isoformat()
            session.expires_at = (now + timedelta(seconds=10)).isoformat()
            db.commit()
        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 200)
        with self.session_factory() as db:
            capped = datetime.fromisoformat(db.query(AuthSession).one().expires_at)
            self.assertLessEqual(capped - now, timedelta(seconds=35))
        with self.session_factory() as db:
            session = db.query(AuthSession).one()
            session.created_at = (now - timedelta(hours=SESSION_MAX_HOURS + 1)).isoformat()
            db.commit()
        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 401)

    def test_two_users_have_independent_identities_and_sessions(self) -> None:
        _, admin_headers = self.create_admin()
        self.create_user(admin_headers, username="maria")
        login = self.client.post("/auth/login", json={"username": "maria", "password": "user-password-123"})
        maria_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        self.assertEqual(self.client.get("/auth/me", headers=admin_headers).json()["username"], "admin")
        self.assertEqual(self.client.get("/auth/me", headers=maria_headers).json()["username"], "maria")
        self.assertEqual(self.client.post("/auth/logout", headers=maria_headers).status_code, 204)
        self.assertEqual(self.client.get("/auth/me", headers=maria_headers).status_code, 401)
        self.assertEqual(self.client.get("/auth/me", headers=admin_headers).status_code, 200)

    def test_operational_api_routes_remain_registered_and_protected(self) -> None:
        paths = self.client.get("/openapi.json").json()["paths"]
        for path in (
            "/products",
            "/locations",
            "/checkers",
            "/stock",
            "/movements",
        ):
            with self.subTest(path=path):
                self.assertIn(path, paths)
                self.assertEqual(self.client.get(path).status_code, 401)

    def test_root_and_authentication_openapi_routes_are_registered(self) -> None:
        self.assertEqual(self.client.get("/").status_code, 200)
        paths = self.client.get("/openapi.json").json()["paths"]
        for path in (
            "/auth/setup-status",
            "/auth/setup-admin",
            "/auth/login",
            "/auth/logout",
            "/auth/me",
            "/auth/me/password",
            "/auth/users",
            "/auth/users/{user_id}",
            "/auth/users/{user_id}/reset-password",
            "/auth/users/{user_id}/deactivate",
            "/auth/users/{user_id}/activate",
        ):
            with self.subTest(path=path):
                self.assertIn(path, paths)


if __name__ == "__main__":
    unittest.main()
