# TESL Reborn Builder

The Builder makes the Android game from two things you already own: the PC game
(with its StreamingAssets) and the original Android XAPK. It reads both and
never writes into them. No game assets are stored in Git or CI.

A Russian version of this guide is in [builder-ru.md](builder-ru.md).

## Running it

- **Windows:** download the Builder EXE from the releases. Java, apktool, the
  signer, zipalign, Frida and the setup screens are inside it.
- **Linux (from a source checkout):** you need Python 3.12+, `python3-tk` and a
  JDK 17 or newer (`java` and `javac` on PATH). Then:

  ```bash
  python -m pip install -r builder/requirements.txt
  python -m builder.entry
  ```

  On the first build the Builder downloads its tools itself (pinned versions
  from the official upstreams, checked against recorded SHA-256/SHA-1) into
  `vendor/`, and compiles the setup screens into `vendor/setup/classes.dex`.
  A system apktool such as `/usr/share/java/android-apktool/apktool.jar` is
  not used: the Builder relies on its pinned apktool version.
  You can also prepare everything up front:

  ```bash
  python -m builder.bootstrap_tools
  python android-setup/build.py
  ```

## Inputs

- The PC game folder. Steam libraries are found automatically; you can also
  choose the folder by hand.
- The original single-base XAPK: `com.bethsoft.theelderscrollslegends`,
  versionCode 11009, with the arm64 APK and the main OBB.
- An output folder, by default `output` next to the Builder. Each build gets
  its own subfolder named after the channel, patch revision and languages.
  Temporary files in `.work/run-…` are removed afterwards.

## Output formats

- **Small APK + data ZIP** (recommended): install the APK, then pick the ZIP in
  the app with *Import data ZIP*, or transfer it over the network (below).
- **Offline XAPK:** for XAPK installers; the OBB plus an APK with the language
  packs built in.
- **Expert mode** (remembered between runs) adds:
  - *APK only:* a new APK for a phone that keeps its installed game data.
  - *Data ZIP only:* the language packs, OBB and data ZIP for a phone that keeps
    its installed APK.
  - *Advanced connection* for the transfer server.

The interface and game languages are chosen separately. Supported game
languages: en_us, de_de, es_es, es_mx, fr_fr, it_it, pl_pl, pt_br, ru_ru,
tr_tr.

A running build can be cancelled; its partial output folder is removed.

## Transfer from the PC

After a build press *Start transfer* and scan the QR code:

- Without the app installed, scan it with the phone camera. A page from your PC
  offers *Download APK*. Install it, return to the page and press
  *Open TESL Reborn to download game data*.
- With the app installed, open *Settings → Game data* and scan the same code
  with the built-in scanner.

Choose the language and press *Download missing game data*. The phone and PC
must be on the same Wi-Fi (a private address like 192.168.1.x), or both on
Tailscale (choose the 100.64.0.0/10 address under *Advanced connection*).
Transfer is protected by a random one-time code, resumes after interruptions
and stops 60 seconds after the phone has everything, or after 15 minutes idle.
*Transfer an existing build…* sends a previous build again without rebuilding.

## On the phone

The setup screen shows the state of the OBB, the shared resources and the
language. Downloads are checked by SHA-256. *Settings → Game data* lets you
change the language, the update channel (Stable or Test) and the frame rate.

## Updates

- **Patches (OTA):** the game downloads new hook revisions from the chosen
  channel on start. Stable follows `main`, Test follows
  `android-ui-and-update-loader`. See [android-updates.md](android-updates.md).
- **The Builder** checks GitHub releases and can update itself.
- Changes to the APK itself (for example Android manifest settings) need a new
  build.

## Signing

The APK is signed with the uber-apk-signer 1.3.0 debug certificate
(`1e08a903aef9c3a721510b64ec764d01d3d094eb954161b62544ea8f187b5953`), so new
builds install over older ones. It is a test key, not a private release key.

## Limits

- Resources are carried over according to `versions.json` from the original
  Android OBB; future PC assets missing from that inventory are not added.
- Recognised localisation tables are extracted to checked JSON; the rest use
  the Unity text bundle and are noted in `build.log`.
