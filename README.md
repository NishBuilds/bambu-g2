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

## Recommended Public Setup

1. Install the Linux bridge from:

```text
https://github.com/NishBuilds/bambu-g2
```

2. On the Linux server:

```bash
git clone https://github.com/NishBuilds/bambu-g2.git
cd bambu-g2
scripts/install-linux.sh
```

The installer creates a Python venv, installs the bridge dependencies, builds the G2 app bundle when `npm` is available, guides you through printer setup, and installs the `bambu-g2-bridge` user service.

3. Use the bridge's printed Plugin Loader URL, for example:

```text
http://<linux-server-ip>:8983/app/
```

4. If you are testing the `.ehpk` package directly, enter the bridge WebSocket URL shown by the bridge:

```text
ws://<linux-server-ip>:8983/ws
```

The `.ehpk` is still useful for Even Hub review and distribution, but the smoothest real-world install is the Plugin Loader URL printed by the bridge. That URL serves the same G2 app bundle from the user's own Linux server, so the app can use the same-origin `/ws` bridge without a hard-coded LAN address.

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

Suggested first release notes:

```text
Monitor Bambu Lab printer progress, temperatures, speed, and alerts from Even G2.
Includes a self-hosted Linux bridge for local MQTT access and basic pause/resume/speed controls.
```
