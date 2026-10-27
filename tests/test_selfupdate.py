import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from builder import selfupdate

ROOT = Path(__file__).resolve().parents[1]


class SelfUpdateTest(unittest.TestCase):
    def description(self, data, build=12, **extra):
        return json.dumps(dict(build=build, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                               asset=selfupdate.asset_name(), commit="c" * 40, **extra)).encode()

    def test_check_reads_the_release_of_its_own_channel(self):
        data = b"new builder"
        urls = []
        fetch = lambda url, limit, timeout=15: urls.append(url) or self.description(data)
        offer = selfupdate.check({"channel": "test", "build": 7}, fetch)
        self.assertEqual(offer["build"], 12)
        self.assertTrue(urls[0].startswith(
            "https://github.com/ssorgatem/tesl-reborn-android/releases/download/builder-test/builder-"))
        self.assertTrue(offer["url"].endswith("/builder-test/" + selfupdate.asset_name()))
        self.assertIsNone(selfupdate.check({"channel": "stable", "build": 12}, fetch), "same build is current")
        self.assertIn("/builder-stable/", urls[-1])

    def test_check_rejects_a_bad_description(self):
        for bad in [dict(build="12"), dict(sha256="x"), dict(asset="other.exe"), dict(bytes=0)]:
            body = json.loads(self.description(b"x"))
            body.update(bad)
            with self.assertRaises(ValueError):
                selfupdate.check({"channel": "test", "build": 0}, lambda *a, **k: json.dumps(body).encode())

    def test_install_swaps_the_verified_executable_and_keeps_the_old_one_until_cleanup(self):
        with tempfile.TemporaryDirectory() as tmp:
            exe = Path(tmp) / selfupdate.asset_name()
            exe.write_bytes(b"old builder")
            data = b"new builder"
            offer = dict(build=12, url="u", bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
            self.assertEqual(selfupdate.install(offer, exe, lambda *a, **k: data), exe)
            self.assertEqual(exe.read_bytes(), data)
            old = exe.with_name(exe.name + ".old")
            self.assertEqual(old.read_bytes(), b"old builder")
            selfupdate.cleanup(exe)
            self.assertFalse(old.exists())

    def test_a_corrupt_download_leaves_the_running_builder_alone(self):
        with tempfile.TemporaryDirectory() as tmp:
            exe = Path(tmp) / selfupdate.asset_name()
            exe.write_bytes(b"old builder")
            offer = dict(build=12, url="u", bytes=11, sha256="0" * 64)
            with self.assertRaises(ValueError):
                selfupdate.install(offer, exe, lambda *a, **k: b"evil bytes!")
            self.assertEqual(exe.read_bytes(), b"old builder")
            self.assertEqual(sorted(p.name for p in Path(tmp).iterdir()), [exe.name])

    def test_version_defaults_and_ci_stamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(selfupdate.current(tmp), {"channel": "test", "build": 0, "commit": ""})
            (Path(tmp) / "builder").mkdir()
            (Path(tmp) / "builder/version.json").write_text('{"channel":"stable","build":42,"commit":"abc"}')
            self.assertEqual(selfupdate.current(tmp), {"channel": "stable", "build": 42, "commit": "abc"})

    def test_publish_describes_the_executable(self):
        spec = importlib.util.spec_from_file_location("publish_builder", ROOT / "tools/publish_builder.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            exe = Path(tmp) / selfupdate.asset_name()
            exe.write_bytes(b"builder")
            info = module.describe(exe, {"build": 5, "commit": "abc"}, "windows")
        body = json.dumps(info).encode()
        offer = selfupdate.check({"channel": "test", "build": 4}, lambda *a, **k: body)
        self.assertEqual((offer["build"], offer["bytes"]), (5, 7), "what CI publishes is what the Builder accepts")


if __name__ == "__main__":
    unittest.main()
