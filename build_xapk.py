#!/usr/bin/env python3
"""Builds an installable XAPK of the TESL Reborn Android client.

The XAPK holds everything that is needed to install the game:

    <package>.apk                                     the patched APK (with the hook)
    icon.png                                          the icon of the game
    Android/obb/<package>/main.<code>.<package>.obb   the streaming assets
    manifest.json                                     the description of the package

The layout is the one of the XAPK files of APKPure, so the XAPK can be
installed with the usual launchers (or with "adb install" after the APK and
the OBB have been unpacked).

Usage:

    python3 build_xapk.py [--apk tesl-reborn.apk] [--obb main.11009...obb]
                          [--xapk The+Elder+...xapk] [--output tesl-reborn.xapk]
                          [--icon icon.png --manifest manifest.json]

With --icon and --manifest together the original XAPK is not needed.
"""

import argparse
import json
import os
import sys
import zipfile

from build_single_apk import OBB_NAME, PACKAGE, VERSION_CODE

VERSION_NAME = "2.17.0"
HERE = os.path.dirname(os.path.abspath(__file__))
OBB_IN_XAPK = "Android/obb/%s/%s" % (PACKAGE, OBB_NAME)


def human(size):
    return "%.1f MB" % (size / 1e6)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apk", default=os.path.join(HERE, "tesl-reborn.apk"),
                    help="the patched APK")
    ap.add_argument("--obb", default=os.path.join(HERE, OBB_NAME),
                    help="the OBB with the streaming assets")
    ap.add_argument("--xapk", default=os.path.join(
        HERE, "The+Elder+Scrolls_+Legends_2.17.0_APKPure.xapk"),
        help="the original XAPK, the icon and the manifest come from it")
    ap.add_argument("--icon", help="icon.png, replaces the one of the original XAPK (needs --manifest)")
    ap.add_argument("--manifest", help="manifest.json, replaces the one of the original XAPK (needs --icon)")
    ap.add_argument("--output", default=os.path.join(HERE, "tesl-reborn.xapk"),
                    help="the XAPK to write")
    args = ap.parse_args()

    if bool(args.icon) != bool(args.manifest):
        sys.exit("--icon and --manifest go together")
    own = bool(args.icon)
    for path in (args.apk, args.obb, *((args.icon, args.manifest) if own else (args.xapk,))):
        if not os.path.exists(path):
            sys.exit("%s is missing" % path)

    # the icon and the manifest, from the files or from the original package
    if own:
        with open(args.icon, "rb") as f:
            icon = f.read()
        with open(args.manifest, "rb") as f:
            manifest = json.loads(f.read())
    else:
        with zipfile.ZipFile(args.xapk) as original:
            icon = original.read("icon.png")
            manifest = json.loads(original.read("manifest.json"))

    apk_size = os.path.getsize(args.apk)
    obb_size = os.path.getsize(args.obb)

    # the description of the package
    manifest["total_size"] = apk_size + obb_size + len(icon)
    manifest["split_apks"] = [{"file": "%s.apk" % PACKAGE, "id": "base"}]
    manifest["expansions"] = [{
        "file": OBB_IN_XAPK,
        "install_location": "EXTERNAL_STORAGE",
        "install_path": OBB_IN_XAPK,
    }]
    manifest["version_code"] = VERSION_CODE
    manifest["version_name"] = VERSION_NAME
    manifest["package_name"] = PACKAGE

    print("APK  %s (%s)" % (os.path.basename(args.apk), human(apk_size)))
    print("OBB  %s (%s)" % (OBB_NAME, human(obb_size)))

    tmp = args.output + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_STORED, allowZip64=True) as out:
        # the APK
        out.write(args.apk, "%s.apk" % PACKAGE)
        # the icon
        out.writestr("icon.png", icon)
        # the manifest
        out.writestr("manifest.json", json.dumps(manifest, separators=(",", ":")))
        # the streaming assets, they are read from the OBB of the package
        out.write(args.obb, OBB_IN_XAPK)
    # the archive is tested before it takes the final name
    with zipfile.ZipFile(tmp) as z:
        bad = z.testzip()
    if bad:
        sys.exit("the archive is broken: %s (left as %s)" % (bad, tmp))
    os.replace(tmp, args.output)

    print("wrote %s (%s)" % (args.output, human(os.path.getsize(args.output))))
    with zipfile.ZipFile(args.output) as z:
        for info in z.infolist():
            print("   %-70s %s" % (info.filename, human(info.file_size)))


if __name__ == "__main__":
    main()
