import contextlib
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from apk_tools import HOOK_ENTRY, repack, verify_classic_zip
from publish_hook import prepare


class PublishingTest(unittest.TestCase):
    def test_channel_hash_and_monotonic_revision(self):
        code = '// TESL-REBORN-ANDROID-CORE v1\nglobalThis.TeslRebornUpdater.ready();'
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = prepare(code, 24, 'test-24', 'https://raw.githubusercontent.com/owner/repo/branch/updates', 'test', root)
            meta = json.loads(path.read_text())
            self.assertEqual(meta['sha256'], hashlib.sha256(code.encode()).hexdigest())
            self.assertEqual((root / 'payloads' / (meta['sha256'] + '.js')).read_text(), code)
            self.assertTrue(meta['url'].endswith('/payloads/' + meta['sha256'] + '.js'))
            with self.assertRaisesRegex(ValueError, 'increase'):
                prepare(code, 24, 'test-24', 'https://example.com/updates', 'test', root)
            prepare(code, 25, 'test-25', 'https://example.com/updates', 'test', root)
            with self.assertRaisesRegex(ValueError, 'HTTPS'):
                prepare(code, 26, 'test-26', 'http://example.com/updates', 'test', root)

    def test_unreferenced_payloads_are_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base = 'https://example.com/updates'
            core = lambda tag: f'// TESL-REBORN-ANDROID-CORE v1\nglobalThis.TeslRebornUpdater.ready(); // {tag}'
            stable = json.loads(prepare(core('stable 1'), 1, 's1', base, 'stable', root).read_text())['sha256']
            old = json.loads(prepare(core('test 1'), 1, 't1', base, 'test', root).read_text())['sha256']
            new = json.loads(prepare(core('test 2'), 2, 't2', base, 'test', root).read_text())['sha256']
            left = {p.stem for p in (root / 'payloads').glob('*.js')}
            self.assertEqual(left, {stable, new}, 'the replaced test payload goes, stable stays')
            self.assertNotIn(old, left)

    def test_repacker_keeps_cache_and_offsets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source, output = root / 'old.apk', root / 'new.apk'
            with zipfile.ZipFile(source, 'w') as archive:
                archive.writestr('lib/arm64-v8a/libmain.so', b'native library placeholder')
                archive.writestr('assets/tesl-payload/UnityCache/Shared/example/hash/__data', b'cache')
                archive.writestr(HOOK_ENTRY, b'old hook')
                archive.writestr('assets/tesl-reborn/emojis/people.json', b'old definitions')
                archive.writestr('META-INF/CERT.SF', b'old signature')
            with zipfile.ZipFile(source) as archive:
                offset = archive.getinfo('lib/arm64-v8a/libmain.so').header_offset
            with contextlib.redirect_stdout(io.StringIO()):
                repack(source, output, b'new hook', {'assets/tesl-reborn/emojis/people.json': b'new definitions'})
            verify_classic_zip(output)
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(archive.getinfo('lib/arm64-v8a/libmain.so').header_offset, offset)
                self.assertEqual(archive.read(HOOK_ENTRY), b'new hook')
                self.assertEqual(archive.read('assets/tesl-payload/UnityCache/Shared/example/hash/__data'), b'cache')
                self.assertEqual(archive.getinfo('assets/tesl-reborn/emojis/people.json').compress_type, zipfile.ZIP_STORED)
                self.assertEqual(archive.namelist().count('assets/tesl-reborn/emojis/people.json'), 1)
                self.assertNotIn('META-INF/CERT.SF', archive.namelist())
            with zipfile.ZipFile(source) as archive:
                self.assertEqual(archive.read(HOOK_ENTRY), b'old hook')


if __name__ == '__main__':
    unittest.main()
