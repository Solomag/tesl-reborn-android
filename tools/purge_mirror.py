"""Refresh jsDelivr's copy of a published channel manifest (run after the push).

Phones that cannot reach GitHub (mainland China) read the jsDelivr mirror,
which keeps a branch file for up to 12 hours. Patch files are named by their
sha256 and never change, so only the manifest needs a purge.

  python tools/purge_mirror.py                     # test channel
  python tools/purge_mirror.py --branch main --channel stable
"""
import argparse
import json
import time
import urllib.request
from pathlib import Path

REPO = 'ssorgatem/tesl-reborn-android'
ROOT = Path(__file__).resolve().parents[1]


def fetch_revision(url):
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            return json.load(response).get('revision')
    except Exception as error:
        return f'error: {error}'


def wait_for(label, url, revision, seconds):
    deadline = time.time() + seconds
    while True:
        seen = fetch_revision(url)
        if seen == revision or time.time() > deadline:
            print(f'{label} serves revision {seen}')
            return seen == revision
        time.sleep(15)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--branch', default='android-ui-and-update-loader')
    parser.add_argument('--channel', default='test')
    args = parser.parse_args()
    revision = json.loads((ROOT / 'updates' / args.channel / 'manifest.json').read_text(encoding='utf-8'))['revision']
    # A purge before GitHub serves the new commit re-caches the old file, and
    # jsDelivr then refuses further purges of the path for about an hour.
    if not wait_for('GitHub', f'https://raw.githubusercontent.com/{REPO}/{args.branch}/updates/{args.channel}/manifest.json', revision, 600):
        raise SystemExit('GitHub does not serve the local manifest yet (pushed?); not purging')
    path = f'gh/{REPO}@{args.branch}/updates/{args.channel}/manifest.json'
    with urllib.request.urlopen(f'https://purge.jsdelivr.net/{path}', timeout=60) as response:
        result = json.load(response)
    print(f'purge {path}: {json.dumps(result.get("paths", result))[:300]}')
    if not wait_for('jsDelivr', f'https://cdn.jsdelivr.net/{path}', revision, 180):
        print('jsDelivr still serves the old manifest; it refreshes by itself within 12 hours')

if __name__ == '__main__':
    main()
