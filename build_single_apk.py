#!/usr/bin/env python3
"""Builds a single APK that contains everything: the game with the hook, the
streaming assets (the OBB of the package) and the asset bundles that are not
part of the OBB.

The OBB and the restored bundles are put into the APK as

    assets/tesl-payload/obb.bin     the OBB, written to the place where the
                                    game expects it on the first start
    assets/tesl-payload/cache.bin   the asset bundles for the cache of Unity

The hook (see hook.ts, section "payload from the apk") writes them out on the
first start, so a single APK is enough to install the game.  The APK is
re-signed afterwards, because the signature covers the whole archive.

Usage:

    python3 build_single_apk.py [--apk tesl-reborn.apk] [--obb main.11009...obb]
                                [--cache cache/Shared] [--output tesl-reborn-all.apk]
                                [--no-obb] [--no-cache]

The cache is built with restore_cache.py.
"""

import argparse
import json
import os
import shutil
import struct
import subprocess
import sys
import zipfile
import zlib

PACKAGE = "com.bethsoft.theelderscrollslegends"
VERSION_CODE = "11009"
OBB_NAME = "main.%s.%s.obb" % (VERSION_CODE, PACKAGE)
HERE = os.path.dirname(os.path.abspath(__file__))
PAYLOAD = "assets/tesl-payload"
CACHE_MAGIC = b"TESLCACHE"


def human(size):
    return "%.1f MB" % (size / 1e6)


def build_cache(cache_dir, out):
    """Packs the cache of Unity into one file.

    The format is simple: the magic, the number of the files, then for every
    file its name and its size, and at the end the data of all of them.
    """
    files = []
    for root, _, names in os.walk(cache_dir):
        for name in names:
            path = os.path.join(root, name)
            files.append((os.path.relpath(path, cache_dir), path))
    files.sort()
    header = bytearray(CACHE_MAGIC + struct.pack("<I", len(files)))
    for name, _ in files:
        raw = name.encode("utf-8")
        header += struct.pack("<H", len(raw)) + raw
    for _, path in files:
        header += struct.pack("<Q", os.path.getsize(path))
    with open(out, "wb") as f:
        f.write(header)
        for _, path in files:
            with open(path, "rb") as src:
                shutil.copyfileobj(src, f, 1 << 20)
    return len(files), os.path.getsize(out)


def append_to_apk(src, dst, extra):
    """Copies an APK and appends files to it.

    The files of the APK keep their place in the archive, so the native
    libraries stay aligned and the archive does not have to be aligned again
    (zipalign cannot open an archive that is bigger than two gigabytes).
    """
    stream = 128 * 1024 * 1024
    with zipfile.ZipFile(src) as zin:
        infos = [i for i in zin.infolist()
                 if not i.filename.startswith("META-INF/")]
        with open(src, "rb") as fin, open(dst, "wb") as fout:
            # the local entries of the APK, the old signature is left in the
            # file but is not listed any more
            left = zin.start_dir
            while left:
                raw = fin.read(min(stream, left))
                fout.write(raw)
                left -= len(raw)
            added = []
            for name, path in extra.items():
                offset = fout.tell()
                raw_name = name.encode("utf-8")
                size = os.path.getsize(path)
                # Keep newly stored payload entries aligned too, not only the
                # existing native libraries. A valid local extra field pads
                # the data offset without changing preserved entry offsets.
                padding = (-offset - 30 - len(raw_name) - 4) % 4
                extra_field = struct.pack("<HH", 0xffff, padding) + b"\0" * padding
                # a local file header, the data is stored without a compression
                fout.write(struct.pack("<IHHHHHIIIHH", 0x04034b50, 20, 0, 0, 0, 0,
                                       0, size, size, len(raw_name), len(extra_field)) +
                           raw_name + extra_field)
                crc = 0
                done = 0
                with open(path, "rb") as data:
                    while done < size:
                        raw = data.read(min(stream, size - done))
                        crc = zlib.crc32(raw, crc)
                        fout.write(raw)
                        done += len(raw)
                # the sizes are known only now, they are patched into the local
                # header together with the checksum
                end = fout.tell()
                fout.seek(offset + 14)
                fout.write(struct.pack("<III", crc & 0xffffffff, size, size))
                fout.seek(end)
                added.append((name, crc & 0xffffffff, size, offset))
            # the central directory
            directory = fout.tell()
            for info in infos:
                fout.write(_central_entry(info.filename, info.CRC, info.compress_size,
                                          info.file_size, info.header_offset,
                                          info.compress_type, info.date_time,
                                          info.external_attr, info.create_system))
            for name, crc, size, offset in added:
                fout.write(_central_entry(name, crc, size, size, offset,
                                          zipfile.ZIP_STORED, (1980, 1, 1, 0, 0, 0),
                                          0, 0))
            count = len(infos) + len(added)
            size = fout.tell() - directory
            # the end of the central directory, with zip64 when the archive is
            # bigger than four gigabytes
            if directory > 0xffffffff or count > 0xffff:
                zip64 = fout.tell()
                fout.write(struct.pack("<IQHHIIQQQQ", 0x06064b50, 44, 45, 45, 0, 0,
                                       count, count, size, directory))
                fout.write(struct.pack("<IIQI", 0x07064b50, 0, zip64, 1))
                fout.write(struct.pack("<IHHHHIIH", 0x06054b50, 0, 0, 0xffff,
                                       0xffff, size, 0xffffffff, 0))
            else:
                fout.write(struct.pack("<IHHHHIIH", 0x06054b50, 0, 0, count, count,
                                       size, directory, 0))


def _central_entry(name, crc, comp_size, size, offset, method, date_time,
                   external_attr=0, create_system=0):
    raw = name.encode("utf-8")
    dos_time = ((date_time[3] & 0x1f) << 11 | (date_time[4] & 0x3f) << 5 |
                (date_time[5] & 0x3f))
    dos_date = (((date_time[0] - 1980) & 0x7f) << 9 | (date_time[1] & 0xf) << 5 |
                (date_time[2] & 0x1f))
    return (struct.pack("<IHHHHHHIIIHHHHHII", 0x02014b50, 20, 20, 0, method,
                         dos_time, dos_date, crc, comp_size, size, len(raw),
                         0, 0, 0, 0, 0, offset) + raw)


def find_tool(name, extra=()):
    """Looks for a program in the PATH and in the folders of the other builds."""
    for folder in (HERE, "/tmp/opencode/apkbuild", "/tmp/opencode/buildtools/android-14"):
        path = os.path.join(folder, name)
        if os.path.exists(path):
            return path
    found = shutil.which(name)
    if found:
        return found
    for folder in extra:
        if os.path.isdir(folder):
            for entry in os.listdir(folder):
                if entry.startswith(name):
                    return os.path.join(folder, entry)
    sys.exit("%s was not found" % name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apk", default=os.path.join(HERE, "tesl-reborn.apk"))
    ap.add_argument("--obb", default=os.path.join(HERE, OBB_NAME))
    ap.add_argument("--cache", default=os.path.join(HERE, "cache", "Shared"),
                    help="the cache of Unity, see restore_cache.py")
    ap.add_argument("--output", default=os.path.join(HERE, "tesl-reborn-all.apk"))
    ap.add_argument("--no-obb", action="store_true")
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--work", default=os.path.join(HERE, "work-single"))
    args = ap.parse_args()

    if not os.path.exists(args.apk):
        sys.exit("%s is missing" % args.apk)

    shutil.rmtree(args.work, ignore_errors=True)
    os.makedirs(args.work)

    # the payload
    payload = os.path.join(args.work, "payload")
    os.makedirs(payload)
    if not args.no_obb:
        if not os.path.exists(args.obb):
            sys.exit("%s is missing" % args.obb)
        shutil.copyfile(args.obb, os.path.join(payload, "obb.bin"))
        print("payload: the OBB (%s)" % human(os.path.getsize(args.obb)))
    versions_src = os.path.join(HERE, "versions.json")
    if os.path.isfile(versions_src):
        shutil.copyfile(versions_src, os.path.join(payload, "versions.json"))
        print("payload: versions.json (%s)" % human(os.path.getsize(versions_src)))

    if not args.no_cache:
        if not os.path.isdir(args.cache):
            sys.exit("%s is missing, run restore_cache.py first" % args.cache)
        # include cache files as individual entries (not packed into cache.bin)
        cache_count = 0
        cache_size = 0
        for root, _, names in os.walk(args.cache):
            for name in names:
                path = os.path.join(root, name)
                relpath = os.path.relpath(path, args.cache)
                entry_name = "assets/tesl-payload/UnityCache/Shared/%s" % relpath
                # store in payload dir for append_to_apk
                target = os.path.join(payload, "UnityCache", "Shared", relpath)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                shutil.copyfile(path, target)
                cache_count += 1
                cache_size += os.path.getsize(path)
        print("payload: %d cache files (%s)" % (cache_count, human(cache_size)))

    # the new APK: the files of the patched APK keep their place, the payload
    # is appended, so the native libraries stay aligned
    unsigned = os.path.join(args.work, "unsigned.apk")
    payload_files = {}
    for root, _, names in os.walk(payload):
        for name in names:
            path = os.path.join(root, name)
            relpath = os.path.relpath(path, payload)
            payload_files["%s/%s" % (PAYLOAD, relpath)] = path
    append_to_apk(args.apk, unsigned, payload_files)

    # sign (the same debug key as the other builds); zipalign is skipped, it
    # cannot open an archive that is bigger than two gigabytes and the files of
    # the APK keep their place anyway
    signer = find_tool("uber-apk-signer.jar")
    subprocess.check_call(["java", "-jar", signer, "-a", unsigned,
                           "--allowResign", "--skipZipAlign", "--out", args.work])
    signed = [f for f in os.listdir(args.work) if f.endswith("-debugSigned.apk")][0]
    shutil.move(os.path.join(args.work, signed), args.output)

    print("built %s (%s)" % (args.output, human(os.path.getsize(args.output))))
    with zipfile.ZipFile(args.output) as z:
        for info in z.infolist():
            if info.filename.startswith(PAYLOAD):
                print("   %-50s %s" % (info.filename, human(info.file_size)))


if __name__ == "__main__":
    main()
