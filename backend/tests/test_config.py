from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from backend.app.core.config import Settings


class SettingsTests(unittest.TestCase):
    def test_safe_defaults_keep_api_on_loopback(self) -> None:
        settings = Settings(_env_file=None)
        self.assertEqual(settings.api_host, "127.0.0.1")
        self.assertEqual(settings.api_port, 8000)
        self.assertEqual(settings.browser_host, "127.0.0.1")
        self.assertEqual(settings.cors_origin_regex, "")

    def test_lan_values_are_explicit_and_cors_is_normalized(self) -> None:
        settings = Settings(
            _env_file=None,
            C4_API_HOST="0.0.0.0",
            C4_API_PORT=8100,
            C4_BROWSER_HOST="127.0.0.1",
            C4_CORS_ORIGINS=" http://192.168.1.10:3000, ,http://localhost:3000 ",
            C4_CORS_ORIGIN_REGEX=r"^https?://192\.168\.1\.(?:[1-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-4]):3000$",
        )
        self.assertEqual(settings.api_host, "0.0.0.0")
        self.assertEqual(settings.api_port, 8100)
        self.assertEqual(settings.cors_origins_list, ["http://192.168.1.10:3000", "http://localhost:3000"])
        self.assertIn("192\\.168\\.1", settings.cors_origin_regex)

    def test_cors_requires_an_explicit_origin_when_regex_is_empty(self) -> None:
        from backend.app.core import config
        from backend.app.main import create_app

        previous_origins = config.settings.cors_origins
        previous_regex = config.settings.cors_origin_regex
        config.settings.cors_origins = "http://192.168.1.10:3000"
        config.settings.cors_origin_regex = ""
        try:
            client = TestClient(create_app())
            allowed = client.options(
                "/auth/setup-status",
                headers={
                    "Origin": "http://192.168.1.10:3000",
                    "Access-Control-Request-Method": "GET",
                },
            )
            blocked = client.options(
                "/auth/setup-status",
                headers={
                    "Origin": "http://192.168.1.11:3000",
                    "Access-Control-Request-Method": "GET",
                },
            )
            self.assertEqual(allowed.headers.get("access-control-allow-origin"), "http://192.168.1.10:3000")
            self.assertIsNone(blocked.headers.get("access-control-allow-origin"))
            client.close()
        finally:
            config.settings.cors_origins = previous_origins
            config.settings.cors_origin_regex = previous_regex
