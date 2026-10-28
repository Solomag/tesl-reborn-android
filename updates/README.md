# Over-the-air patches

The game downloads its hook (the patch code) from here, so fixes reach phones
without a new APK.

- `test/manifest.json` and `stable/manifest.json` — one per channel. Each names
  the current patch: its revision (it only goes up), version name, size and
  SHA-256, and the URL of the file below.
- `payloads/<sha256>.js` — the patch files themselves. Each file is named after
  the SHA-256 of its contents, so a name can never point to different code: the
  phone downloads the file a manifest names and refuses it unless the hash
  matches. Old payloads stay so phones on an older manifest (or the other
  channel) can still fetch theirs.

A payload is the built `runtime/core.js` (the bridge plus `hook.ts` compiled
by `npm run build`) as it was for that revision. To see which revision a file
is, search the manifests or `git log -- updates/payloads/<file>`.

Publishing and promotion are described in
[docs/release-channels.md](../docs/release-channels.md).
