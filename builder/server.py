"""Temporary, capability-authenticated, allow-listed resource HTTP server."""

import hmac
import hashlib
from email.utils import formatdate
from contextlib import ExitStack
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import threading
import time
from urllib.parse import quote
import zipfile

from .resources import sha256, LANGUAGES, PACKAGE


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
        apk=None,
        apk_idle_seconds=300,
    ):
        self.root = Path(root).resolve()
        if (self.root / "catalog.json").stat().st_size > 256 * 1024:
            raise ValueError("Resource catalog exceeds size limit")
        self.catalog = json.loads(
            (self.root / "catalog.json").read_text(encoding="utf-8")
        )
        self.allowed = {"/catalog.json": self.root / "catalog.json"}
        self.apk = Path(apk).resolve() if apk else None
        if self.apk and (
            not self.apk.is_file() or self.apk.suffix.lower() not in (".apk", ".xapk")
        ):
            raise ValueError("The APK selected for transfer is missing")
        self.apk_member = None
        # The phone saves the APK under the Builder's name for it (channel and build).
        self.download_name = (self.apk.stem + ".apk") if self.apk else "tesl-reborn.apk"
        self.apk_size = self.apk.stat().st_size if self.apk else 0
        if self.apk and self.apk.suffix.lower() == ".xapk":
            self.apk_member = PACKAGE + ".apk"
            with zipfile.ZipFile(self.apk) as archive:
                if archive.namelist().count(self.apk_member) != 1:
                    raise ValueError("The XAPK must contain exactly one base APK")
                self.apk_size = archive.getinfo(self.apk_member).file_size
        if self.apk and not 0 < self.apk_size <= 4 * 1024**3:
            raise ValueError("Invalid APK size")
        self.apk_hash = ""
        if self.apk:
            if self.apk_member:
                digest = hashlib.sha256()
                with zipfile.ZipFile(self.apk) as archive, archive.open(
                    self.apk_member
                ) as stream:
                    while chunk := stream.read(1024 * 1024):
                        digest.update(chunk)
                self.apk_hash = digest.hexdigest()
            else:
                self.apk_hash = sha256(self.apk)
        self.etags = {"/catalog.json": sha256(self.root / "catalog.json")}
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
            self.etags["/" + pack["path"]] = pack["sha256"]
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
            self.etags["/game.obb"] = self.obb["sha256"]
        self.token = secrets.token_urlsafe(24)
        self.idle_seconds, self.grace_seconds, self.log = (
            idle_seconds,
            grace_seconds,
            log,
        )
        self.last_activity = time.monotonic()
        self.active = 0
        self.transfer_id = 0
        self.finished_at = None
        # Set when the download page reports a verified APK. A browser cannot
        # see the installation; the app confirms only after downloading game
        # data (step 2). An APK-only update has no confirmation at all, so
        # after a verified APK the transfer ends after a shorter idle period.
        self.apk_verified_at = None
        self.apk_idle_seconds = apk_idle_seconds
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

            def error(self, code, total=None):
                self.send_response(code)
                self.send_header("Content-Length", "0")
                if code == 416 and total is not None:
                    self.send_header("Content-Range", f"bytes */{total}")
                self.send_header("Connection", "close")
                self.end_headers()
                self.close_connection = True

            def do_HEAD(self):
                self.head_only = True
                try:
                    self.do_GET()
                finally:
                    self.head_only = False

            def do_GET(self):
                browser = self.path in (
                    owner.connect_path,
                    owner.connect_path + "/tesl-reborn.apk",
                )
                if browser:
                    if self.headers.get("Origin"):
                        self.error(403)
                        return
                    if self.path == owner.connect_path:
                        with owner.lock:
                            owner.last_activity = time.monotonic()
                            if not getattr(self, "head_only", False):
                                owner.finished_at = None
                        data = owner.landing_page()
                        self.send_response(200)
                        self.send_header("Content-Type", "text/html; charset=utf-8")
                        self.send_header("Content-Length", str(len(data)))
                        self.send_header("Cache-Control", "no-store")
                        self.send_header("Referrer-Policy", "no-referrer")
                        self.send_header("X-Content-Type-Options", "nosniff")
                        self.send_header(
                            "Content-Security-Policy",
                            "default-src 'none'; script-src 'nonce-"
                            + owner.token
                            + "'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
                        )
                        self.end_headers()
                        if not getattr(self, "head_only", False):
                            self.wfile.write(data)
                        return
                    if not owner.apk:
                        self.error(404)
                        return
                    path = owner.apk
                else:
                    if not self.authenticated():
                        return
                    # Literal allow-list. No filesystem joins using request paths.
                    if self.path not in owner.allowed:
                        self.error(404)
                        return
                    path = owner.allowed[self.path]
                total = owner.apk_size if browser else path.stat().st_size
                start, end, partial = 0, total - 1, False
                etag = (
                    '"' + (owner.apk_hash if browser else owner.etags[self.path]) + '"'
                )
                modified = formatdate(path.stat().st_mtime, usegmt=True)
                value = self.headers.get("Range")
                if self.headers.get("If-Range") not in (None, etag, modified):
                    value = None
                if value:
                    import re

                    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
                    if not match or not (match[1] or match[2]):
                        self.error(416, total)
                        return
                    if match[1]:
                        start = int(match[1])
                        end = min(int(match[2]) if match[2] else end, end)
                    else:
                        start = max(0, total - int(match[2]))
                    if start >= total or end < start:
                        self.error(416, total)
                        return
                    partial = True
                with owner.lock:
                    owner.active += 1
                    owner.last_activity = time.monotonic()
                    if not getattr(self, "head_only", False):
                        owner.finished_at = None
                head = getattr(self, "head_only", False)
                sent, started, last_progress, failure = 0, time.monotonic(), time.monotonic(), None
                transfer_id = None
                if browser and not head:
                    with owner.lock:
                        owner.transfer_id += 1
                        transfer_id = owner.transfer_id
                    owner.log(f"APK #{transfer_id}: start, bytes {start}-{end} of {total}" + (" (resume/range)" if partial else ""))
                try:
                    self.connection.settimeout(45)
                    self.send_response(206 if partial else 200)
                    self.send_header(
                        "Content-Type",
                        (
                            "application/json"
                            if self.path == "/catalog.json"
                            else (
                                "application/vnd.android.package-archive"
                                if browser
                                else "application/zip"
                            )
                        ),
                    )
                    self.send_header("Content-Length", str(end - start + 1))
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("ETag", etag)
                    self.send_header("Last-Modified", modified)
                    self.send_header(
                        "Cache-Control", "private, max-age=0, must-revalidate"
                    )
                    self.send_header("Connection", "close")
                    self.close_connection = True
                    self.send_header("Referrer-Policy", "no-referrer")
                    self.send_header("X-Content-Type-Options", "nosniff")
                    if browser:
                        self.send_header(
                            "Content-Disposition",
                            f'attachment; filename="{owner.download_name}"',
                        )
                    if partial:
                        self.send_header(
                            "Content-Range", f"bytes {start}-{end}/{total}"
                        )
                    self.end_headers()
                    if getattr(self, "head_only", False):
                        return
                    with ExitStack() as stack:
                        if browser and owner.apk_member:
                            archive = stack.enter_context(zipfile.ZipFile(path))
                            stream = stack.enter_context(archive.open(owner.apk_member))
                        else:
                            stream = stack.enter_context(path.open("rb"))
                        stream.seek(start)
                        remaining = end - start + 1
                        while remaining:
                            chunk = stream.read(min(1024 * 1024, remaining))
                            if not chunk:
                                raise OSError("Unexpected end of resource file")
                            self.wfile.write(chunk)
                            remaining -= len(chunk)
                            sent += len(chunk)
                            now = time.monotonic()
                            if transfer_id is not None and now - last_progress >= 3:
                                owner.log(f"APK #{transfer_id}: sent {sent} bytes; file offset {start + sent}/{total}; {sent / max(.001, now-started) / 1048576:.2f} MiB/s")
                                last_progress = now
                except OSError as error:
                    failure = type(error).__name__
                finally:
                    if transfer_id is not None:
                        outcome = "interrupted (" + failure + ")" if failure else "range sent" if partial else "file sent"
                        owner.log(f"APK #{transfer_id}: {outcome}, {sent}/{end-start+1} bytes in {time.monotonic()-started:.1f}s")
                    with owner.lock:
                        owner.active -= 1
                        owner.last_activity = time.monotonic()

            def apk_verified(self):
                # Same-origin POST from the download page: the capability token
                # is in the path, and a browser sends its own Origin, which
                # must name this server.
                origin = self.headers.get("Origin")
                if origin is not None and origin not in (
                    "http://" + self.headers.get("Host", ""),
                    "https://" + self.headers.get("Host", ""),
                ):
                    self.error(403)
                    return
                try:
                    size = int(self.headers.get("Content-Length", "0"))
                    if not 1 <= size <= 1024:
                        raise ValueError("Invalid report")
                    if json.loads(self.rfile.read(size)).get("sha256") != owner.apk_hash:
                        raise ValueError("Wrong APK")
                except (ValueError, AttributeError):
                    self.error(400)
                    return
                with owner.lock:
                    owner.apk_verified_at = owner.last_activity = time.monotonic()
                owner.log(
                    "Phone downloaded the APK and verified its SHA-256. Install it on the phone."
                    f" For game data, tap step 2 on the phone; otherwise the transfer stops after"
                    f" {owner.apk_idle_seconds // 60} minutes without requests."
                )
                self.send_response(204)
                self.send_header("Content-Length", "0")
                self.send_header("Connection", "close")
                self.end_headers()
                self.close_connection = True

            def do_POST(self):
                if owner.apk and self.path == owner.connect_path + "/apk-verified":
                    self.apk_verified()
                    return
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
                self.connection.settimeout(120)

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
    def connect_path(self):
        return "/connect/" + self.token

    def connection_url(self, base):
        return base.rstrip("/") + self.connect_path

    def landing_page(self):
        # No external content or Host-header interpolation. Relative links also
        # work behind a reverse proxy with a URL prefix.
        apk = ('<button class="button" id="apk-start">1. Download / resume APK</button>'
               '<button id="apk-cancel" hidden>Pause</button><p id="apk-status"></p>'
               '<a class="button" id="apk-save" hidden>Save verified APK</a>') if self.apk else "<p>This transfer has no APK.</p>"
        downloader = Path(__file__).with_name("apk-download.js").read_text(encoding="utf-8")
        config = json.dumps(dict(bytes=self.apk_size, sha256=self.apk_hash,
                                 url=self.token + "/tesl-reborn.apk", name=self.download_name,
                                 verifiedUrl=self.token + "/apk-verified"))
        return (
            """<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Install TESL Reborn</title>
<style>body{font:18px system-ui;background:#161a20;color:#eee;max-width:38em;margin:3em auto;padding:0 20px;line-height:1.5}[hidden]{display:none!important}.button{display:block;background:#d7ae63;color:#171717;padding:16px;margin:18px 0;border-radius:8px;text-decoration:none;font-weight:bold}</style>
<h1>TESL Reborn</h1><p>Keep the builder running on your PC. Use the same Wi-Fi or Tailscale connection.</p>"""
            + apk
            + '''<p>Install the downloaded APK. Android may ask you to allow installations from your browser. Then return to this page.</p>
<a class="button" id="open">2. Open TESL Reborn to download game data</a>
<p>Already installed? Use step 2. In the app, choose your game language and tap <b>Download missing game data</b>.</p>
<p>The app confirms to the PC only after step 2 downloads game data. If you only updated the APK, nothing else is needed: the transfer stops by itself a few minutes after the verified APK.</p>
<script nonce="'''
            + self.token
            + """">const marker=location.pathname.lastIndexOf('/connect/');
const base=location.origin+location.pathname.slice(0,marker)+'/';
document.getElementById('open').href='teslreborn://resources?url='+encodeURIComponent(base)+'&token="""
            + self.token
            + """';""" + downloader + "\ninstallApkDownload(" + config + ");</script></html>"
        ).encode("utf-8")

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
            idle = (
                self.apk_idle_seconds
                if self.apk_verified_at is not None
                else self.idle_seconds
            )
            return (
                self.finished_at is not None
                and now - self.finished_at >= self.grace_seconds
            ) or now - self.last_activity >= idle

    def stop(self):
        if self.stopped.is_set():
            return
        self.stopped.set()
        self.http.shutdown()
        self.http.server_close()
        self.log("Transfer stopped.")
