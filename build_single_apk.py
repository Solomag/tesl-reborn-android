#!/usr/bin/env python3
"""Builds a single APK that contains everything: the game with the hook, the
streaming assets (the OBB of the package) and the asset bundles that are not
part of the OBB.

The OBB, the restored bundles and versions.json are put into the APK as

    assets/tesl-payload/obb.bin                    the OBB, written to the place
                                                   where the game expects it on
                                                   the first start
    assets/tesl-payload/UnityCache/Shared/<path>   the asset bundles for the cache
                                                   of Unity, one entry per file
    assets/tesl-payload/versions.json              the bundle inventory

The hook (see hook.ts, section "payload from the apk") writes them out on the
first start, so a single APK is enough to install the game.  The APK is
re-signed afterwards, because the signature covers the whole archive.

Usage:

    python3 build_single_apk.py [--apk tesl-reborn.apk] [--obb main.11009...obb]
                                [--cache cache/Shared] [--output tesl-reborn-all.apk]
                                [--no-obb] [--no-cache] [--no-versions]

The cache is built with restore_cache.py.
"""

import argparse
import os
import shutil
import struct
import subprocess
import sys
import zipfile
import zlib

# build_xapk.py imports these; hook.ts obbPath() repeats the OBB name and must change together with them
PACKAGE = "com.bethsoft.theelderscrollslegends"
VERSION_CODE = "11009"
OBB_NAME = "main.%s.%s.obb" % (VERSION_CODE, PACKAGE)
HERE = os.path.dirname(os.path.abspath(__file__))
PAYLOAD = "assets/tesl-payload"


def human(size):
    return "%.1f MB" % (size / 1e6)


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
                if not raw:
                    raise IOError("%s ended before its central directory" % src)
                fout.write(raw)
                left -= len(raw)
            added = []
            for name, path in extra.items():
                offset = fout.tell()
                raw_name = name.encode("utf-8")
                size = os.path.getsize(path)
                # a local file header, the data is stored without a compression
                fout.write(struct.pack("<IHHHHHIIIHH", 0x04034b50, 20, 0, 0, 0, 0,
                                       0, size, size, len(raw_name), 0) +
                           raw_name)
                crc = 0
                done = 0
                with open(path, "rb") as data:
                    while done < size:
                        raw = data.read(min(stream, size - done))
                        if not raw:
                            raise IOError("%s shrank while it was read" % path)
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


def find_tool(name):
    """Looks for a file in the folder of this script, then in the PATH."""
    path = os.path.join(HERE, name)
    if os.path.exists(path):
        return path
    found = shutil.which(name)
    if found:
        return found
    sys.exit("%s was not found" % name)


def inside(path, folder):
    """True when path is folder or lies below it."""
    path, folder = os.path.realpath(path), os.path.realpath(folder)
    return path == folder or path.startswith(folder + os.sep)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apk", default=os.path.join(HERE, "tesl-reborn.apk"))
    ap.add_argument("--obb", default=os.path.join(HERE, OBB_NAME))
    ap.add_argument("--cache", default=os.path.join(HERE, "cache", "Shared"),
                    help="the cache of Unity, see restore_cache.py")
    ap.add_argument("--output", default=os.path.join(HERE, "tesl-reborn-all.apk"))
    ap.add_argument("--no-obb", action="store_true")
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--no-versions", action="store_true",
                    help="build without versions.json (the game then has no storage-mode table)")
    ap.add_argument("--work", default=os.path.join(HERE, "work-single"))
    args = ap.parse_args()

    if not os.path.exists(args.apk):
        sys.exit("%s is missing" % args.apk)

    # --work is wiped below: refuse a folder that holds the current directory, this script or an input
    for keep in (os.getcwd(), HERE, args.apk, args.obb, args.cache, args.output):
        if inside(keep, args.work):
            sys.exit("--work %s would wipe %s" % (args.work, keep))

    # the payload files are read in place by append_to_apk, not copied first
    payload_files = {}
    if not args.no_obb:
        if not os.path.exists(args.obb):
            sys.exit("%s is missing" % args.obb)
        payload_files["%s/obb.bin" % PAYLOAD] = args.obb
        print("payload: the OBB (%s)" % human(os.path.getsize(args.obb)))
    versions_src = os.path.join(HERE, "versions.json")
    if not args.no_versions:
        if not os.path.isfile(versions_src):
            sys.exit("%s is missing, pass --no-versions to build without it" % versions_src)
        payload_files["%s/versions.json" % PAYLOAD] = versions_src
        print("payload: versions.json (%s)" % human(os.path.getsize(versions_src)))

    if not args.no_cache:
        if not os.path.isdir(args.cache):
            sys.exit("%s is missing, run restore_cache.py first" % args.cache)
        # the cache files are individual entries
        cache_count = 0
        cache_size = 0
        for root, _, names in os.walk(args.cache):
            for name in names:
                path = os.path.join(root, name)
                relpath = os.path.relpath(path, args.cache).replace(os.sep, "/")
                payload_files["%s/UnityCache/Shared/%s" % (PAYLOAD, relpath)] = path
                cache_count += 1
                cache_size += os.path.getsize(path)
        print("payload: %d cache files (%s)" % (cache_count, human(cache_size)))

    shutil.rmtree(args.work, ignore_errors=True)
    os.makedirs(args.work)

    # the new APK: the files of the patched APK keep their place, the payload
    # is appended, so the native libraries stay aligned
    unsigned = os.path.join(args.work, "unsigned.apk")
    append_to_apk(args.apk, unsigned, payload_files)

    # sign (the same debug key as the other builds); zipalign is skipped, it
    # cannot open an archive that is bigger than two gigabytes and the files of
    # the APK keep their place anyway
    signer = find_tool("uber-apk-signer.jar")
    subprocess.check_call(["java", "-jar", signer, "-a", unsigned,
                           "--allowResign", "--skipZipAlign", "--out", args.work])
    signed = [f for f in os.listdir(args.work) if f.endswith("-debugSigned.apk")][0]
    os.replace(os.path.join(args.work, signed), args.output)

    print("built %s (%s)" % (args.output, human(os.path.getsize(args.output))))
    with zipfile.ZipFile(args.output) as z:
        for info in z.infolist():
            if info.filename.startswith(PAYLOAD):
                print("   %-50s %s" % (info.filename, human(info.file_size)))


if __name__ == "__main__":
    main()
