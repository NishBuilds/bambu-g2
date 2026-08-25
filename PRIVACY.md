# Privacy Policy

Bambu G2 is a local-first Even G2 app for monitoring and controlling a Bambu Lab printer through a self-hosted bridge.

## Data Collection

This project does not collect, sell, share, or transmit personal data to the developer.

The Even Hub app stores only the settings entered on the user's phone, such as the bridge WebSocket URL and optional printer details, in local browser storage on that device. The Linux bridge stores printer connection settings in the user's own Linux account at:

```text
~/.config/bambu-g2-bridge/config.json
```

The bridge config file is written with user-only file permissions when created by the included setup command.

## Network Access

The app uses network access only to connect to a user-configured bridge on the user's own trusted LAN or VPN. The bridge then connects locally to the user's Bambu Lab printer over Bambu's local MQTT interface.

No NishBuilds server, analytics endpoint, cloud database, or third-party telemetry service is used by this project.

## Printer Credentials

Bambu Lab LAN access codes and printer serial numbers remain on the user's own devices. They are not bundled into the app package and are not sent to the developer.

Users should keep the bridge on a trusted private network or VPN. The bridge can pause/resume prints and change printer speed, so it should not be exposed directly to the public internet.

## Contact

For project issues, use the GitHub repository:

```text
https://github.com/NishBuilds/bambu-g2
```
