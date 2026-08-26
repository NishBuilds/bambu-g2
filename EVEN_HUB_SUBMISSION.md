# Even Hub Submission Notes

## App Name

Bambu G2

## Short Description

Monitor Bambu Lab printer progress, temperatures, speed, and alerts from Even G2.

## Long Description

Bambu G2 shows live Bambu Lab printer status on Even G2 glasses through a local, self-hosted Linux bridge. It displays print name, G-code state, progress, time remaining, nozzle/bed/chamber temperatures, layer count, speed level, and printer alerts. The controls view can pause/resume a print and change speed presets.

The bridge runs on the user's own Linux server or Raspberry Pi and connects to the user's printer over Bambu's local MQTT interface. No NishBuilds server or cloud relay is used.

## User Setup

1. Install Bambu G2 from Even Hub.
2. On a Linux server or Raspberry Pi that can reach the printer, run:

```bash
curl -fsSL https://raw.githubusercontent.com/NishBuilds/bambu-g2/main/scripts/bootstrap-linux.sh | bash
```

3. Enter the printer IP/hostname, serial number, and LAN access code from the printer's LAN/developer-mode screen.
4. Paste the printed Bridge URL into the Bambu G2 phone companion page and save.
5. If the phone blocks the private bridge origin from the packaged app, open the Plugin Loader URL printed by the bridge.

## Privacy Summary

The app does not collect or send user data to the developer. Bridge URLs and optional printer details are stored locally on the phone. The Linux bridge stores printer credentials on the user's own server at `~/.config/bambu-g2-bridge/config.json` with user-only permissions.

## Reviewer Notes

- The app requests only `network` permission.
- The live printer connection uses a self-hosted bridge because Bambu local MQTT is not browser WebSocket, and Even Hub network whitelists are fixed origins.
- Demo mode is available without a printer or bridge.
- Dashboard/setup double-click asks the system foreground layer to exit.
- Privacy policy: `PRIVACY.md`
