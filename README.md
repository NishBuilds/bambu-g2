# Bambu G2

Even G2 glasses HUD for Bambu Lab printer status and simple print controls, plus a Linux MQTT bridge for public/user-owned installs.

This is an independent community project and is not affiliated with, endorsed by, or sponsored by Bambu Lab or Even Realities.

## What It Shows

- Print name, G-code state, progress, estimated minutes left, layer count, and stage.
- Nozzle, bed, and chamber temperatures.
- Speed preset and speed percentage.
- Printer error and HMS alert rows surfaced in the glasses app.
- Phone-side setup for the user-owned bridge URL.

## Controls

- Dashboard: swipe switches between Alerts and Controls; click opens Controls.
- Controls: swipe selects Pause/Resume or a speed preset; click sends the command.
- Alerts and Details: swipe scrolls; double click returns to Dashboard.
- Long press is unused because Even owns it for ending the foreground software.

## Quick Start

1. Install **Bambu G2** from Even Hub on your phone.

2. On a Linux server or Raspberry Pi that can reach your printer, run:

```bash
curl -fsSL https://raw.githubusercontent.com/NishBuilds/bambu-g2/main/scripts/bootstrap-linux.sh | bash
```

The installer creates `~/bambu-g2`, installs the Python bridge dependencies, builds the G2 app bundle when `npm` is available, guides you through printer setup, and installs the `bambu-g2-bridge` user service.

3. Enter the values from your Bambu printer's LAN/developer-mode screen:

- printer IP or hostname
- printer serial number
- LAN access code

4. Copy the printed Bridge URL into the Bambu G2 phone companion page:

```text
ws://<linux-server-ip>:8983/ws
```

5. Save and connect.

The bridge also prints a Plugin Loader URL:

```text
http://<linux-server-ip>:8983/app/
```

That URL serves the same G2 app bundle from your own Linux server and automatically points it at the same-origin `/ws` bridge.

If the packaged Even Hub app cannot connect to a private bridge URL because of origin whitelisting on your phone, use the Plugin Loader URL from the bridge. It is the intended local-first path for live printer control.

Manual install is also supported:

```bash
git clone https://github.com/NishBuilds/bambu-g2.git
cd bambu-g2
scripts/install-linux.sh
```

## Current Platform Boundary

This project intentionally does not bake in any personal server, printer IP, or Tailscale address.

The current Even Hub plugin runtime is a phone WebView. It can use browser networking such as `fetch()` and WebSocket, but every outbound origin must be declared in `app.json`, and wildcards are not supported. Bambu's local printer interface is MQTT on the printer broker, not browser WebSocket. Because of those two constraints, a public Even Hub package cannot honestly support "enter any private printer IP and connect directly" today.

The app therefore separates the G2 UX and Bambu protocol parsing from the transport. The included transport expects a user-controlled WebSocket bridge. When the app is hosted by the bridge, it defaults to the same-origin `/ws` endpoint.

The bridge message shape is:

```json
{
  "type": "connect",
  "printer": {
    "host": "192.168.1.42",
    "port": 8883,
    "serial": "00M00A000000000",
    "username": "bblp",
    "accessCode": "12345678",
    "reportTopic": "device/00M00A000000000/report",
    "requestTopic": "device/00M00A000000000/request"
  }
}
```

Printer status messages sent back to the app:

```json
{
  "type": "status",
  "payload": {
    "print": {
      "subtask_name": "Gridfinity Drawer",
      "gcode_state": "RUNNING",
      "mc_percent": 42,
      "mc_remaining_time": 81,
      "nozzle_temper": 220,
      "bed_temper": 60,
      "spd_lvl": 2
    }
  }
}
```

Commands sent from the app to the bridge:

```json
{
  "type": "command",
  "topic": "device/00M00A000000000/request",
  "payload": {
    "print": {
      "sequence_id": "12345",
      "command": "print_speed",
      "param": "2"
    }
  }
}
```

## Local Development

```bash
npm install
npm run dev
```

In a second terminal:

```bash
npm run sim
```

Generate a QR for real glasses:

```bash
npm run qr
```

Use the phone form to start Demo mode if no bridge is available.

Run the bridge locally:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r bridge/requirements.txt
.venv/bin/python bridge/bambu_g2_bridge.py setup
.venv/bin/python bridge/bambu_g2_bridge.py start
```

## Package

```bash
npm run pack
```

The output is:

```text
bambu-g2-v0.1.0.ehpk
```

## Even Hub Submission Notes

- Manifest name is `Bambu G2` and is under the 20-character limit.
- The app requests only `network` permission, for the user-configured local bridge.
- First launch on glasses renders setup instructions instead of a blank screen.
- Dashboard/setup double-click asks the system foreground layer to exit.
- No API keys, Bambu access codes, printer serial numbers, private IPs, or personal hostnames are committed.
- Privacy policy: [PRIVACY.md](PRIVACY.md)
- Submission copy: [EVEN_HUB_SUBMISSION.md](EVEN_HUB_SUBMISSION.md)

Suggested first release notes:

```text
Monitor Bambu Lab printer progress, temperatures, speed, and alerts from Even G2.
Includes a self-hosted Linux bridge for local MQTT access and basic pause/resume/speed controls.
```
