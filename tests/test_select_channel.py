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
        self.assertEqual(channels["feedUrl"], channels["channels"]["test"], "builds outside CI default to test")
        for url in channels["channels"].values():
            self.assertTrue(url.startswith("https://raw.githubusercontent.com/ssorgatem/tesl-reborn-android/"))


if __name__ == "__main__":
    unittest.main()
