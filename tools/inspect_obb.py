#!/usr/bin/env python3
"""Inventory a local OBB without extracting it or assuming manifest entries exist."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

LANGUAGES = dict(en_us=0, de_de=1, es_es=2, fr_fr=3, it_it=4,
                 pl_pl=5, pt_br=6, ru_ru=7, tr_tr=8)


def inspect(path):
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        manifests = [n for n in names if n in ('assets/versions.json', 'versions.json')]
        if not manifests:
            wrapped = sorted(n for n in names if n.lower().endswith('.obb'))
            if wrapped:
                raise ValueError('This is a wrapper ZIP/XAPK. Extract the OBB first: ' + ', '.join(wrapped))
            raise ValueError('No versions.json found in this archive')
        manifest = sorted(manifests, key=lambda n: n != 'assets/versions.json')[0]
        if archive.getinfo(manifest).file_size > 32 * 1024**2:
            raise ValueError('Manifest exceeds 32 MiB limit')
        data = json.loads(archive.read(manifest))
        entries = data.get('_entries') if isinstance(data, dict) else data
        if not isinstance(entries, list):
            raise ValueError('Expected versions.json list or object with _entries')
        basenames = {Path(n).name for n in names}
        rows = []
        for entry in entries:
            if not isinstance(entry, dict) or not isinstance(entry.get('BundleName'), str):
                raise ValueError('Invalid bundle entry')
            bundle = entry['BundleName'].replace('\\', '/')
            # A basename match is only a hint: it may refer to another content pack.
            exact = next((n for n in (bundle, 'assets/' + bundle) if n in names), None)
            rows.append(dict(bundle=bundle, hash=entry.get('BundleHash'),
                             locCode=entry.get('LocCode'), storageMode=entry.get('StorageMode'),
                             archivePath=exact, basenameCandidate=not exact and Path(bundle).name in basenames))
        summary = {}
        for language, code in LANGUAGES.items():
            localized = [r for r in rows if r['locCode'] == code]
            summary[language] = dict(manifestEntries=len(localized),
                                     exactArchiveMatches=sum(r['archivePath'] is not None for r in localized),
                                     declaredDownloadable=sum(r['storageMode'] == 0 for r in localized),
                                     basenameCandidates=sum(r['basenameCandidate'] for r in localized))
        return dict(schema=1, file=Path(path).name, bytes=Path(path).stat().st_size,
                    archiveEntries=len(names), manifestPath=manifest, languages=summary,
                    note='Manifest entries describe expected bundles. Only archivePath confirms a matching ZIP path; hashes and bundle contents are not validated.',
                    bundles=rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('obb', type=Path)
    parser.add_argument('--output', type=Path, default=Path('obb-report.json'))
    parser.add_argument('--sha256', action='store_true', help='Also read the entire archive to identify it')
    args = parser.parse_args()
    report = inspect(args.obb)
    if args.sha256:
        with args.obb.open('rb') as source:
            report['sha256'] = hashlib.file_digest(source, 'sha256').hexdigest()
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for language, row in report['languages'].items():
        print(f"{language}: manifest={row['manifestEntries']}, exact ZIP paths={row['exactArchiveMatches']}, declared downloadable={row['declaredDownloadable']}, basename hints={row['basenameCandidates']}")
    print(f'REPORT_READY: {args.output}')


if __name__ == '__main__':
    main()
