"""Optional >2 GiB CLI integration check; needs about 4.5 GiB of temporary space."""
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from apk_tools import HOOK_ENTRY, verify_classic_zip


def main():
    limit = zipfile.ZIP64_LIMIT
    with tempfile.TemporaryDirectory() as directory:
        source, output = Path(directory) / 'source.apk', Path(directory) / 'output.apk'
        with source.open('wb') as stream:
            stream.seek((1 << 31) + 4096)
            stream.write(b'\0')
        try:
            zipfile.ZIP64_LIMIT = (1 << 32) - 1
            with zipfile.ZipFile(source, 'a', allowZip64=False) as archive:
                for name, content in {
                    HOOK_ENTRY: b'old hook',
                    'lib/arm64-v8a/libgadget.so': b'fake native library',
                    'lib/arm64-v8a/libgadget.config.so': b'{}',
                    'lib/arm64-v8a/libmain.so': b'unchanged native library',
                    'assets/tesl-payload/versions.json': b'{}',
                    'assets/tesl-payload/UnityCache/Shared/test/hash/__data': b'unchanged cache',
                    'META-INF/CERT.RSA': b'old signature',
                }.items():
                    archive.writestr(name, content)
        finally:
            zipfile.ZIP64_LIMIT = limit
        subprocess.run([sys.executable, str(ROOT / 'tools/prepare_test_apk.py'), str(source), '--output', str(output)], check=True)
        assert verify_classic_zip(output) > 1 << 31
        with zipfile.ZipFile(source) as old, zipfile.ZipFile(output) as new:
            assert new.read(HOOK_ENTRY) == (ROOT / 'hook.js').read_bytes()
            assert len(new.namelist()) == len(set(new.namelist()))
            for name in old.namelist():
                if name == HOOK_ENTRY or name.startswith('META-INF/'):
                    continue
                assert old.read(name) == new.read(name)
                assert old.getinfo(name).header_offset == new.getinfo(name).header_offset
            assert new.getinfo('assets/tesl-reborn/emojis/people.png').compress_type == zipfile.ZIP_STORED
        assert zipfile.ZIP64_LIMIT == limit
    print('PASS: >2 GiB complete APK CLI, ZIP32 offsets, preserved cache/native offsets and stored emoji resources')


if __name__ == '__main__':
    main()
