# TESL Reborn — Android port

Android reimplementation of the Tesl Reborn client, built by injecting a Frida gadget-based hook (`hook.ts`) over the IL2CPP Unity player.

## What you get

The final artefact `tesl-reborn.xapk` is a single ~2.2 GB package. After installing it, no further file pushes are needed:

- the original streaming assets (OBB, 1.8 GB) ship inside the XAPK;
- the rebuilt Unity cache (~204 bundles / ~310 MB / 408 cache entries) ships inside the APK and is restored by the hook on the first launch into `UnityCache/Shared/<bundle>/<hash>/`.

After that first run the game is fully offline: card art, voices and translations all load from local files. Auto-login works once a `tesl-login.json` is pushed (see *Manual push* below), or after a successful login with username and password (see *First run and login*).

## Prerequisites

- Linux (a native one or WSL Ubuntu). The scripts are developed in WSL against a Linux filesystem; see *Windows checkout* for a Windows working tree.
- Python 3 (3.11+ recommended) with `lief` and `UnityPy` (`pip install lief UnityPy`, in a venv such as `~/tesl-venv`).
- Java JDK, for `uber-apk-signer.jar`.
- `zipalign` from the Android build-tools (not part of the JDK), build-tools 14 recommended.
- `baksmali` and `smali` on `PATH`; `build_apk.py` uses them to rebuild `patched_classes.dex`.
- Node.js, plus the packages in *Hook dependencies* below.
- A Frida gadget for Android arm64 v8a (17.24.3, the file written as `gadget.so`). Its version must match the `frida` package that compiles the hook.
- Minimum Android: 10 (Android 14 was the development target).
- Base artefacts:
  - `base.apk`: a working arm64 / IL2CPP Android base APK of the game (renamed to `base.apk`).
  - `main.11009.com.bethsoft.theelderscrollslegends.obb`: the original OBB, extracted from the original XAPK. Also copy it from `Android/obb/…` of the APKPure package.
  - `versions.json`: the bundle inventory. Extract it from `assets/versions.json` inside the OBB.
  - an original XAPK (e.g. the APKPure one, version code 11009) to harvest `icon.png` + `manifest.json`; or pass those two files to `build_xapk.py` with `--icon` and `--manifest`.
  - a Windows build of *The Elder Scrolls: Legends* to recover the bundles missing from the OBB (tested against the Steam version).

## Hook dependencies

`package.json` pins the packages that compile `hook.ts`: `frida-compile` 19.1.0, `frida-il2cpp-bridge` 0.14.0 and the `frida` native binding 17.24.3 (it must match `gadget.so`). `@types/frida-gum` is not needed to build, because `hook.ts` is `@ts-nocheck` and compiled with `-T none`; install it only for editor types.

```bash
pnpm install
```

With pnpm the build script of `frida` has to run (it fetches the native binding); `package.json` allows it through `pnpm.onlyBuiltDependencies: ["frida"]`. With another package manager, run the install scripts of `frida`.

Without a working `node_modules` next to the sources (for example on `/mnt/d` in WSL, where pnpm symlinks are slow), install into another directory and point `rebuild_hook.sh` at it:

```bash
mkdir -p ~/tesl-hook-deps && cp package.json ~/tesl-hook-deps/
(cd ~/tesl-hook-deps && pnpm install)
HOOK_DEPS=~/tesl-hook-deps ./rebuild_hook.sh
```

## Build chain

Every command below runs from the repository directory (the one that holds `build_apk.py`), in order.

### 1. Compile the hook

```bash
./rebuild_hook.sh
```

It runs `frida-compile hook.ts -o hook.js -T none` with the dependencies of *Hook dependencies*. `build_apk.py` refuses to build when `hook.ts` is newer than `hook.js`.

### 2. Inject the gadget + hook into `base.apk`

```bash
python3 build_apk.py base.apk tesl-reborn-patched.apk
```

`build_apk.py` needs `base.apk`, `gadget.so`, `hook.js` and `uber-apk-signer.jar` in the repository directory, and `zipalign`, `baksmali`, `smali` and `java` on `PATH`; it checks all of them before it starts. `patched_classes.dex` is built from `base.apk` and `JNIBridge_a.patched.smali` on every run (`bitter.jnibridge.JNIBridge$a` patched to avoid the Android 16 default-method dispatch crash; see the Source files note). `--prebuilt-dex` uses a `patched_classes.dex` from the repository directory instead.

The APK is signed with the one fixed, public debug keystore of `uber-apk-signer`, so every build from every user carries the same key. To sign with your own key pass `--ks FILE --ks-alias NAME --ks-pass PASS` (and `--ks-key-pass PASS` if the key password differs). An APK signed with another key cannot be installed over one signed with the debug key.

### 3. Rebuild the Unity cache

```bash
python3 restore_cache.py --assets "<Steam>/The Elder Scrolls Legends_Data/StreamingAssets"
```

`--assets` must point at the `StreamingAssets` folder of the Windows game, not at the `_Data` folder above it. Patches `target_platform` 5 → 13, writes `cache/Shared/<name>/<hash>/__data` plus `__info`. Verification: ~204 bundles, ~310 MB, 0 missing. The script exits non-zero when bundles are missing in the Windows game (`--allow-missing` accepts that). `--language` takes one of the languages listed by `--help` (default `en_us`).

`--push` also pushes `cache/Shared` to the device under `…/files/UnityCache/Shared` — use it in the manual debug loop.

### 4. Bake the cache into a single APK

```bash
python3 build_single_apk.py --no-obb --apk tesl-reborn-patched.apk --output tesl-reborn-noobb.apk
```

`--no-obb` is mandatory for the XAPK path (the OBB ships in the XAPK). `versions.json` must be in the repository directory; the build stops without it unless `--no-versions` is passed. `--no-cache` / `--no-versions` should not be used in a real build: they re-introduce the "asset map" failures that the per-file restore fixes. The payload files are read in place, so the build needs no scratch copy of the OBB.

Result: `tesl-reborn-noobb.apk` (~409 MB, 408 payload entries + `versions.json`).

### 5. Build the final XAPK

```bash
python3 build_xapk.py --apk tesl-reborn-noobb.apk --output tesl-reborn.xapk
```

Reads `icon.png` + `manifest.json` from the original XAPK (`--xapk`), or from `--icon` and `--manifest` when both are given. Output: ~2.2 GB, validated with `testzip()` before it takes its final name.

## Windows checkout

`hook.js` is a length-prefixed Frida bundle: its byte counts break when git converts line endings, and Frida then fails with `SyntaxError: unexpected character`. `.gitattributes` keeps `hook.js` untouched and forces LF on the scripts, so `rebuild_hook.sh` and the shebang lines keep working under `core.autocrlf=true`. Clone with that file present; if a checkout predates it, run `git add --renormalize .` or re-clone.

## Installing on a phone

- XAPK: install `tesl-reborn.xapk` with an XAPK installer (APKPure and similar). It places the OBB itself.
- APK: `adb install -r tesl-reborn-noobb.apk`. A build without `--no-obb` (`tesl-reborn-all.apk`) carries the OBB and writes it out on the first start. Otherwise push the OBB before the first start:

```bash
adb shell mkdir -p /sdcard/Android/obb/com.bethsoft.theelderscrollslegends
adb push main.11009.com.bethsoft.theelderscrollslegends.obb /sdcard/Android/obb/com.bethsoft.theelderscrollslegends/
```

- MIUI / HyperOS blocks `adb install` unless "Install via USB" is enabled in the developer options.

## First run and login

The first launch restores the cache from the APK, which takes a while. After a successful login the hook keeps the credentials in `tesl-login.json` under `/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/` and uses them for auto-login. The file holds the password in plain text on shared storage: adb can read it on every Android version, and other apps with storage access can read it on Android 10 and below. Delete it to forget the login.

## Manual push (debug loop)

Keeps the existing device files so you do not have to reinstall. Useful, for example, after pushing a new `tesl-reborn.apk`:

```bash
adb install -r tesl-reborn-new.apk
adb shell am force-stop com.bethsoft.theelderscrollslegends
# (re)push the cache + versions.json if needed:
python3 restore_cache.py --push --assets ".../The Elder Scrolls Legends_Data/StreamingAssets"
adb shell monkey -p com.bethsoft.theelderscrollslegends -c android.intent.category.LAUNCHER 1
# inspect later:
adb logcat -d -s tesl-hook:I  | tail -40
adb logcat -d -s Unity:E     | tail -20
adb shell screencap -p /sdcard/x.png && adb pull /sdcard/x.png /tmp/x.png
```

Credential file (push once, never commit it; useful for autologin just after installing):

```bash
adb push ./creds/tesl-login.json /sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/tesl-login.json
```

## Key gotchas

- `Cache_SetExpirationDelay` lives in `x2`, **never** write to `x1` (corrupts the cache handle → SIGSEGV).
- Bundle expiration is capped at 12960000 s.
- `__info` files use the format `-1\n<epoch>\n1\n__data\n`.
- `f.save(packer="original")` is mandatory to keep the `target_platform 5 → 13` patch without re-encoding the bundle payload.
- `apkPath()` must resolve the package through `/proc/self/maps`. Once an OBB is installed, `streamingAssetsPath` returns the OBB's path and the per-file payload restore silently breaks.
- Cache files belong under `…/UnityCache/Shared` (one level up ⇒ Unity never resolves them and the game re-downloads them from the dead CDN).
- Bump the hook's `log("...")` build marker whenever `hook.ts` changes.
- The OBB name (version code and package) is repeated in `build_single_apk.py` (`build_xapk.py` imports it from there) and in `hook.ts` (`obbPath()`); change them together.

## Source files

- `hook.ts` — the Frida / IL2CPP hook (compiled to `hook.js`).
- `hook.js` — prebuilt compiled hook (regenerate with step 1).
- `package.json` — the pinned toolchain that compiles the hook.
- `.gitattributes` — keeps `hook.js` free of line-ending conversion.
- `build_apk.py` — injects the gadget + hook into `base.apk`.
- `build_single_apk.py` — appends OBB and/or cache to the patched APK.
- `build_xapk.py` — builds the APKPure-like XAPK.
- `restore_cache.py` — recovers bundles from the Windows build and patches the platform.
- `JNIBridge_a.patched.smali` — smali source for the `bitter.jnibridge.JNIBridge$a` patch. `build_apk.py` rebuilds `patched_classes.dex` on each build (via baksmali + smali): extract `classes.dex` from `base.apk`, replace the `JNIBridge$a` class with the committed smali and reassemble, which steers the JNI bridge around Android's default-method handling.
