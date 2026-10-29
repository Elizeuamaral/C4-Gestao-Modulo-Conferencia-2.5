"""Windows desktop launcher for the packaged C4 Gestão application."""

from __future__ import annotations

import threading
import time
import webbrowser

import uvicorn

from backend.app.core.config import settings


HOST = "127.0.0.1"
PORT = settings.api_port
APP_URL = f"http://{HOST}:{PORT}"


def _open_browser() -> None:
    """Open the local application after Uvicorn has had time to start."""
    time.sleep(1.5)
    webbrowser.open(APP_URL, new=2)


def main() -> None:
    """Run the local API and bundled frontend in one application process."""
    threading.Thread(target=_open_browser, daemon=True).start()
    uvicorn.run(
        "backend.app.main:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_level="warning",
    )


if __name__ == "__main__":
    main()
