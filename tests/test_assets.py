import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[1] / 'tools' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


inspector = load('inspect_obb')
emojis = load('prepare_emojis')


class AssetsTest(unittest.TestCase):
    def test_manifest_does_not_prove_physical_presence(self):
        entries = [dict(BundleName='pack/en/audio', LocCode=0, StorageMode=0),
                   dict(BundleName='pack/ru/audio', LocCode=7, StorageMode=0),
                   dict(BundleName='different/en/audio', LocCode=0, StorageMode=1)]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'test.obb'
            for manifest in [entries, {'_entries': entries}]:
                with zipfile.ZipFile(path, 'w') as archive:
                    archive.writestr('assets/versions.json', json.dumps(manifest))
                    archive.writestr('assets/pack/en/audio', b'en')
                report = inspector.inspect(path)
                self.assertEqual(report['languages']['ru_ru']['manifestEntries'], 1)
                self.assertEqual(report['languages']['ru_ru']['exactArchiveMatches'], 0)
                self.assertEqual(report['languages']['en_us']['exactArchiveMatches'], 1)
                self.assertEqual(report['languages']['en_us']['basenameCandidates'], 1)

    def test_wrapper_is_reported_without_extracting(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'wrapper.zip'
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('Android/obb/package/main.11009.package.obb', b'not extracted')
            with self.assertRaisesRegex(ValueError, 'wrapper'):
                inspector.inspect(path)

    def test_emoji_archive_verifies_before_writing(self):
        content = io.BytesIO()
        with zipfile.ZipFile(content, 'w') as archive:
            archive.writestr('BepInEx/plugins/TeslRebornPlugin/data/images/emojis/people.json', b'wrong')
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'emojis'
            with self.assertRaisesRegex(ValueError, 'hash'):
                emojis.extract(content.getvalue(), output)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
