#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
VENV = PROJECT_ROOT / ".venv"
PYTHON = VENV / "bin" / "python"
REQUIREMENTS = PROJECT_ROOT / "bridge" / "requirements.txt"
UNIT_DIR = Path.home() / ".config" / "systemd" / "user"
UNIT_PATH = UNIT_DIR / "bambu-g2-bridge.service"


def run(args: list[str]) -> None:
    result = subprocess.run(args, cwd=PROJECT_ROOT)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> None:
    if not PYTHON.exists():
        run([sys.executable, "-m", "venv", str(VENV)])
    run([str(PYTHON), "-m", "pip", "install", "-r", str(REQUIREMENTS)])

    UNIT_DIR.mkdir(parents=True, exist_ok=True)
    UNIT_PATH.write_text(
        f"""[Unit]
Description=Bambu G2 MQTT bridge
After=network-online.target

[Service]
Type=simple
WorkingDirectory={PROJECT_ROOT}
ExecStart={PYTHON} {PROJECT_ROOT / "bridge" / "bambu_g2_bridge.py"} start
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
""",
        encoding="utf-8",
    )
    print(f"Wrote {UNIT_PATH}")
    run(["systemctl", "--user", "daemon-reload"])
    run(["systemctl", "--user", "enable", "--now", "bambu-g2-bridge.service"])
    print("Service install requested.")
    print("Check status with:")
    print("  systemctl --user status bambu-g2-bridge.service --no-pager")


if __name__ == "__main__":
    main()
