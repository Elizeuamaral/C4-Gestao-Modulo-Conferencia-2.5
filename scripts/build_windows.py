"""Build the C4 Gestão local Windows package from the repository root."""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str]) -> None:
    # Windows .cmd files (including npm.cmd) must be launched through cmd.exe.
    if command and command[0].lower() == "npm":
        npm_cmd = shutil.which("npm.cmd") or shutil.which("npm")
        if not npm_cmd:
            raise FileNotFoundError(
                "npm não foi encontrado no PATH. Instale o Node.js LTS "
                "ou adicione a pasta do Node.js ao PATH do Windows."
            )
        command = ["cmd.exe", "/c", npm_cmd, *command[1:]]

    print("\n==>", " ".join(command), flush=True)
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> None:
    run(["npm", "ci"])
    run(["npm", "run", "lint"])
    run(["npm", "run", "build"])
    run([sys.executable, "-m", "pip", "install", "-r", "requirements-desktop.txt"])
    run([
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
        "--name", "C4Gestao", "--distpath", "build/desktop", "--windowed", "--onedir", "--paths", ".",
        "--add-data", "dist;frontend/dist", "--collect-all", "uvicorn",
        "--collect-all", "sqlalchemy", "--collect-all", "pydantic_settings",
        "--collect-submodules", "backend",
        "backend/desktop.py",
    ])
    print("\nPacote de teste gerado em build/desktop/C4Gestao/C4Gestao.exe")


if __name__ == "__main__":
    main()
