import hashlib
import http.client
import json
import re
import shutil
import subprocess
from urllib.parse import urljoin, urlsplit, parse_qs
from pathlib import Path
import tempfile
import time
import unittest
import zipfile

from builder.server import ResourceServer


class BuilderServerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "packs").mkdir()
        self.data = b"0123456789" * 100
        digest = hashlib.sha256(self.data).hexdigest()
        (self.root / "packs" / f"{digest}.zip").write_bytes(self.data)
        self.digest = digest
        self.path = f"/packs/{digest}.zip"
        self.logs = []
        catalog = dict(
            packs=[
                dict(id=code, path=self.path[1:], sha256=digest)
                for code in ("common", "ru_ru")
            ]
        )
        (self.root / "catalog.json").write_text(json.dumps(catalog))
        self.server = ResourceServer(
            self.root,
            host="127.0.0.1",
            idle_seconds=100,
            grace_seconds=100,
            log=self.logs.append,
        ).start()

    def tearDown(self):
        self.server.stop()
        self.temp.cleanup()

    def request(self, path, headers=None, method="GET", body=None):
        connection = http.client.HTTPConnection(
            "127.0.0.1", self.server.port, timeout=5
        )
        connection.request(method, path, body=body, headers=headers or {})
        r = connection.getresponse()
        result = (r.status, dict(r.getheaders()), r.read())
        connection.close()
        return result

    def auth(self, **kwargs):
        return {"Authorization": "Bearer " + self.server.token, **kwargs}

    def test_auth_and_path_allowlist(self):
        self.assertEqual(self.request("/catalog.json")[0], 401)
        self.assertEqual(self.request("/catalog.json", self.auth())[0], 200)
        for path in [
            "/../catalog.json",
            "/%2e%2e/secret",
            "/catalog.json?token=x",
            "/packs/",
            "/",
        ]:
            self.assertEqual(self.request(path, self.auth())[0], 404)
        self.assertEqual(
            self.request("/catalog.json", self.auth(Origin="https://other.example"))[0],
            403,
        )
        self.assertNotIn(self.server.token, "\n".join(self.logs))

    def test_browser_installation_is_capability_scoped_and_does_not_complete_transfer(
        self,
    ):
        self.server.stop()
        apk = self.root / "phone.apk"
        apk.write_bytes(b"APK fixture bytes")
        self.server = ResourceServer(
            self.root, host="127.0.0.1", apk=apk, log=self.logs.append
        ).start()
        page = self.server.connect_path
        status, headers, html = self.request(page)
        self.assertEqual(status, 200)
        self.assertIn(b"Download APK", html)
        self.assertIn(b"teslreborn://resources?url=", html)
        self.assertIn("no-referrer", headers["Referrer-Policy"])
        self.assertNotIn(b"https://", html)  # no external scripts, fonts or analytics
        html_text = html.decode("utf-8")
        href = re.search(r'href="([^"]+)" download', html_text).group(1)
        location = f"http://127.0.0.1:{self.server.port}" + page
        apk_path = urlsplit(urljoin(location, href)).path
        self.assertEqual(apk_path, page + "/tesl-reborn.apk")
        # Execute the actual page's connection script, including reverse-proxy
        # prefixes. A valid HTTP response alone does not make the Open button work.
        node = shutil.which("node")
        if node:
            script = re.search(
                r'<script nonce="[^"]+">(.*?)</script>', html_text, re.S
            ).group(1)
            harness = "const vm=require('vm'),fs=require('fs');const link={};vm.runInNewContext(fs.readFileSync(0,'utf8'),{location:new URL(process.argv[1]),document:{getElementById:()=>link}});console.log(link.href)"
            for address, expected in [
                (location, f"http://127.0.0.1:{self.server.port}/"),
                (
                    "https://example.com/proxy/connect/" + self.server.token,
                    "https://example.com/proxy/",
                ),
            ]:
                result = subprocess.run(
                    [node, "-e", harness, address],
                    input=script,
                    text=True,
                    capture_output=True,
                    check=True,
                )
                connection = urlsplit(result.stdout.strip())
                self.assertEqual(connection.scheme, "teslreborn")
                fields = parse_qs(connection.query)
                self.assertEqual(fields["url"], [expected])
                self.assertEqual(fields["token"], [self.server.token])
        status, headers, data = self.request(apk_path)
        self.assertEqual(status, 200)
        self.assertEqual(data, apk.read_bytes())
        self.assertEqual(
            headers["Content-Type"], "application/vnd.android.package-archive"
        )
        self.assertIsNone(self.server.finished_at)
        self.assertFalse(self.server.should_stop())
        status, _, data = self.request(
            page + "/tesl-reborn.apk", {"Range": "bytes=4-10"}
        )
        self.assertEqual(status, 206)
        self.assertEqual(data, apk.read_bytes()[4:11])
        self.assertEqual(self.request(page + "/../catalog.json")[0], 401)
        self.assertEqual(self.request("/connect/wrong/tesl-reborn.apk")[0], 401)
        self.assertEqual(
            self.request(page, {"Origin": "https://other.example"})[0], 403
        )
        self.assertEqual(self.request("/catalog.json")[0], 401)
        self.assertNotIn(self.server.token, "\n".join(self.logs))

    def test_browser_can_download_apk_from_offline_xapk_without_extracting_it(self):
        from builder.resources import PACKAGE

        self.server.stop()
        xapk = self.root / "tesl-reborn.xapk"
        with zipfile.ZipFile(xapk, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr(PACKAGE + ".apk", self.data)
            z.writestr("unrelated.txt", b"never served")
        self.server = ResourceServer(
            self.root, host="127.0.0.1", apk=xapk, log=self.logs.append
        ).start()
        status, headers, data = self.request(
            self.server.connect_path + "/tesl-reborn.apk", {"Range": "bytes=20-99"}
        )
        self.assertEqual(status, 206)
        self.assertEqual(data, self.data[20:100])
        self.assertEqual(headers["Content-Range"], "bytes 20-99/1000")
        self.assertFalse((self.root / (PACKAGE + ".apk")).exists())
        self.assertIsNone(self.server.finished_at)

    def test_head_and_if_range_are_consistent_for_browser_resume(self):
        status, headers, body = self.request(self.path, self.auth(), method="HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(int(headers["Content-Length"]), len(self.data))
        self.assertEqual(body, b"")
        self.assertEqual(headers["ETag"], '"' + self.digest + '"')
        self.assertIn("Last-Modified", headers)
        status, _, body = self.request(
            self.path, self.auth(Range="bytes=80-", **{"If-Range": headers["ETag"]})
        )
        self.assertEqual(status, 206)
        self.assertEqual(body, self.data[80:])
        status, _, body = self.request(
            self.path, self.auth(Range="bytes=80-", **{"If-Range": '"stale"'})
        )
        self.assertEqual(status, 200)
        self.assertEqual(body, self.data)
        self.assertEqual(
            self.request(self.path, self.auth(Range="bytes=-10"))[2], self.data[-10:]
        )

    def test_range_for_resume(self):
        status, headers, data = self.request(
            self.path, self.auth(Range="bytes=200-299")
        )
        self.assertEqual(status, 206)
        self.assertEqual(data, self.data[200:300])
        self.assertEqual(headers["Content-Range"], "bytes 200-299/1000")
        self.assertEqual(
            self.request(self.path, self.auth(Range="bytes=2000-"))[0], 416
        )
        self.assertEqual(
            self.request(self.path, self.auth(Range="bytes=1-2,4-5"))[0], 416
        )

    def test_obb_transfer_and_completion_requires_obb(self):
        self.server.stop()
        obb = b"base game fixture" * 100
        digest = hashlib.sha256(obb).hexdigest()
        (self.root / "game.obb").write_bytes(obb)
        path = self.root / "catalog.json"
        value = json.loads(path.read_text())
        value["obb"] = dict(id="obb", path="game.obb", sha256=digest, bytes=len(obb))
        path.write_text(json.dumps(value))
        self.server = ResourceServer(
            self.root, host="127.0.0.1", log=self.logs.append
        ).start()
        status, headers, data = self.request("/game.obb", self.auth(Range="bytes=12-"))
        self.assertEqual(status, 206)
        self.assertEqual(data, obb[12:])
        body = dict(installed={"common": self.digest, "ru_ru": self.digest})
        self.assertEqual(
            self.request("/complete", self.auth(), "POST", json.dumps(body))[0], 400
        )
        self.assertIsNone(self.server.finished_at)
        body["obb"] = digest
        self.assertEqual(
            self.request("/complete", self.auth(), "POST", json.dumps(body))[0], 204
        )

    def test_acknowledgement_and_idle_shutdown(self):
        bad = json.dumps({"installed": {"common": "bad", "ru_ru": self.digest}})
        self.assertEqual(
            self.request("/complete", self.auth(), method="POST", body=bad)[0], 400
        )
        self.assertIsNone(self.server.finished_at)
        good = json.dumps({"installed": {"common": self.digest, "ru_ru": self.digest}})
        self.assertEqual(
            self.request("/complete", self.auth(), method="POST", body=good)[0], 204
        )
        self.assertTrue(self.server.should_stop(self.server.finished_at + 101))
        self.server.active = 1
        self.assertFalse(self.server.should_stop(self.server.finished_at + 10000))
        self.server.active = 0
        self.server.finished_at = None
        self.assertTrue(self.server.should_stop(self.server.last_activity + 101))
