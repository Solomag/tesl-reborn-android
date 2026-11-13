"""tools/plugin_watch.py: the release check and the pieces of the report
that do not need a real plugin archive (that one is not in git)."""
import importlib.util
import io
from pathlib import Path
import struct
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("plugin_watch", ROOT / "tools/plugin_watch.py")
watch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(watch)


def plugin_zip(files):
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return data.getvalue()


class PluginWatchTest(unittest.TestCase):
    def test_the_download_page_names_the_release(self):
        html = '<a href="/download">x</a><a class="btn" href="/download/tesl-reborn-plugin-1.3.2-beta.zip">Get</a>'
        self.assertEqual(watch.releases_on(html), ["1.3.2-beta"])
        self.assertEqual(watch.releases_on("<html>no link</html>"), [])

    def test_the_hook_version_is_read(self):
        self.assertRegex(watch.pinned_version(), r"^\d+\.\d+\.\d+")

    def test_tokens_are_compared_by_what_they_name(self):
        names = {0x70000001: 'str "hello"', 0x0A000002: "Debug::Log", 0x70000009: 'str "hello"'}
        one = bytes([0x72]) + struct.pack("<I", 0x70000001) + bytes([0x28]) + struct.pack("<I", 0x0A000002) + bytes([0x2A])
        moved = bytes([0x72]) + struct.pack("<I", 0x70000009) + bytes([0x28]) + struct.pack("<I", 0x0A000002) + bytes([0x2A])
        self.assertEqual(watch.normalized_il(one, names.get), watch.normalized_il(moved, names.get),
                         "the same string at another heap offset is the same code")
        self.assertEqual(watch.normalized_il(one, names.get)[0], '72 str "hello"')
        switch = bytes([0x45]) + struct.pack("<I", 2) + struct.pack("<ii", 4, 8) + bytes([0xFE, 0x0C, 1, 0, 0x2A])
        self.assertEqual(len(watch.normalized_il(switch, names.get)), 3)
        with self.assertRaises(ValueError):
            watch.normalized_il(bytes([0x24]), names.get)

    def test_debug_and_release_builds_of_the_same_code_match(self):
        # GetPath of plugin 1.2.0 (Debug) and 1.2.2 (Release), as normalized.
        debug = ["0", "28 System.Reflection.Assembly::GetExecutingAssembly", "6f System.Reflection.Assembly::get_Location",
                 "28 System.IO.Path::GetDirectoryName", "a", "2b 00", "6", "2a"]
        release = ["28 System.Reflection.Assembly::GetExecutingAssembly", "6f System.Reflection.Assembly::get_Location",
                   "28 System.IO.Path::GetDirectoryName", "2a"]
        self.assertEqual(watch.essential(debug), watch.essential(release))
        self.assertEqual(watch.essential(["2", "28 System.Attribute::.ctor", "0", "2a"]),
                         watch.essential(["2", "28 System.Attribute::.ctor", "2a"]))
        self.assertNotEqual(watch.essential(["28 A::B", "2a"]), watch.essential(["28 A::C", "2a"]), "another call is a change")

    def test_the_dll_is_found_where_each_release_keeps_it(self):
        self.assertEqual(watch.find_dll(["BepInEx/plugins/TeslRebornPlugin.dll", "x.txt"]), "BepInEx/plugins/TeslRebornPlugin.dll")
        self.assertEqual(watch.find_dll([watch.DLL, "BepInEx/plugins/TeslRebornPlugin/data/titles.json"]), watch.DLL)
        self.assertIsNone(watch.find_dll(["readme.txt"]))

    def test_harmony_patch_arguments(self):
        ser = lambda text: bytes([len(text)]) + text
        blob = b"\x01\x00" + ser(b"EndGameState, Assembly-CSharp, V") + ser(b"OnEnable") + b"\x00\x00"
        self.assertEqual(watch.ser_strings(blob), ["EndGameState, Assembly-CSharp, V", "OnEnable"])

    def test_the_hook_lines_for_a_patch_target(self):
        hits = watch.hook_lines({"EndGameState"})
        self.assertTrue(any(hit.startswith("hook/") for hit in hits), "the port patches EndGameState")
        self.assertEqual(watch.hook_lines(set()), [])
        self.assertTrue(watch.hook_lines({"IsCachingDisabled"}), "a property is found as its get_ accessor")
        self.assertEqual(watch.specific(["SparkleServices.Friends.Update", "Awake"]), {"Friends"},
                         "namespaces and Unity messages say nothing about where a patch is")

    def test_data_and_emoji_changes_are_reported(self):
        folder = "BepInEx/plugins/TeslRebornPlugin/data/"
        old = plugin_zip({folder + "titles.json": '{"a": 1}\n', folder + "images/emojis/people.png": b"old"})
        new = plugin_zip({folder + "titles.json": '{"a": 2}\n', folder + "images/emojis/people.png": b"new",
                          folder + "translations/xx.json": "{}"})
        report = watch.compare("1.0", old, "1.1", new)
        self.assertIn("translations/xx.json", report)
        self.assertIn('+{"a": 2}', report)
        self.assertIn("EMOJI_FILES", report)
        self.assertIn("people.png", report)
        self.assertIn("No file changed.", watch.compare("1.0", old, "1.0", old))


if __name__ == "__main__":
    unittest.main()
