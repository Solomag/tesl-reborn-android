"""Refresh jsDelivr's copy of a published channel manifest (run after the push).

Phones that cannot reach GitHub (mainland China) read the jsDelivr mirror,
which keeps a branch file for up to 12 hours. Patch files are named by their
sha256 and never change, so only the manifest needs a purge.

  python tools/purge_mirror.py                     # test channel
  python tools/purge_mirror.py --branch main --channel stable
"""
import argparse
import json
import urllib.request

REPO = 'ssorgatem/tesl-reborn-android'


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--branch', default='android-ui-and-update-loader')
    parser.add_argument('--channel', default='test')
    args = parser.parse_args()
    path = f'gh/{REPO}@{args.branch}/updates/{args.channel}/manifest.json'
    with urllib.request.urlopen(f'https://purge.jsdelivr.net/{path}', timeout=60) as response:
        result = json.load(response)
    print(f'purge {path}: {json.dumps(result.get("paths", result))[:300]}')
    with urllib.request.urlopen(f'https://cdn.jsdelivr.net/{path}', timeout=60) as response:
        revision = json.load(response).get('revision')
    print(f'mirror now serves revision {revision}')


if __name__ == '__main__':
    main()
