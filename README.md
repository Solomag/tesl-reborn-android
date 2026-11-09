# TESL Reborn for Android

Play [TESL Reborn](https://tesl-reborn.com), the community server for *The
Elder Scrolls: Legends*, on an Android phone.

You build the Android game yourself with the **Builder** from copies of the game
you already have: the PC game and the original Android XAPK. This repository
contains no game files and none are distributed.

**→ [Installation guide](docs/install.md)** · [What's new](CHANGELOG.md) · [Troubleshooting and bug reports](docs/troubleshooting.md) · [Downloads (Builder)](https://github.com/ssorgatem/tesl-reborn-android/releases)

## Features

- The whole PC client on the phone: collection, deck builder, arena, ladder,
  chat, store.
- Touch controls for things that needed a mouse on PC: card tooltips, match
  history, pinch-to-zoom chat.
- 11 game languages, including a Simplified Chinese text translation.
- Patches over the air on two channels, **Stable** and **Test**; switch in
  *Settings → Game data*.
- Frame-rate limits and adaptive frame rate in battle for phones that run hot.
- A built-in diagnostic report for bug reports.

Requirements: Android 10 or newer (arm64), a Windows or Linux PC for the build,
a TESL Reborn account.

## Documentation

- [Installation](docs/install.md) — building, putting the game on the phone,
  updates, Stable and Test.
- [Troubleshooting](docs/troubleshooting.md) — known issues, common problems,
  how to report a bug.
- [Builder](docs/builder.md) ([на русском](docs/builder-ru.md)) — everything
  the Builder can do, including the command line and Linux.
- [Update channels](docs/release-channels.md) ([на русском](docs/release-channels-ru.md))
  — how patches are published and promoted (for maintainers).
- [Android features and updates](docs/android-updates.md) — what the hook adds
  and how the over-the-air loader works.
- [All documents](docs/README.md).

## For developers: the legacy command-line build

The Builder is the supported way to build. The steps below are the original
manual pipeline, kept for debugging the hook on a device. It builds an offline
XAPK: the OBB ships in the XAPK, recovered cache entries inside its APK.

### Prerequisites

- Linux x86_64.
- Python 3 (3.11+ recommended) with `lief` and `UnityPy`
  (`pip install lief UnityPy`).
- Java JDK (for `zipalign` and `uber-apk-signer.jar`).
- Android build-tools 14 (`android-14-buildtools`, must provide `zipalign`).
- Node.js and npm (`npm ci` installs the pinned build tool).
- A Frida gadget for Android arm64 v8a (the builder pins 17.23.3, written as
  `gadget.so`).
- Minimum Android: 10 (Android 14 was the development target).
- Base artefacts:
  - `base.apk`: a working arm64 / IL2CPP Android base APK of the
    game (renamed to `base.apk`).
  - `main.11009.com.bethsoft.theelderscrollslegends.obb`: the
    original OBB, extracted from the original XAPK. Also copy it from
    `Android/obb/…` of the APKPure package.
  - `versions.json`: the bundle inventory. Extract it from
    `assets/versions.json` inside the OBB.
  - an original XAPK (e.g. the APKPure one, version code 11009) to harvest
    `icon.png` + `manifest.json`.
  - a Windows build of *The Elder Scrolls: Legends* to recover the bundles
    missing from the OBB (tested against the Steam version).

## Build chain

Every command below runs from the repository root, in order.

### 1. Compile the hook

```bash
npm ci
python3 tools/prepare_emojis.py
npm run build
npm test
```
`rebuild_hook.sh` rebuilds both the bundled core and its APK loader.

### 2. Inject the gadget + hook into `base.apk`

```bash
python3 build_apk.py base.apk tesl-reborn-patched.apk
```
`build_apk.py` needs `base.apk`, `gadget.so`, `patched_classes.dex` and
`uber-apk-signer.jar` in the repository root. `patched_classes.dex` is a prebuilt
artefact in the repo (originally `bitter.jnibridge.JNIBridge$a` patched to
avoid the Android 16 default-method dispatch crash; see the Source files note).

### 3. Rebuild the Unity cache

```bash
python3 restore_cache.py --assets "/path/to/The Elder Scrolls Legends_Data"
```
Patches `target_platform` 5 → 13, writes `cache/Shared/<name>/<hash>/__data`
plus `__info`. Verification: ~204 bundles, ~310 MB, 0 failures.

`--push` also pushes `cache/Shared` to the device under
`…/files/UnityCache/Shared` — use it in the manual debug loop.

### 4. Bake the cache into a single APK

```bash
python3 build_single_apk.py --no-obb --apk tesl-reborn-patched.apk \\
    --output tesl-reborn-noobb.apk
```
`--no-obb` is mandatory for the XAPK path (the OBB ships in the XAPK).
`--no-cache` / `--no-versions` should not be used in a real build: they
re-introduce the "asset map" failures that the per-file restore fixes.

Result: `tesl-reborn-noobb.apk` (~409 MB, 408 payload entries +
`versions.json`).

### 5. Build the final XAPK

```bash
python3 build_xapk.py --apk tesl-reborn-noobb.apk \\
    --output tesl-reborn.xapk
```
Reads `icon.png` + `manifest.json` from the original XAPK. Output: ~2.2 GB,
validated with `testzip()`.

## Manual push (debug loop)

Keeps the existing device files so you do not have to reinstall. Useful, for
example, after pushing a new `tesl-reborn.apk`:

```bash
adb install -r tesl-reborn-new.apk
adb shell am force-stop com.bethsoft.theelderscrollslegends
 # (re)push the cache + versions.json if needed:
python3 restore_cache.py --push --assets ".../The Elder Scrolls Legends_Data"
adb shell monkey -p com.bethsoft.theelderscrollslegends -c android.intent.category.LAUNCHER 1
# inspect later:
adb logcat -d -s tesl-hook:I  | tail -40
adb logcat -d -s Unity:E     | tail -20
adb shell screencap -p /sdcard/x.png && adb pull /sdcard/x.png /tmp/x.png
```

Credential file (push once, never commit it; useful for autologin just after installing):

```bash
adb push ./creds/tesl-login.json \\
    /sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/tesl-login.json
```

## Key gotchas

- `Cache_SetExpirationDelay` lives in `x2`, **never** write to `x1`
  (corrupts the cache handle → SIGSEGV).
- Bundle expiration is capped at 12960000 s.
- `__info` files use the format `-1\n<epoch>\n1\n__data\n`.
- `f.save(packer="original")` is mandatory to keep the
  `target_platform 5 → 13` patch without re-encoding the bundle payload.
- `apkPath()` must resolve the package through `/proc/self/maps`. Once an OBB
  is installed, `streamingAssetsPath` returns the OBB's path and the
  per-file payload restore silently breaks.
- Cache files belong under `…/UnityCache/Shared` (one level up ⇒ Unity never
  resolves them and the game re-downloads them from the dead CDN).
- Bump the hook's `log("...")` build marker whenever `hook.ts` changes.

## Source files

- `hook.ts` — the Frida / IL2CPP hook (compiled to `hook.js`).
- `hook.js` — prebuilt compiled hook (regenerate with step 1).
- `build_apk.py` — injects the gadget + hook into `base.apk`.
- `build_single_apk.py` — appends OBB and/or cache to the patched APK.
- `build_xapk.py` — builds the APKPure-like XAPK.
- `restore_cache.py` — recovers bundles from the Windows build and patches the
  platform.
- `JNIBridge_a.patched.smali` — smali source for the
  `bitter.jnibridge.JNIBridge$a` patch. `build_apk.py` rebuilds
  `patched_classes.dex` automatically on each build (via baksmali + smali):
  extract `classes.dex` from `base.apk`, replace the `JNIBridge$a` class with
  the committed smali and reassemble it, which avoids the Android
  default-method dispatch crash.

Selected maintenance fixes in this branch adapt work from Frederlk's
[PR #1](https://github.com/ssorgatem/tesl-reborn-android/pull/1): authentication
result handling, log redaction, stale build checks and interrupted payload
recovery. The Android UI, update loader and portable builder use their existing
build pipeline; the PR's compiled hook and language index table are not copied.
