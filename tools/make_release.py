#!/usr/bin/env python3
"""Prepare an Android hook release for the loader, not a PC BepInEx archive."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

HEADER = '// TESL-REBORN-ANDROID-CORE v1\n'


def release_metadata(code, revision, version):
    if not code.startswith(HEADER) or 'TeslRebornUpdater' not in code:
        raise ValueError('Expected a compatible Android core with loader readiness support')
    if code.startswith('📦') or len(code.encode()) > 4 * 1024**2:
        raise ValueError('Expected plain bundled JavaScript, at most 4 MiB')
    if not isinstance(revision, int) or not 1 <= revision <= 9007199254740991:
        raise ValueError('Revision must be a positive safe integer')
    if not re.fullmatch(r'[a-zA-Z0-9._+\-]{1,80}', version):
        raise ValueError('Invalid Android release version')
    return dict(schema=1, format='tesl-reborn-hook-v1', loaderApi=1,
                gameVersionCode=11009, abi='arm64-v8a', revision=revision,
                version=version, bytes=len(code.encode()),
                sha256=hashlib.sha256(code.encode()).hexdigest())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hook', type=Path, default=Path(__file__).resolve().parents[1] / 'runtime' / 'core.js')
    parser.add_argument('--revision', type=int, required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--url', help='Public HTTPS URL of this immutable hook file')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    code = args.hook.read_bytes().decode('utf-8')
    meta = release_metadata(code, args.revision, args.version)
    if args.url:
        url = urlsplit(args.url)
        if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError('Use a public HTTPS URL without credentials/query/fragment')
        meta['url'] = args.url
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'hook.js').write_bytes(code.encode())
    # Publish the payload before the manifest, including in local inboxes.
    (args.out / 'manifest.json').write_text(json.dumps(meta, indent=2) + '\n', encoding='utf-8')
    print(f'RELEASE_READY: {args.out.resolve()} ({meta["bytes"]} bytes, revision {args.revision})')


if __name__ == '__main__':
    main()
