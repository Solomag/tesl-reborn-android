import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SelectChannelTest(unittest.TestCase):
    def test_only_main_of_the_main_repository_builds_stable(self):
        spec = importlib.util.spec_from_file_location("select_channel", ROOT / "tools/select_channel.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.channel_for("ssorgatem/tesl-reborn-android", "refs/heads/main"), "stable")
        for repository, ref in [
            ("ssorgatem/tesl-reborn-android", "refs/heads/android-ui-and-update-loader"),
            ("ssorgatem/tesl-reborn-android", "refs/pull/3/merge"),
            ("Solomag/tesl-reborn-android", "refs/heads/main"),
        ]:
            self.assertEqual(module.channel_for(repository, ref), "test")
        channels = json.loads((ROOT / "runtime/channel.json").read_text(encoding="utf-8"))
        # CI rewrites the working copy before the tests run (stable on main),
        # so the default is checked in the committed file.
        self.assertIn(channels["feedUrl"], channels["channels"].values())
        import subprocess
        committed = subprocess.run(["git", "show", "HEAD:runtime/channel.json"], cwd=ROOT, capture_output=True, text=True)
        if committed.returncode == 0:
            self.assertEqual(json.loads(committed.stdout)["feedUrl"], channels["channels"]["test"],
                             "builds outside CI default to test")
        for url in channels["channels"].values():
            self.assertTrue(url.startswith("https://raw.githubusercontent.com/ssorgatem/tesl-reborn-android/"))
        # The Game Data fallback for setups without hookChannels must not drift.
        java = (ROOT / "android-setup/src/org/teslreborn/setup/ResourceActivity.java").read_text(encoding="utf-8")
        self.assertIn('"' + channels["channels"]["stable"] + '"', java)
        self.assertIn('"' + channels["channels"]["test"] + '"', java)


if __name__ == "__main__":
    unittest.main()
