import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from builder import selfupdate

ROOT = Path(__file__).resolve().parents[1]


class SelfUpdateTest(unittest.TestCase):
    def release(self, data, build=12, **asset):
        entry = dict(name=selfupdate.asset_name(), label=f"{selfupdate.asset_name()} · build {build}",
                     state="uploaded", size=len(data), digest="sha256:" + hashlib.sha256(data).hexdigest(),
                     browser_download_url="https://github.com/ssorgatem/tesl-reborn-android/releases/download/builder-test/"
                     + selfupdate.asset_name())
        entry.update(asset)
        other = dict(name="TESL-Reborn-Builder.other", label="build 99", state="uploaded", size=1,
                     digest="sha256:" + "0" * 64, browser_download_url="https://github.com/x")
        return json.dumps(dict(name="Builder (test)", assets=[other, entry])).encode()

    def test_check_reads_its_channel_release_through_the_api(self):
        data = b"new builder"
        calls = []
        fetch = lambda url, limit, timeout=15, accept=None: calls.append((url, accept)) or self.release(data)
        offer = selfupdate.check({"channel": "test", "build": 7}, fetch)
        self.assertEqual(offer["build"], 12, "the build comes from this platform's asset label")
        self.assertEqual(offer["sha256"], hashlib.sha256(data).hexdigest(), "GitHub's own digest")
        self.assertEqual(calls[0], ("https://api.github.com/repos/ssorgatem/tesl-reborn-android/releases/tags/builder-test",
                                    "application/vnd.github+json"))
        self.assertIsNone(selfupdate.check({"channel": "stable", "build": 12}, fetch), "same build is current")
        self.assertTrue(calls[-1][0].endswith("/releases/tags/builder-stable"))

    def test_an_asset_being_replaced_is_no_update_yet(self):
        missing = json.dumps(dict(assets=[])).encode()
        self.assertIsNone(selfupdate.check({"channel": "test", "build": 0}, lambda *a, **k: missing))
        starting = self.release(b"x", state="starter")
        self.assertIsNone(selfupdate.check({"channel": "test", "build": 0}, lambda *a, **k: starting))

    def test_check_rejects_a_bad_asset(self):
        for bad in [dict(label="no number"), dict(digest="md5:abc"), dict(size=0),
                    dict(browser_download_url="https://example.com/TESL-Reborn-Builder.exe")]:
            body = self.release(b"x", **bad)
            with self.assertRaises(ValueError):
                selfupdate.check({"channel": "test", "build": 0}, lambda *a, **k: body)

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

    def test_publish_label_is_what_the_builder_reads(self):
        spec = importlib.util.spec_from_file_location("publish_builder", ROOT / "tools/publish_builder.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        label = module.label(Path(selfupdate.asset_name()), 5)
        body = self.release(b"builder", label=label)
        offer = selfupdate.check({"channel": "test", "build": 4}, lambda *a, **k: body)
        self.assertEqual(offer["build"], 5, "what CI publishes is what the Builder accepts")


if __name__ == "__main__":
    unittest.main()


class RestartEnvironmentTest(unittest.TestCase):
    def test_the_restarted_builder_is_a_fresh_instance(self):
        old = r"C:\Users\x\AppData\Local\Temp\_MEI1234"
        env = selfupdate.restart_environment(
            {"PATH": r"C:\Windows", "TCL_LIBRARY": old + r"\_tcl_data", "_MEIPASS2": old, "HOME": r"C:\Users\x"}, old)
        self.assertEqual(env["PYINSTALLER_RESET_ENVIRONMENT"], "1")
        self.assertNotIn("TCL_LIBRARY", env, "nothing may point into the old build's folder")
        self.assertNotIn("_MEIPASS2", env)
        self.assertEqual(env["PATH"], r"C:\Windows")
