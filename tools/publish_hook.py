#!/usr/bin/env python3
"""Prepare a Git-hosted update channel; does not commit, push, or open a PR."""
import argparse
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

from make_release import release_metadata

ROOT = Path(__file__).resolve().parents[1]


def prepare(code, revision, version, base_url, channel, output):
    url = urlsplit(base_url)
    if (url.scheme != 'https' or not url.hostname or url.username or url.password or
            url.query or url.fragment or not re.fullmatch(r'[A-Za-z0-9._~/-]*', url.path) or
            '..' in url.path.split('/')):
        raise ValueError('Use a public HTTPS base URL without credentials, query or fragment')
    if not re.fullmatch(r'[a-z0-9-]{1,40}', channel):
        raise ValueError('Invalid channel name')
    meta = release_metadata(code, revision, version)
    relative = f'payloads/{meta["sha256"]}.js'
    meta['url'] = base_url.rstrip('/') + '/' + relative
    manifest = output / channel / 'manifest.json'
    if manifest.exists():
        old = json.loads(manifest.read_text(encoding='utf-8'))
        if revision <= old['revision']:
            raise ValueError('Channel revision must increase')
    payload = output / relative
    if payload.exists() and payload.read_bytes() != code.encode('utf-8'):
        raise ValueError('Existing content-addressed payload differs')
    payload.parent.mkdir(parents=True, exist_ok=True)
    payload.write_bytes(code.encode('utf-8'))
    manifest.parent.mkdir(parents=True, exist_ok=True)
    temp = manifest.with_suffix('.json.tmp')
    # LF on every system: the manifest is served as it is committed.
    temp.write_text(json.dumps(meta, indent=2) + '\n', encoding='utf-8', newline='\n')
    temp.replace(manifest)
    prune(output)
    return manifest


def prune(output):
    """Remove payloads no channel manifest points at. Devices only fetch the
    current one (rollback uses the loader's local copy); Git history keeps
    the rest."""
    kept = set()
    for path in output.glob('*/manifest.json'):
        try:
            kept.add(json.loads(path.read_text(encoding='utf-8'))['sha256'])
        except (ValueError, KeyError):
            return []  # A manifest that cannot be read: leave everything.
    removed = []
    for payload in (output / 'payloads').glob('*.js'):
        if payload.stem not in kept:
            payload.unlink()
            removed.append(payload.name)
    return removed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hook', type=Path, default=ROOT / 'runtime/core.js')
    parser.add_argument('--revision', type=int, required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--base-url', required=True, help='Public HTTPS URL of the output updates directory')
    parser.add_argument('--channel', default='test')
    parser.add_argument('--out', type=Path, default=ROOT / 'updates')
    args = parser.parse_args()
    if args.hook.resolve() == (ROOT / 'runtime/core.js').resolve():
        # The built core carries its own revision and version (npm run build);
        # publishing it under other ones would leave the APK's embedded copy
        # and the feed disagreeing about what is installed.
        built = json.loads((ROOT / 'runtime/manifest.json').read_text(encoding='utf-8'))
        if (args.revision, args.version) != (built['revision'], built['version']):
            raise SystemExit(f"runtime/manifest.json is revision {built['revision']} {built['version']}: "
                             'bump it and run npm run build, or pass the same values')
    manifest = prepare(args.hook.read_bytes().decode('utf-8'), args.revision, args.version,
                       args.base_url, args.channel, args.out)
    print(f'CHANNEL_READY: {manifest}')
    print('Commit and push the payload plus manifest. No network publication was performed.')


if __name__ == '__main__':
    main()
