from __future__ import annotations

import unittest

from backend.app.core.config import Settings


class SettingsTests(unittest.TestCase):
    def test_safe_defaults_keep_api_on_loopback(self) -> None:
        settings = Settings(_env_file=None)
        self.assertEqual(settings.api_host, "127.0.0.1")
        self.assertEqual(settings.api_port, 8000)
        self.assertEqual(settings.browser_host, "127.0.0.1")

    def test_lan_values_are_explicit_and_cors_is_normalized(self) -> None:
        settings = Settings(
            _env_file=None,
            C4_API_HOST="0.0.0.0",
            C4_API_PORT=8100,
            C4_BROWSER_HOST="127.0.0.1",
            C4_CORS_ORIGINS=" http://192.168.1.10:3000, ,http://localhost:3000 ",
        )
        self.assertEqual(settings.api_host, "0.0.0.0")
        self.assertEqual(settings.api_port, 8100)
        self.assertEqual(settings.cors_origins_list, ["http://192.168.1.10:3000", "http://localhost:3000"])
