#!/usr/bin/env python3
"""Puts the downloadable asset bundles into the Unity cache of the Android client.

The original CDN of the game (s3.us-east-2.amazonaws.com/countdown-assetbundle)
is gone, so the bundles that are not part of the OBB cannot be downloaded any
more.  Those bundles are still needed:

  * the "filemanifest" bundles of the content packs - they contain the map
    from an asset path to the bundle that holds the asset.  Without them the
    card art is not in the asset map and the game shows placeholders.
  * the localized audio bundles - they hold the voice clips of the cards.

The Windows version of the game (tesl-linux/game) still has all of them in its
StreamingAssets folder, and the bundles are identical apart from the target
platform: the Android player refuses a bundle that was built for another build
target ("not built with the right version or build target").  So the build
target of the bundle header is patched to Android.

The cache entry of a bundle lives in

    <cache>/Shared/<name of the bundle>/<hash of the bundle>/__data

and the file "__info" next to it holds the time of the last use, which decides
when Unity removes the entry again.

Usage:

    python3 restore_cache.py [--push] [--serial 38081FDJG00CE2]

Without "--push" the cache is only written to ./cache/Shared.
"""

import argparse
import json
import os
import subprocess
import sys
import time

import UnityPy
from UnityPy.enums import BuildTarget
from UnityPy.files import BundleFile

REPO = os.path.realpath(os.path.dirname(os.path.abspath(__file__)))
# the bundles of the Windows game, either in the tesl-linux folder (they are
# links there) or in the original game folder
CANDIDATES = []
for base in (os.getcwd(), REPO, os.path.dirname(REPO)):
    for name in ("tesl-linux", "TESL"):
        CANDIDATES.append(os.path.join(base, name))
        CANDIDATES.append(os.path.join(base, name, "game"))
WINDOWS_ASSETS = None
for candidate in CANDIDATES:
    candidate = os.path.realpath(candidate)
    for folder in (os.path.join(candidate, "The Elder Scrolls Legends_Data",
                                "StreamingAssets"),
                   os.path.join(candidate, "game", "The Elder Scrolls Legends_Data",
                                "StreamingAssets")):
        if os.path.isdir(folder):
            WINDOWS_ASSETS = folder
            break
    if WINDOWS_ASSETS:
        break
VERSIONS = os.path.join(REPO, "versions.json")
CACHE = os.path.join(REPO, "cache", "Shared")
DEVICE_CACHE = ("/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/"
                "UnityCache")
PACKAGE = "com.bethsoft.theelderscrollslegends"

ANDROID = BuildTarget.Android.value        # the build target of the player
LANGUAGES = {"en_us": 0, "de_de": 1, "es_es": 2, "es_mx": 3, "fr_fr": 4,
             "it_it": 5, "pl_pl": 6, "pt_br": 7, "ru_ru": 8, "tr_tr": 9}


def patch_platform(src, dst):
    """Copies a bundle and sets its build target to Android."""
    env = UnityPy.load(src)
    out = None
    patched = 0
    for name, f in env.files.items():
        if isinstance(f, BundleFile):
            for sub in f.files.values():
                if hasattr(sub, "_m_target_platform"):
                    patched += 1
                    sub._m_target_platform = ANDROID
                    sub.target_platform = BuildTarget(ANDROID)
            out = f.save(packer="original")
    if out is None or patched == 0:
        raise ValueError("%s does not contain a bundle" % src)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst + ".part", "wb") as f:
        f.write(out)
    os.replace(dst + ".part", dst)
    return len(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--push", action="store_true",
                    help="copy the cache to the device")
    ap.add_argument("--serial", default=None, help="the device to use")
    ap.add_argument("--language", default="en_us", choices=LANGUAGES,
                    help="the language of the audio bundles (en_us, de_de, ...)")
    ap.add_argument("--assets", default=None,
                    help="the StreamingAssets folder of the Windows game")
    args = ap.parse_args()

    global WINDOWS_ASSETS
    if args.assets:
        WINDOWS_ASSETS = os.path.realpath(args.assets)
    if not WINDOWS_ASSETS or not os.path.isdir(WINDOWS_ASSETS):
        sys.exit("the assets of the Windows game were not found, use --assets")

    if not os.path.exists(VERSIONS):
        sys.exit("versions.json is missing, copy it from the device:\n"
                 "  adb shell cat /sdcard/Android/data/%s/files/versions.json > versions.json"
                 % PACKAGE)
    versions = json.load(open(VERSIONS))
    entries = versions["_entries"] if isinstance(versions, dict) else versions

    loc_code = LANGUAGES[args.language]
    wanted = [e for e in entries
              if e["StorageMode"] == 0
              and (e["LocCode"] == loc_code or "filemanifest" in e["BundleName"])]

    # Do not silently produce an incomplete language pack with exit status 0.
    missing = [e["BundleName"] for e in wanted
               if not os.path.isfile(os.path.join(WINDOWS_ASSETS, e["BundleName"]))]
    if missing:
        for name in missing:
            print("missing in the Windows game:", name, file=sys.stderr)
        sys.exit("Incomplete source assets; no bundles were restored")

    now = int(time.time())
    total = 0
    for e in wanted:
        src = os.path.join(WINDOWS_ASSETS, e["BundleName"])
        if not os.path.exists(src):
            print("missing in the Windows game:", e["BundleName"])
            continue
        name = os.path.basename(e["BundleName"])
        entry = os.path.join(CACHE, name, e["BundleHash"])
        os.makedirs(entry, exist_ok=True)
        total += patch_platform(src, os.path.join(entry, "__data"))
        # the time of the last use, Unity removes the entries that are older
        # than the expiration delay of the cache
        open(os.path.join(entry, "__info"), "wb").write(
            ("-1\n%d\n1\n__data\n" % now).encode("ascii"))
    print("%d bundles, %.0f MB" % (len(wanted), total / 1e6))

    if args.push:
        cmd = ["adb"]
        if args.serial:
            cmd += ["-s", args.serial]
        # the bundles live in the "Shared" cache of Unity: the cache folder is
        # <persistent data>/UnityCache/Shared/<bundle name>/<hash>/__data.  adb
        # push copies the *contents* of CACHE, so the "Shared" folder has to be
        # created here (a missing Shared folder means Unity never finds the
        # entries and tries to download them from the dead CDN).
        target = DEVICE_CACHE + "/Shared/"
        subprocess.check_call(cmd + ["shell", "mkdir", "-p", target])
        subprocess.check_call(cmd + ["push", CACHE + "/.", target])
        print("pushed to", target)


if __name__ == "__main__":
    main()
