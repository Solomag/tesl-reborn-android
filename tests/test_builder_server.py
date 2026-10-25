import hashlib
import http.client
import json
from pathlib import Path
import tempfile
import time
import unittest

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
