#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import getpass
import html
import json
import mimetypes
import os
import secrets
import signal
import socket
import ssl
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from aiohttp import WSMsgType, web
import paho.mqtt.client as mqtt


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_PATH = Path.home() / ".config" / "bambu-g2-bridge" / "config.json"
CONFIG_PATH = Path(os.environ.get("BAMBU_G2_CONFIG", DEFAULT_CONFIG_PATH))
APP_DIR = Path(os.environ.get("BAMBU_G2_APP_DIR", PROJECT_ROOT / "dist")).resolve()
DEFAULT_PORT = int(os.environ.get("BAMBU_G2_PORT", "8983"))


class BambuMqttBridge:
    def __init__(self) -> None:
        self.client: mqtt.Client | None = None
        self.printer: dict[str, Any] | None = None
        self.mode = "setup"
        self.message = "Bridge is not configured."
        self.last_payload: dict[str, Any] | None = None
        self.loop: asyncio.AbstractEventLoop | None = None
        self.clients: set[web.WebSocketResponse] = set()
        self.connect_generation = 0

    def bind(self, loop: asyncio.AbstractEventLoop, clients: set[web.WebSocketResponse]) -> None:
        self.loop = loop
        self.clients = clients

    def connect(self, printer: dict[str, Any]) -> None:
        self.disconnect()
        self.connect_generation += 1
        generation = self.connect_generation
        self.printer = normalize_printer(printer)
        self.set_state("connecting", "Connecting to Bambu MQTT...")

        client_id = f"bambu_g2_bridge_{secrets.token_hex(4)}"
        try:
            client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id, protocol=mqtt.MQTTv311)
        except (AttributeError, TypeError):
            client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv311)

        client.username_pw_set(self.printer.get("username") or "bblp", self.printer["accessCode"])
        if self.printer.get("tls", True):
            client.tls_set(cert_reqs=ssl.CERT_NONE)
            client.tls_insecure_set(True)

        client.on_connect = self._on_connect
        client.on_connect_fail = self._on_connect_fail
        client.on_disconnect = self._on_disconnect
        client.on_message = self._on_message
        client.on_subscribe = self._on_subscribe
        client.on_log = self._on_log
        client.reconnect_delay_set(min_delay=2, max_delay=30)
        self.client = client
        client.connect_async(self.printer["host"], int(self.printer.get("port", 8883)), keepalive=30)
        client.loop_start()
        if self.loop:
            self.loop.call_later(15, self._check_connect_timeout, generation)

    def disconnect(self) -> None:
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
        self.client = None

    def publish_command(self, payload: dict[str, Any]) -> None:
        if not self.client or not self.client.is_connected() or not self.printer:
            raise RuntimeError("Bambu MQTT is not connected.")
        self.client.publish(self.request_topic, json.dumps(payload), qos=0)

    def request_push_all(self) -> None:
        if not self.client or not self.client.is_connected() or not self.printer:
            return
        payload = {
            "pushing": {
                "sequence_id": str(int(time.time() * 1000) % 100000000),
                "command": "pushall",
            }
        }
        self.client.publish(self.request_topic, json.dumps(payload), qos=0)

    def set_state(self, mode: str, message: str) -> None:
        self.mode = mode
        self.message = message
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {mode}: {message}", flush=True)
        self.broadcast({"type": "state", "mode": mode, "message": message})

    @property
    def report_topic(self) -> str:
        assert self.printer
        return f"device/{self.printer['serial']}/report"

    @property
    def request_topic(self) -> str:
        assert self.printer
        return f"device/{self.printer['serial']}/request"

    def _on_connect(self, client: mqtt.Client, _userdata: Any, _flags: Any, reason_code: Any, *_args: Any) -> None:
        reason_value = mqtt_reason_value(reason_code)
        if reason_value != 0:
            self.set_state("error", f"Bambu MQTT connect failed: {mqtt_reason_text(reason_code)}")
            return
        self.set_state("connected", "Connected to Bambu printer.")
        client.subscribe(self.report_topic, qos=0)
        self.request_push_all()

    def _on_connect_fail(self, _client: mqtt.Client, _userdata: Any) -> None:
        self.set_state(
            "error",
            "Bambu MQTT connect failed. Check printer IP, port 8883, LAN/developer mode, and access code.",
        )

    def _on_disconnect(self, _client: mqtt.Client, _userdata: Any, *args: Any) -> None:
        reason_code = mqtt_disconnect_reason(args)
        if mqtt_reason_value(reason_code) != 0:
            self.set_state("connecting", f"Bambu MQTT disconnected; reconnecting: {mqtt_reason_text(reason_code)}")

    def _on_subscribe(self, _client: mqtt.Client, _userdata: Any, _mid: int, *_args: Any) -> None:
        self.request_push_all()

    def _on_message(self, _client: mqtt.Client, _userdata: Any, message: mqtt.MQTTMessage) -> None:
        try:
            payload = json.loads(message.payload.decode("utf-8"))
        except Exception as exc:
            self.broadcast({"type": "error", "message": f"Bad MQTT JSON: {exc}"})
            return
        self.last_payload = payload
        self.broadcast({"type": "status", "payload": payload})

    def _on_log(self, _client: mqtt.Client, _userdata: Any, _level: int, _buf: str) -> None:
        return

    def _check_connect_timeout(self, generation: int) -> None:
        if generation != self.connect_generation:
            return
        if self.client and self.client.is_connected():
            return
        if self.mode == "connecting":
            self.set_state(
                "error",
                "Timed out connecting to Bambu MQTT. Check printer IP, port 8883, LAN/developer mode, and access code.",
            )

    def broadcast(self, payload: dict[str, Any]) -> None:
        if not self.loop:
            return
        self.loop.call_soon_threadsafe(lambda: asyncio.create_task(broadcast(self.clients, payload)))


async def setup_command() -> None:
    current = load_config(allow_missing=True)
    printer = current.get("printer") or {}
    listen = normalize_listen(current.get("listen"))

    print("Bambu G2 Bridge setup")
    print("Enter the values from your printer LAN/developer-mode screen.")
    printer_host = prompt("Printer IP or hostname", printer.get("host", ""))
    serial = prompt("Printer serial number", printer.get("serial", ""))
    access_code = getpass.getpass("Printer LAN access code: ") or printer.get("accessCode", "")
    printer_port = int(prompt("Printer MQTT port", str(printer.get("port", 8883))))
    listen_host = prompt("Bridge listen host", listen["host"])
    listen_port = int(prompt("Bridge listen port", str(listen["port"])))

    config = normalize_config(
        {
            "listen": {"host": listen_host, "port": listen_port},
            "printer": {
                "host": printer_host,
                "port": printer_port,
                "serial": serial,
                "username": "bblp",
                "accessCode": access_code,
                "tls": True,
                "rejectUnauthorized": False,
            },
            "refreshSeconds": current.get("refreshSeconds", 30),
        }
    )
    save_config(config)
    print(f"\nSaved {CONFIG_PATH}")
    print_urls(config)


async def start_command() -> None:
    config = load_config(allow_missing=True)
    listen = normalize_listen(config.get("listen"))
    bridge = BambuMqttBridge()
    clients: set[web.WebSocketResponse] = set()
    bridge.bind(asyncio.get_running_loop(), clients)

    if has_printer_config(config.get("printer")):
        bridge.connect(config["printer"])
    else:
        bridge.set_state("setup", "Bridge is running. Run setup to add a printer.")

    app = web.Application(middlewares=[cors_middleware])
    app["bridge"] = bridge
    app["clients"] = clients
    app["config"] = config
    app.router.add_get("/", handle_home)
    app.router.add_get("/health", handle_health)
    app.router.add_get("/api/health", handle_health)
    app.router.add_get("/api/snapshot", handle_snapshot)
    app.router.add_post("/api/reconnect", handle_reconnect)
    app.router.add_get("/ws", handle_ws)
    app.router.add_get("/app", redirect_app)
    app.router.add_get("/app/", serve_app)
    app.router.add_get("/app/{tail:.*}", serve_app)

    refresh_task = asyncio.create_task(refresh_loop(bridge, int(config.get("refreshSeconds", 30))))
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, listen["host"], listen["port"])
    await site.start()

    print(f"Bambu G2 Bridge listening on {listen['host']}:{listen['port']}")
    print_urls(config)
    if not has_printer_config(config.get("printer")):
        print("\nNo printer is configured yet. Run:")
        print("  python3 bridge/bambu_g2_bridge.py setup")

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_event.set)
    await stop_event.wait()
    refresh_task.cancel()
    bridge.disconnect()
    await runner.cleanup()


async def refresh_loop(bridge: BambuMqttBridge, refresh_seconds: int) -> None:
    while True:
        await asyncio.sleep(max(10, refresh_seconds))
        bridge.request_push_all()


async def handle_home(request: web.Request) -> web.Response:
    bridge: BambuMqttBridge = request.app["bridge"]
    config = request.app["config"]
    health = health_payload(config, bridge)
    safe = safe_config(config)
    address = ip_candidates()[0] if ip_candidates() else "localhost"
    plugin_url = f"http://{address}:{health['port']}/app/"
    bridge_url = f"ws://{address}:{health['port']}/ws"
    page = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bambu G2 Bridge</title>
  <style>
    :root {{ color: #ecfff2; background: #07120d; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }}
    main {{ width: min(860px, 100%); display: grid; gap: 16px; }}
    section {{ border: 1px solid rgba(150, 255, 190, .22); border-radius: 8px; background: #0b1f14; padding: 20px; }}
    h1, h2, p {{ margin-top: 0; }}
    h1 {{ margin-bottom: 4px; }}
    h2 {{ font-size: 18px; }}
    code {{ overflow-wrap: anywhere; color: #a8ffca; }}
    dl {{ display: grid; grid-template-columns: 160px 1fr; gap: 8px 14px; }}
    dt {{ color: #9ec8aa; font-weight: 800; }}
    dd {{ margin: 0; }}
    a {{ color: #07120d; background: #a8ffca; border-radius: 6px; padding: 10px 13px; font-weight: 800; text-decoration: none; display: inline-block; }}
    .row {{ display: flex; flex-wrap: wrap; gap: 10px; }}
    .muted {{ color: #a8c8b2; line-height: 1.45; }}
  </style>
</head>
<body>
  <main>
    <section>
      <h1>Bambu G2 Bridge</h1>
      <p class="muted">MQTT bridge for the Even G2 Bambu app. Keep this on your trusted LAN or VPN, not the open internet.</p>
      <div class="row">
        <a href="/app/">Open G2 app bundle</a>
        <a href="/api/health">Health JSON</a>
      </div>
    </section>
    <section>
      <h2>Status</h2>
      <dl>
        <dt>Bridge</dt><dd>{html.escape(bridge.message)}</dd>
        <dt>Configured</dt><dd>{"yes" if health["configured"] else "no"}</dd>
        <dt>MQTT</dt><dd>{html.escape(bridge.mode)}</dd>
        <dt>Printer</dt><dd>{html.escape((safe.get("printer") or {}).get("host", "--"))} / {html.escape((safe.get("printer") or {}).get("serial", "--"))}</dd>
        <dt>Plugin Loader</dt><dd><code>{html.escape(plugin_url)}</code></dd>
        <dt>Bridge URL</dt><dd><code>{html.escape(bridge_url)}</code></dd>
      </dl>
    </section>
    <section>
      <h2>Phone Setup</h2>
      <p class="muted">Install Bambu G2 from Even Hub, then paste the Bridge URL above into the phone companion page.</p>
      <p class="muted">The Plugin Loader URL opens this server-hosted copy of the app and auto-fills the same-origin bridge.</p>
    </section>
    <section>
      <h2>Server Setup</h2>
      <p class="muted">Fresh install on Linux or Raspberry Pi:</p>
      <p><code>curl -fsSL https://raw.githubusercontent.com/NishBuilds/bambu-g2/main/scripts/bootstrap-linux.sh | bash</code></p>
      <p class="muted">Reconfigure this server:</p>
      <p><code>python3 bridge/bambu_g2_bridge.py setup</code></p>
      <p><code>python3 bridge/install_service.py</code></p>
    </section>
  </main>
</body>
</html>"""
    return web.Response(text=page, content_type="text/html")


async def handle_health(request: web.Request) -> web.Response:
    return web.json_response(health_payload(request.app["config"], request.app["bridge"]))


async def handle_snapshot(request: web.Request) -> web.Response:
    bridge: BambuMqttBridge = request.app["bridge"]
    return web.json_response(bridge.last_payload or {"print": {}})


async def handle_reconnect(request: web.Request) -> web.Response:
    config = request.app["config"]
    bridge: BambuMqttBridge = request.app["bridge"]
    if has_printer_config(config.get("printer")):
        bridge.connect(config["printer"])
    return web.json_response(health_payload(config, bridge))


async def handle_ws(request: web.Request) -> web.WebSocketResponse:
    bridge: BambuMqttBridge = request.app["bridge"]
    clients: set[web.WebSocketResponse] = request.app["clients"]
    ws = web.WebSocketResponse(heartbeat=30)
    await ws.prepare(request)
    clients.add(ws)
    await ws.send_json({"type": "state", "mode": bridge.mode, "message": bridge.message})
    if bridge.last_payload:
        await ws.send_json({"type": "status", "payload": bridge.last_payload})

    async for msg in ws:
        if msg.type != WSMsgType.TEXT:
            continue
        try:
            data = json.loads(msg.data)
            await handle_ws_message(request.app, ws, data)
        except Exception as exc:
            await ws.send_json({"type": "error", "message": str(exc)})

    clients.discard(ws)
    return ws


async def handle_ws_message(app: web.Application, ws: web.WebSocketResponse, data: dict[str, Any]) -> None:
    bridge: BambuMqttBridge = app["bridge"]
    config = app["config"]
    message_type = data.get("type")

    if message_type == "connect":
        if has_printer_config(data.get("printer")):
            bridge.connect(data["printer"])
        elif has_printer_config(config.get("printer")) and bridge.mode != "connected":
            bridge.connect(config["printer"])
        await ws.send_json({"type": "state", "mode": bridge.mode, "message": bridge.message})
        if bridge.last_payload:
            await ws.send_json({"type": "status", "payload": bridge.last_payload})
        return

    if message_type == "command":
        bridge.publish_command(data["payload"])
        await ws.send_json({"type": "state", "mode": bridge.mode, "message": "Command sent to printer."})
        return

    if message_type == "refresh":
        bridge.request_push_all()
        return

    raise ValueError(f"Unknown message type: {message_type}")


async def redirect_app(_request: web.Request) -> web.Response:
    raise web.HTTPFound("/app/")


async def serve_app(request: web.Request) -> web.StreamResponse:
    tail = request.match_info.get("tail", "") or "index.html"
    requested = (APP_DIR / tail).resolve()
    if not str(requested).startswith(str(APP_DIR)):
        raise web.HTTPBadRequest(text="bad path")
    if not requested.exists() or not requested.is_file():
        if tail == "index.html":
            return web.Response(
                status=503,
                text=f"<h1>Bambu G2 app bundle not found</h1><p>Run <code>npm run build</code>.</p><p>Expected <code>{html.escape(str(APP_DIR))}</code></p>",
                content_type="text/html",
            )
        raise web.HTTPNotFound()
    headers = {"Cache-Control": "no-store" if requested.name == "index.html" else "public, max-age=31536000, immutable"}
    return web.FileResponse(requested, headers=headers, chunk_size=256 * 1024, status=200, reason=None)


@web.middleware
async def cors_middleware(request: web.Request, handler: Any) -> web.StreamResponse:
    if request.method == "OPTIONS":
        response = web.Response(status=204)
    else:
        response = await handler(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    return response


async def broadcast(clients: set[web.WebSocketResponse], payload: dict[str, Any]) -> None:
    stale: list[web.WebSocketResponse] = []
    for ws in clients:
        if ws.closed:
            stale.append(ws)
            continue
        await ws.send_json(payload)
    for ws in stale:
        clients.discard(ws)


def mqtt_reason_value(reason_code: Any) -> int:
    if reason_code is None:
        return 0
    if isinstance(reason_code, int):
        return reason_code
    value = getattr(reason_code, "value", None)
    if isinstance(value, int):
        return value
    try:
        return int(reason_code)
    except (TypeError, ValueError):
        text = str(reason_code).strip().lower()
        if text in {"success", "normal disconnection", "no error"}:
            return 0
        return 1


def mqtt_reason_text(reason_code: Any) -> str:
    value = mqtt_reason_value(reason_code)
    text = str(reason_code).strip()
    return f"{text} ({value})" if text and text != str(value) else str(value)


def mqtt_disconnect_reason(args: tuple[Any, ...]) -> Any:
    if len(args) >= 2:
        return args[1]
    if args:
        return args[0]
    return 0


def load_config(allow_missing: bool = False) -> dict[str, Any]:
    try:
        return normalize_config(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
    except FileNotFoundError:
        if allow_missing:
            return normalize_config({})
        raise


def save_config(config: dict[str, Any]) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(normalize_config(config), indent=2) + "\n", encoding="utf-8")
    CONFIG_PATH.chmod(0o600)


def normalize_config(config: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {
        "listen": normalize_listen(config.get("listen")),
        "refreshSeconds": max(10, int(config.get("refreshSeconds", 30))),
    }
    if config.get("printer"):
        normalized["printer"] = normalize_printer(config["printer"])
    return normalized


def normalize_listen(listen: Any) -> dict[str, Any]:
    listen = listen or {}
    return {
        "host": str(listen.get("host", "0.0.0.0")).strip() or "0.0.0.0",
        "port": int(listen.get("port", DEFAULT_PORT) or DEFAULT_PORT),
    }


def normalize_printer(printer: dict[str, Any]) -> dict[str, Any]:
    return {
        "host": str(printer.get("host", "")).strip(),
        "port": int(printer.get("port", 8883) or 8883),
        "serial": str(printer.get("serial", "")).strip(),
        "username": str(printer.get("username", "bblp")).strip() or "bblp",
        "accessCode": str(printer.get("accessCode", "")).strip(),
        "tls": printer.get("tls", True) is not False,
        "rejectUnauthorized": printer.get("rejectUnauthorized", False) is True,
    }


def safe_config(config: dict[str, Any]) -> dict[str, Any]:
    safe = normalize_config(config)
    if safe.get("printer"):
        safe["printer"]["accessCode"] = "saved" if safe["printer"].get("accessCode") else ""
    return safe


def has_printer_config(printer: Any) -> bool:
    return bool(printer and printer.get("host") and printer.get("serial") and printer.get("accessCode"))


def health_payload(config: dict[str, Any], bridge: BambuMqttBridge) -> dict[str, Any]:
    listen = normalize_listen(config.get("listen"))
    return {
        "ok": True,
        "host": socket.gethostname(),
        "port": listen["port"],
        "configured": has_printer_config(config.get("printer")),
        "mqttMode": bridge.mode,
        "message": bridge.message,
        "appAvailable": (APP_DIR / "index.html").exists(),
        "config": safe_config(config),
    }


def prompt(label: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{label}{suffix}: ").strip()
    return value or default


def print_urls(config: dict[str, Any]) -> None:
    listen = normalize_listen(config.get("listen"))
    addresses = ip_candidates() or ["localhost"]
    print("\nUse one of these from your phone:")
    for address in addresses:
        print(f"  http://{address}:{listen['port']}/")
        print(f"  Plugin Loader: http://{address}:{listen['port']}/app/")
        print(f"  Bridge URL: ws://{address}:{listen['port']}/ws")


def ip_candidates() -> list[str]:
    values: list[str] = []
    try:
        output = subprocess.check_output(["hostname", "-I"], stderr=subprocess.DEVNULL, text=True).strip()
        values.extend(part for part in output.split() if "." in part and not part.startswith("127."))
    except Exception:
        pass
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        values.append(sock.getsockname()[0])
        sock.close()
    except Exception:
        pass
    unique: list[str] = []
    for value in values:
        if value not in unique:
            unique.append(value)
    return unique


async def main() -> None:
    parser = argparse.ArgumentParser(description="Bambu G2 MQTT bridge")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("setup", help="guided printer setup")
    sub.add_parser("start", help="start the bridge")
    sub.add_parser("urls", help="print phone URLs")
    args = parser.parse_args()

    if args.command == "setup":
        await setup_command()
    elif args.command == "urls":
        print_urls(load_config(allow_missing=True))
    else:
        await start_command()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
