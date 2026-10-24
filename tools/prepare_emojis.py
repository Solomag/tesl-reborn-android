#!/usr/bin/env python3
"""Extract the pinned emoji atlas from an official PC Reborn plugin archive."""
import argparse
import hashlib
import io
from pathlib import Path
import urllib.request
import zipfile

URL = 'https://tesl-reborn.com/download/tesl-reborn-plugin-1.3.1-beta.zip'
FILES = {
    'people.json': 'ea39cac729868b482d2147ef8c5758d9f23f605cfd5eedcb9d9117408e71531d',
    'people.png': '95198a82da017136cb923b655cbe0c83d40456404bef87c86e8a2ae9e67fb4aa',
}


def extract(data, output):
    verified = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for name, expected in FILES.items():
            entry = archive.getinfo('BepInEx/plugins/TeslRebornPlugin/data/images/emojis/' + name)
            if entry.file_size > 2 * 1024**2:
                raise ValueError('Emoji resource exceeds size limit')
            content = archive.read(entry)
            if hashlib.sha256(content).hexdigest() != expected:
                raise ValueError('Unexpected emoji resource hash: ' + name)
            verified[name] = content
    output.mkdir(parents=True, exist_ok=True)
    for name, content in verified.items():
        (output / name).write_bytes(content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, help='Use an already downloaded PC plugin ZIP')
    args = parser.parse_args()
    if args.archive:
        data = args.archive.read_bytes()
    else:
        with urllib.request.urlopen(URL, timeout=60) as response:
            data = response.read(16 * 1024**2 + 1)
        if len(data) > 16 * 1024**2:
            raise ValueError('Plugin archive exceeds download size limit')
    output = Path(__file__).resolve().parents[1] / 'resources' / 'emojis'
    extract(data, output)
    print(f'EMOJIS_READY: {output}')


if __name__ == '__main__':
    main()
