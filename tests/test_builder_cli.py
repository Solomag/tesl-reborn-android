"""The windowless build (Builder --build): its log file and exit codes."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

from builder import cli


class CliTest(unittest.TestCase):
    def run_cli(self, *args, build=None):
        saved = sys.stdout, sys.stderr
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "build.log"
            try:
                with mock.patch.object(cli, "build", build or mock.Mock(return_value=Path(tmp) / "out")):
                    code = cli.main(["--xapk", "x.xapk", "--game", tmp, "--log", str(log), *args])
            finally:
                sys.stdout, sys.stderr = saved
            return code, log.read_text(encoding="utf-8")

    def test_a_finished_build_ends_with_its_folder(self):
        code, text = self.run_cli("--format", "apk")
        self.assertEqual(code, 0)
        self.assertIn("BUILD_READY:", text.splitlines()[-1])

    def test_a_failed_build_says_why_and_exits_non_zero(self):
        code, text = self.run_cli("--format", "apk", build=mock.Mock(side_effect=ValueError("no space")))
        self.assertEqual(code, 1)
        self.assertEqual(text.splitlines()[-1], "BUILD_FAILED: ValueError: no space")

    def test_bad_arguments_are_written_to_the_log(self):
        # The packaged Builder has no console: argparse's message must not be lost.
        code, text = self.run_cli("--format", "zip")
        self.assertEqual(code, 2)
        self.assertIn("invalid choice", text)
        self.assertEqual(text.splitlines()[-1], "BUILD_FAILED: bad arguments")


if __name__ == "__main__":
    unittest.main()
