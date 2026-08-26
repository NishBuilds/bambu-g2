# Bambu G2 Bridge

Small Linux bridge for the Bambu G2 Even app. It connects to a Bambu Lab printer with local MQTT, then exposes:

- `GET /` - bridge status and setup notes.
- `GET /api/health` - JSON health.
- `GET /api/snapshot` - last raw Bambu payload.
- `GET /app/` - the built Even G2 app bundle.
- `WS /ws` - status stream and command channel for the G2 app.

## Install

One-line install on Linux or Raspberry Pi:

```bash
curl -fsSL https://raw.githubusercontent.com/NishBuilds/bambu-g2/main/scripts/bootstrap-linux.sh | bash
```

Manual install:

```bash
git clone https://github.com/NishBuilds/bambu-g2.git
cd bambu-g2
scripts/install-linux.sh
```

The setup command prints:

```text
Plugin Loader: http://<linux-server-ip>:8983/app/
Bridge URL:    ws://<linux-server-ip>:8983/ws
```

For the easiest glasses setup, scan the Plugin Loader URL. That loads the app from the same Linux server as the WebSocket bridge.

## Run As A Service

```bash
python3 bridge/install_service.py
systemctl --user status bambu-g2-bridge.service --no-pager
```

If your Linux distribution does not keep user services alive after logout, run:

```bash
loginctl enable-linger "$USER"
```

## Bambu Requirements

- The printer must be reachable from the Linux server.
- LAN/developer-mode MQTT access must be enabled on the printer.
- You need the printer IP or hostname, serial number, and LAN access code.

Keep the bridge on a trusted LAN or VPN. It can pause/resume prints and change speed, so do not expose it directly to the public internet.
