# Update channels: stable and test

Both channels live in the main repository, `ssorgatem/tesl-reborn-android`:

| Channel | Branch | Manifest |
| --- | --- | --- |
| test | `android-ui-and-update-loader` | `updates/test/manifest.json` |
| stable | `main` | `updates/stable/manifest.json` |

The URLs are in `runtime/channel.json` (`channels`). Payloads are addressed by
SHA-256 in `updates/payloads/`; only those a channel manifest names are kept,
`publish_hook.py` removes the rest (Git history has them; see
[updates/README.md](../updates/README.md)).

A Russian version is in [release-channels-ru.md](release-channels-ru.md).

## Which channel an APK gets

The Builder writes the default channel (`hookFeed`) and both URLs
(`hookChannels`) into the APK. In CI, `tools/select_channel.py` picks stable
only for `main` of the main repository; any other branch, PR, fork or local
build is test.

A phone keeps the channel it got on its first start
(`tesl-reborn-updater.json`); a new APK does not change it. It is changed in
*Game data → Update channel* (Stable / Test) and applies on the next game
start.

## Publishing to test

```bash
npm run build && npm test
python tools/publish_hook.py --revision N --version android-N-… --channel test \
  --base-url https://raw.githubusercontent.com/ssorgatem/tesl-reborn-android/android-ui-and-update-loader/updates
```

Bump `revision` and `version` in `runtime/manifest.json` before `npm run build`.
Commit and push to `android-ui-and-update-loader`.

## Versions

People see one version: **v<APK level>.<revision>** for a patch (v2.288),
**Builder <APK level>.<build>** for a Builder (Builder 2.230; the build is
the CI run number). The APK level is `ApkLevel.LEVEL` / `APK_LEVEL`; it goes
up only when patches need a new APK. The updater, manifests and the Builder's
self-update still compare the plain revision and build numbers.

## What's new

Every patch updates `CHANGELOG.md` (what players notice, newest first) and
`PATCH_NOTES` in `hook/29-update-notices.ts`: one line per language that the game shows with
"Reborn update N applied". Mark changes that need a new APK.
A Builder change goes under the patch it ships with, marked **Builder:**; a
Builder that changes on its own gets a "Builder, <date>" entry (its build
number is only known once CI has built it). Promoting a patch to Stable
moves the "— Stable" mark in its heading.

## When a patch needs a new APK

Changes to the setup screens, the Java side of the game (`android-setup/`) or
the loader reach phones only with a new APK. Raise `ApkLevel.LEVEL` in
`android-setup/src/org/teslreborn/setup/ApkLevel.java` and `APK_LEVEL` in
`hook/29-update-notices.ts` together. A phone whose APK is older then shows a notice asking to
build *APK only* in the Builder and install it over the old one. Publish the
patch only after the Builder of that channel has been rebuilt by CI, so the
new APK exists when the notice appears.

## Promoting to stable

The stable manifest is committed on the test branch but points at `main`, so a
promotion is a fast-forward of `main` to the tested commit, without merges:

```bash
python tools/publish_hook.py --hook updates/payloads/<sha256>.js --revision N \
  --version android-N-… --channel stable \
  --base-url https://raw.githubusercontent.com/ssorgatem/tesl-reborn-android/main/updates
git add updates/   # the manifest, and payloads publish_hook.py removed
git commit -m "Promote patch N to stable"
git push upstream HEAD:android-ui-and-update-loader
git push upstream HEAD:main
```

A phone never goes back to a lower revision: moving from Test to Stable, it
keeps its revision until stable catches up.

## Builder updates

CI of the main repository uploads the Builder to two permanent releases:
`builder-test` (test branch, pre-release) and `builder-stable` (`main`). Each
holds `TESL-Reborn-Builder-Test.exe` (Windows) and `TESL-Reborn-Builder-Test`
(Linux), `-Stable` on stable. Builders before the rename look only for
`TESL-Reborn-Builder(.exe)`: that asset is the transition build, uploaded once
and kept for good; an old Builder updates to it, renames itself to the channel
name and then follows the new file; the release page shows them as
`[Windows][Test]TESL-Reborn-Builder-Test.exe · build 7`. APKs the Builder makes
are named the same way: `TESL-Reborn-Test-build46.apk`. The build number is the CI run number. The Builder reads its channel's
release through the GitHub API: the label gives the number and `digest` the
SHA-256 computed by GitHub. Channel and number are written into the Builder
(`builder/version.json`, `tools/select_channel.py`); `tools/publish_builder.py`
uploads it.

The Builder checks on start and with *Check for updates*, asks, downloads,
verifies the SHA-256, renames itself to `*.old`, puts the new build in its
place and restarts; `*.old` is removed on the next start. A Builder not built
by the main repository's CI is a "local build" (build 0) and is not updated.
