# Documentation

## Start here

- [builder.md](builder.md) — making the APK and game data with the Builder
  (Windows EXE, Linux, or the command line), and moving data to the phone.
  Russian: [builder-ru.md](builder-ru.md).
- [release-channels.md](release-channels.md) — the Stable and Test update
  channels, publishing a patch, promoting it, and how the Builder updates
  itself. Russian: [release-channels-ru.md](release-channels-ru.md).
- [android-updates.md](android-updates.md) — what the Android hook adds and
  how the over-the-air (OTA) loader works.
- [../updates/README.md](../updates/README.md) — the manifests and the
  hash-named patch files in `updates/`.
- [THIRD_PARTY_BUILDER.md](THIRD_PARTY_BUILDER.md) — third-party components in
  the Builder and their licences.

## test-notes/ (Russian)

Phone test checklists written for each patch revision while it was tested:
`patch-<revision>-<topic>-ru.md`, for example `patch-75-match-entry-ru.md`
for the battle-entry fixes of revision 75. `*-checklist-*` files list what to
verify after installing; `*-ota-*` files cover an update delivered over the
air. They describe that revision only and are kept as a record.

## history/

Older one-off documents kept for reference: the review procedure before the
first pull request, its description, the Builder patch verification steps,
and an audit of the PC plugin DLL against the Android port.
