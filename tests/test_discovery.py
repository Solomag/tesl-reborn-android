from pathlib import Path
import tempfile
import unittest
from unittest import mock

from builder import discovery


class FindGamesTest(unittest.TestCase):
    def test_game_folders_are_found_once_and_others_skipped(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            game = root / "games/The Elder Scrolls Legends"
            (game / "The Elder Scrolls Legends_Data/StreamingAssets/contentpack_x").mkdir(parents=True)
            empty = root / "games/Legends demo"
            empty.mkdir(parents=True)
            found = discovery.find_games([game, empty, root / "missing", game])
            self.assertEqual(found, [game.resolve()])

    def test_the_bethesda_launcher_folder_is_searched(self):
        with tempfile.TemporaryDirectory() as folder:
            launcher = Path(folder) / "Bethesda.net Launcher"
            game = launcher / "games/The Elder Scrolls Legends"
            (game / "The Elder Scrolls Legends_Data/StreamingAssets/appbase").mkdir(parents=True)
            with mock.patch.object(discovery, "steam_libraries", return_value=[Path(folder) / "no-steam"]), \
                    mock.patch.object(discovery, "_uninstall_locations",
                                      side_effect=lambda pattern: [launcher] if "Launcher" in pattern else []):
                self.assertIn(game.resolve(), discovery.find_games())


if __name__ == "__main__":
    unittest.main()
