Deck statistics, legendary title colours and several chat/history interactions
were missing or unsuitable for touch input in the Android hook. This adds the
UI behavior validated during the Android v21 device test cycle and makes the
Android core independently updateable through a stable loader.

- Render a single aligned deck statistic and gold legendary title banners.
- Show own/opponent deck details on a history tap; switch or dismiss on a tap.
- Move chat by its header, pinch to scale, persist settings, and fix TMP clipping.
- Render verified PC emoji sprites in both chat and message previews.
- Extract pinned emoji resources from the official PC distribution at build time
  and embed them in the APK, avoiding separate ADB resource installation.
- Add a stable loader with compatible, monotonic, hash-checked HTTPS hook staging
  and next-launch activation/fallback. An embedded channel can be configured
  before building; no production feed is configured by this branch.
- Add a pinned source build, model tests, and an OBB inventory tool that separates
  manifest declarations from matching archive entries.
- Correct the language enum using the 11009 bundle paths (including es_mx),
  fail incomplete cache restores, and add Git-channel publication and complete
  APK migration helpers for testing the fork before opening a PR.

Validation: `npm ci`, `npm run build`, `npm test`, Python syntax compilation and
`git diff --check`. Tests cover UI geometry, native/fallback tooltips, pinching,
emoji previews, update lifecycle/fallback/integrity, generated release metadata,
and OBB inventory handling. Resource extraction was checked with the official
1.3.1-beta archive; an additional model test covers first-launch APK extraction
and repair of interrupted copies.

The underlying v21 UI behavior was confirmed by the tester on a phone. This
exact source rebuild, updated loader and clean-install resource path still need
device validation; a full APK was not built in this environment. The vendored
bridge snapshot is preserved from the existing upstream bundle.

Language downloading, an in-game update/download screen, automatic APK upgrades,
independent release signatures, and execution/conversion of the PC DLL are
follow-ups. This does not publish an update channel or include original game
files. See `docs/android-updates.md` for setup and transport limitations.
