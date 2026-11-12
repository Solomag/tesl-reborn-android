# Android feature parity and update loader

The channels and how a patch is promoted are in [release-channels.md](release-channels.md).

## Behavior included

Deck tiles show one correctly aligned win/loss statistic. Legendary title
banners are gold both in the title selector and combat intro. Tapping either
side's attributes in match history shows that deck's name and record; tapping
elsewhere closes it. Shared native hover triggers are suppressed only while
the mobile click target owns them.

Chat moves by dragging its header and scales with a two-finger pinch; both
settings persist. TextMeshPro labels are bounded after component creation and
before rendering, avoiding the extra 200x50 container expansion seen on mobile.
Emoji artwork and markup are shared between chat and message previews. Preview
labels keep the native name, time, colour and fade.

These behaviors are in the published patches; what changed when is in
[CHANGELOG.md](../CHANGELOG.md).

## Build and verify

```sh
npm ci
python3 tools/prepare_emojis.py
# Alternatively: python3 tools/prepare_emojis.py --archive /path/to/pc-plugin.zip
npm run build
npm test
```

The resource command fetches only a pinned official PC archive, verifies the
two emoji files and extracts them to ignored `resources/emojis`. No DLL is
executed or included. The existing APK build command now embeds these files
uncompressed; the hook restores them automatically on first launch. Existing
APK/OBB/cache build prerequisites still apply.

`npm run build` uses the existing bridge snapshot, emits `runtime/core.js` and
metadata, then regenerates the root APK loader. This replaces the former
`frida-compile` command. Keep the generated files in the same commit as source
changes. Increment the manifest revision for each public core release.

## Publish hook updates

Patches are published to the test and stable channels in this repository with
`tools/publish_hook.py`; the steps are in [release-channels.md](release-channels.md).
A local `tesl-reborn-updater.json` in the game's external files directory can
override `enabled`, `feedUrl`, `safeMode` and `allowLocalUpdates`. With
`allowLocalUpdates`, a `manifest.json` and `hook.js` in `tesl-reborn-inbox/`
next to it are installed on the next start (for testing on a device).

After core initialization the client checks once per launch. A compatible
newer core is verified by byte count and SHA-256 and stored in private app
storage. It takes effect on the next launch. A trial that exits before calling
`ready()` falls back on a subsequent launch; no second hook is installed into
an already partially patched process. `ready()` is called after the game has drawn
frames for 15 s without a gap (or after a minute with no frame reports at
all); a patch that breaks the start is rolled back after three tries. Safe mode uses the embedded
core. A newer APK will not select a cached core older than its bundled version.

The update channel is trusted to publish executable hooks. SHA-256 detects
corruption; it is not a signature independent of the channel. This release does
not implement an authenticated release-signing scheme or an in-game channel UI.

## OBB and languages

```sh
python3 tools/inspect_obb.py /path/to/main.11009.com.bethsoft.theelderscrollslegends.obb \
  --output obb-report.json --sha256
```

This reads the ZIP directory and `versions.json`, without extracting gigabytes
of data. A manifest entry describes an expected bundle, not proof that it is in
the archive. Exact paths and basename-only hints are reported separately.
An exact path does not validate the bundle's platform or content hash. A ZIP
wrapping an OBB must first be unpacked normally.

`restore_cache.py` documents filemanifest and localized audio bundles missing
from the original OBB and currently recovers them from PC StreamingAssets.
Localized download packs must be generated from the verified Android cache,
with shared filemanifest bundles separated from per-language bundles. Do not
assume all required resources exist in an arbitrary online OBB.

The verified 11009 manifest uses `es_mx=3`, `fr_fr=4`, `it_it=5`, `pl_pl=6`,
`pt_br=7`, `ru_ru=8`, and `tr_tr=9`. The previous table omitted es_mx and shifted
these codes. Both restore and inspection now use the corrected mapping. A
restore fails before writing if any selected PC source bundle is missing.

`tools/publish_hook.py` prepares `updates/<channel>/manifest.json` and a
content-addressed payload under `updates/payloads/`. Committing and pushing
these files publishes a raw-GitHub channel without requiring Pages. The phone
downloads the compiled Android core, never the hook sources or the PC DLL. The command
does not push or open a PR itself. Channel revisions must increase.

`tools/prepare_test_apk.py` replaces the loader in an existing complete APK,
preserving cache entries and native-library offsets. It adds the pinned emoji
resources and produces an unsigned ZIP32 APK for subsequent signing with the
existing certificate. This is a test/migration shortcut; it does not exercise
all of `build_apk.py` from a clean base APK.

## PC plugin

Reborn's PC DLL cannot be used as a drop-in replacement for this hook: it depends
on BepInEx/Harmony and managed Unity bindings, while this game uses IL2CPP. The
hook re-implements its patches, so a new plugin release reaches phones as an
ordinary patch, without a new APK, data or Builder:

1. **Noticed:** `.github/workflows/plugin-watch.yml` checks
   tesl-reborn.com/download every day; when the plugin there is not
   `PLUGIN_VERSION` (hook/00-config-and-log.ts), the run fails and its summary
   holds the report below. `python tools/plugin_watch.py latest` does the
   same check by hand.
2. **What changed:** `python tools/plugin_watch.py diff <old> <new>`
   (needs `pip install dnfile`): files of the archive, Harmony patch targets,
   methods whose code changed (metadata tokens compared by name, so moved
   strings and calls are not changes), string literals, JSON/text diffs, and
   the hook lines that handle the changed patch targets.
3. **Port** those changes into hook/*.ts, set `PLUGIN_VERSION` (the server sees
   it as `X-TeslRebornPlugin-Version`), and publish a patch.
4. **Emojis:** if the report lists new emoji files, update `EMOJI_SOURCE` and
   `EMOJI_FILES` in hook/00-config-and-log.ts (and `URL`/`FILES` in
   tools/prepare_emojis.py for the Builder). Phones whose APK carries other
   emojis fetch the official plugin archive themselves, check its SHA-256 and
   every file, and unpack them (hook/04-inflate.ts); the artwork is never in
   git.
