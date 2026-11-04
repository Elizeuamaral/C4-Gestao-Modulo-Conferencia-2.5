"""Windows desktop launcher for the packaged C4 Gestão application."""

from __future__ import annotations

import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser

import uvicorn

from backend.app.core.config import settings


HOST = settings.api_host
PORT = settings.api_port
# 0.0.0.0 is a bind address, not a URL a browser can open.
BROWSER_HOST = settings.browser_host
APP_URL = f"http://{BROWSER_HOST}:{PORT}"


def _wait_until_ready() -> None:
    """Open the browser only after this local API responds to its health check."""
    deadline = time.monotonic() + 30
    health_url = f"{APP_URL}/health"
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(health_url, timeout=1) as response:
                if response.status == 200:
                    webbrowser.open(APP_URL, new=2)
                    return
        except (OSError, urllib.error.URLError):
            time.sleep(0.4)
    webbrowser.open(APP_URL, new=2)


def _ensure_port_available() -> None:
    """Fail clearly instead of opening another app on a used port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((HOST, PORT))
        except OSError as exc:
            raise RuntimeError(
                f"A porta local {PORT} já está em uso. Feche outra instância do C4 Gestão "
                "ou o programa que está usando essa porta e tente novamente."
            ) from exc


def _ensure_std_streams() -> None:
    """Windowed PyInstaller builds have no console; uvicorn logging needs real streams."""
    for name in ("stdout", "stderr"):
        if getattr(sys, name) is None:
            setattr(sys, name, open(os.devnull, "w", encoding="utf-8"))


def main() -> None:
    """Run the local API and bundled frontend in one application process."""
    _ensure_std_streams()
    _ensure_port_available()
    threading.Thread(target=_wait_until_ready, daemon=True).start()
    uvicorn.run(
        "backend.app.main:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_level="warning",
    )


if __name__ == "__main__":
    main()
