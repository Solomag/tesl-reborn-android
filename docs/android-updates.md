# Android feature parity and update loader

For the fork-first device test procedure, see [Проверка перед PR](testing-ru.md).

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

These v21 UI behaviors were confirmed on a user's phone. The source rebuild,
APK resource extraction and revised loader in this branch have local model
tests, but this exact branch has not yet been installed on a device.

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

The release owner first sets `runtime/channel.json` to an HTTPS manifest URL
and builds the loader APK once. A local `tesl-reborn-updater.json` in the game's
external files directory can override `enabled`, `feedUrl`, `safeMode`, and
`allowLocalUpdates`; no override is needed when the embedded feed is configured.

Example preparation of a later core update:

```sh
python3 tools/make_release.py --revision 24 --version android-24 \
  --url https://OWNER.github.io/REPOSITORY/releases/24/hook.js \
  --out release/24
```

Use your actual Pages URL. Publish `hook.js` first and the generated manifest
last; copy the manifest to the channel URL. The loader accepts HTTPS only,
requires hook and manifest on the same origin, and rejects redirects. GitHub
Pages can serve this layout; GitHub Release download URLs redirect and therefore
are not supported by this transport as-is. No channel is published by this PR.

After core initialization the client checks once per launch. A compatible
newer core is verified by byte count and SHA-256 and stored in private app
storage. It takes effect on the next launch. A trial that exits before calling
`ready()` falls back on a subsequent launch; no second hook is installed into
an already partially patched process. `ready()` means setup reached the marker,
not that every UI interaction has been exercised. Safe mode uses the embedded
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
downloads the compiled Android core, never `hook.ts` or the PC DLL. The command
does not push or open a PR itself. Channel revisions must increase.

`tools/prepare_test_apk.py` replaces the loader in an existing complete APK,
preserving cache entries and native-library offsets. It adds the pinned emoji
resources and produces an unsigned ZIP32 APK for subsequent signing with the
existing certificate. This is a test/migration shortcut; it does not exercise
all of `build_apk.py` from a clean base APK.

## Follow-up scope

This PR provides the tested UI changes and JS update foundation. It does not
implement language-pack downloads, an in-game download manager, streaming large
archives, automatic APK installation, or PC-DLL conversion. Those need separate
changes and device validation. A small initial APK also requires the current
all-language cache payload to be removed during a one-time rebuild.

Reborn's PC DLL cannot be used as a drop-in replacement for this hook: it depends
on BepInEx/Harmony and managed Unity bindings, while this game uses IL2CPP.
Data extraction, upstream DLL metadata/IL diffing and generated patch scaffolds
can be automated. Shared source with platform adapters is a stronger long-term
solution. Hosting a CLR and implementing compatible Android interop is another,
larger engineering path, not a universal DLL-to-JavaScript conversion.
