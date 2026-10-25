"""Temporary, capability-authenticated, allow-listed resource HTTP server."""

import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import threading
import time

from .resources import sha256, LANGUAGES


class ResourceServer:
    def __init__(
        self,
        root,
        host="0.0.0.0",
        port=0,
        idle_seconds=900,
        grace_seconds=60,
        log=print,
        cert=None,
        key=None,
    ):
        self.root = Path(root).resolve()
        if (self.root / "catalog.json").stat().st_size > 256 * 1024:
            raise ValueError("Resource catalog exceeds size limit")
        self.catalog = json.loads(
            (self.root / "catalog.json").read_text(encoding="utf-8")
        )
        self.allowed = {"/catalog.json": self.root / "catalog.json"}
        self.packs = {}
        for pack in self.catalog["packs"]:
            if pack["id"] not in ("common", *LANGUAGES) or pack["id"] in self.packs:
                raise ValueError("Invalid or duplicate pack id")
            import re

            if (
                not re.fullmatch("[a-f0-9]{64}", pack["sha256"])
                or pack["path"] != "packs/" + pack["sha256"] + ".zip"
            ):
                raise ValueError("Invalid resource pack path")
            path = (self.root / pack["path"]).resolve()
            if (
                not path.is_relative_to(self.root)
                or not path.is_file()
                or sha256(path) != pack["sha256"]
            ):
                raise ValueError(
                    "Resource catalog references a missing or corrupt pack"
                )
            self.allowed["/" + pack["path"]] = path
            self.packs[pack["id"]] = pack["sha256"]
        self.obb = self.catalog.get("obb")
        if self.obb:
            path = self.root / "game.obb"
            import re

            if (
                self.obb.get("id") != "obb"
                or self.obb.get("path") != "game.obb"
                or not re.fullmatch("[a-f0-9]{64}", self.obb.get("sha256", ""))
                or not path.resolve().is_relative_to(self.root)
                or not path.is_file()
                or not 0 < self.obb["bytes"] <= 4 * 1024**3
                or path.stat().st_size != self.obb["bytes"]
                or sha256(path) != self.obb["sha256"]
            ):
                raise ValueError("Missing or corrupt OBB in transfer folder")
            self.allowed["/game.obb"] = path
        self.token = secrets.token_urlsafe(24)
        self.idle_seconds, self.grace_seconds, self.log = (
            idle_seconds,
            grace_seconds,
            log,
        )
        self.last_activity = time.monotonic()
        self.active = 0
        self.finished_at = None
        self.stopped = threading.Event()
        self.lock = threading.Lock()
        owner = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_):
                pass  # Never print capability URLs or tokens in logs.

            def authenticated(self):
                if self.headers.get("Origin"):
                    self.error(403)
                    return False
                candidate = self.headers.get("Authorization", "")
                if not hmac.compare_digest(
                    candidate.encode("utf-8"), ("Bearer " + owner.token).encode("utf-8")
                ):
                    self.error(401)
                    return False
                return True

            def error(self, code):
                self.send_response(code)
                self.send_header("Content-Length", "0")
                self.send_header("Connection", "close")
                self.end_headers()
                self.close_connection = True

            def do_GET(self):
                if not self.authenticated():
                    return
                # Literal allow-list. No filesystem joins using request paths.
                if self.path not in owner.allowed:
                    self.error(404)
                    return
                path = owner.allowed[self.path]
                total = path.stat().st_size
                start, end, partial = 0, total - 1, False
                value = self.headers.get("Range")
                if value:
                    import re

                    match = re.fullmatch(r"bytes=(\d+)-(\d*)", value)
                    if not match:
                        self.error(416)
                        return
                    start = int(match[1])
                    end = min(int(match[2]) if match[2] else end, end)
                    if start >= total or end < start:
                        self.error(416)
                        return
                    partial = True
                with owner.lock:
                    owner.active += 1
                    owner.last_activity = time.monotonic()
                try:
                    self.send_response(206 if partial else 200)
                    self.send_header(
                        "Content-Type",
                        (
                            "application/json"
                            if self.path == "/catalog.json"
                            else "application/zip"
                        ),
                    )
                    self.send_header("Content-Length", str(end - start + 1))
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("ETag", '"' + path.stem + '"')
                    self.send_header("Cache-Control", "no-store")
                    if partial:
                        self.send_header(
                            "Content-Range", f"bytes {start}-{end}/{total}"
                        )
                    self.end_headers()
                    with path.open("rb") as stream:
                        stream.seek(start)
                        remaining = end - start + 1
                        while remaining:
                            chunk = stream.read(min(1024 * 1024, remaining))
                            if not chunk:
                                raise OSError("Unexpected end of resource file")
                            self.wfile.write(chunk)
                            remaining -= len(chunk)
                except (BrokenPipeError, ConnectionResetError, TimeoutError):
                    pass
                finally:
                    with owner.lock:
                        owner.active -= 1
                        owner.last_activity = time.monotonic()

            def do_POST(self):
                if not self.authenticated():
                    return
                if self.path != "/complete":
                    self.error(404)
                    return
                try:
                    size = int(self.headers.get("Content-Length", "0"))
                    if not 1 <= size <= 8192:
                        raise ValueError("Invalid acknowledgement")
                    payload = json.loads(self.rfile.read(size))
                    packs = payload["installed"]
                    if (
                        not isinstance(packs, dict)
                        or "common" not in packs
                        or len(packs) < 2
                        or owner.obb
                        and payload.get("obb") != owner.obb["sha256"]
                        or any(
                            owner.packs.get(name) != digest
                            for name, digest in packs.items()
                        )
                    ):
                        raise ValueError("Invalid installed pack set")
                except (ValueError, KeyError, TypeError):
                    self.error(400)
                    return
                with owner.lock:
                    owner.finished_at = time.monotonic()
                    owner.last_activity = owner.finished_at
                owner.log(
                    "Phone confirmed resources and base game data. Transfer will stop automatically."
                )
                self.send_response(204)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def setup(self):
                super().setup()
                self.connection.settimeout(30)

        self.http = ThreadingHTTPServer((host, port), Handler)
        self.http.daemon_threads = True
        if cert or key:
            import ssl

            if not cert or not key:
                raise ValueError("TLS requires both certificate and key")
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            try:
                context.load_cert_chain(certfile=cert, keyfile=key, password=lambda: "")
                self.http.socket = context.wrap_socket(
                    self.http.socket, server_side=True
                )
            except BaseException:
                self.http.server_close()
                raise

    @property
    def port(self):
        return self.http.server_port

    def start(self):
        threading.Thread(target=self.http.serve_forever, daemon=True).start()
        threading.Thread(target=self._watch, daemon=True).start()
        return self

    def _watch(self):
        while not self.stopped.wait(0.5):
            if self.should_stop():
                self.stop()
                return

    def should_stop(self, now=None):
        now = time.monotonic() if now is None else now
        with self.lock:
            if self.active:
                return False
            return (
                self.finished_at is not None
                and now - self.finished_at >= self.grace_seconds
            ) or now - self.last_activity >= self.idle_seconds

    def stop(self):
        if self.stopped.is_set():
            return
        self.stopped.set()
        self.http.shutdown()
        self.http.server_close()
        self.log("Transfer stopped.")
