import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from builder import archive, resources


class Stop(Exception):
    pass


class CancelLongStepsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "catalog.json").write_text(json.dumps({"packs": []}))
        (self.root / "game.obb").write_bytes(b"x" * (9 * 1024 * 1024))

    def tearDown(self):
        resources.checkpoint = lambda: None
        self.temp.cleanup()

    def test_the_data_zip_stops_between_chunks_and_leaves_nothing(self):
        calls = []

        def cancel_on_second():
            calls.append(1)
            if len(calls) == 2:
                raise Stop()

        resources.checkpoint = cancel_on_second
        with self.assertRaises(Stop):
            archive.write_data_archive(self.root, self.root / "data.zip", log=lambda *_: None)
        self.assertEqual(len(calls), 2, "stopped inside the OBB, not after it")
        self.assertFalse((self.root / "data.zip").exists())
        self.assertFalse((self.root / "data.zip.partial").exists())

    def test_the_streamed_zip_is_complete_and_verified(self):
        archive.write_data_archive(self.root, self.root / "data.zip", log=lambda *_: None)
        with zipfile.ZipFile(self.root / "data.zip") as made:
            self.assertEqual(made.namelist(), ["catalog.json", "game.obb"])
            self.assertEqual(made.read("game.obb"), (self.root / "game.obb").read_bytes())
            self.assertIsNone(made.testzip())

    def test_hashing_checks_for_cancel(self):
        resources.checkpoint = lambda: (_ for _ in ()).throw(Stop())
        with self.assertRaises(Stop):
            resources.sha256(self.root / "game.obb")


if __name__ == "__main__":
    unittest.main()
