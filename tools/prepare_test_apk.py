#!/usr/bin/env python3
"""Replace the loader in a complete working APK, retaining its existing cache."""
import argparse
import hashlib
from pathlib import Path
import zipfile

from apk_tools import repack
from prepare_emojis import FILES

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Existing complete, patched arm64 APK; not an XAPK')
    parser.add_argument('--output', type=Path, required=True, help='A new unsigned APK')
    args = parser.parse_args()
    with zipfile.ZipFile(args.source) as archive:
        for name in ['lib/arm64-v8a/libgadget.so', 'lib/arm64-v8a/libgadget.config.so', 'lib/arm64-v8a/libhook.js.so']:
            archive.getinfo(name)
        if not any(n.startswith('assets/tesl-payload/') for n in archive.namelist()):
            raise ValueError('Use an existing complete APK with its cache payload, not the small patched base APK')
    resources = {}
    for name, expected in FILES.items():
        data = (ROOT / 'resources/emojis' / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError('Invalid emoji resource; rerun tools/prepare_emojis.py')
        resources['assets/tesl-reborn/emojis/' + name] = data
    hook = (ROOT / 'hook.js').read_bytes()
    if b'createRebornUpdater' not in hook:
        raise ValueError('Build the stable loader first: npm run build')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    repack(args.source, args.output, hook, resources)
    print(f'UNSIGNED_READY: {args.output.resolve()}')
    print('Sign with the same APK certificate before installing. The original APK was kept.')


if __name__ == '__main__':
    main()
