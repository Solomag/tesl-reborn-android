# Installing TESL Reborn on Android

This is the player guide. You build the Android game yourself from copies of the
game you already have; the project does not distribute game files.

## What you need

- A Windows PC (Linux works from a source checkout, see [builder.md](builder.md)).
- **The PC game**: *The Elder Scrolls: Legends* installed on that PC (Steam or the Bethesda.net launcher; the Builder finds both).
- **The original Android XAPK**: `com.bethsoft.theelderscrollslegends`,
  version code 11009 (arm64).
- A phone with **Android 10 or newer** (arm64), about 3 GB free. It also installs
  on Android 8 and 9, but nobody has tested it there yet.
- A TESL Reborn account (the same one as on PC).

## 1. Get the Builder

Download it from the releases of
[ssorgatem/tesl-reborn-android](https://github.com/ssorgatem/tesl-reborn-android/releases):

| Release | File | For |
| --- | --- | --- |
| **Builder (stable)** | `TESL-Reborn-Builder-Stable.exe` | everyone |
| Builder (test) | `TESL-Reborn-Builder-Test.exe` | testers, gets fixes first |

It is a portable EXE: nothing to install. Windows SmartScreen may warn about an
unknown publisher; choose *More info → Run anyway*. The Builder updates itself
(*Check for updates*).

## 2. Build

1. Start the Builder. The PC game is usually found automatically; if not, choose
   its folder (or its `StreamingAssets`).
2. Choose the original XAPK.
3. Pick the game languages you want and the default one.
4. Keep the format **Small APK + data ZIP** and press **Build**.

The result is a folder with an APK (`TESL-Reborn-…apk`) and
`tesl-reborn-data.zip`. Your PC game and the XAPK are only read, never changed.

## 3. Put it on the phone

Press **Show QR / connection** in the Builder and scan the QR with the phone
camera. The phone and PC must be on the same Wi-Fi (or Tailscale).

1. The QR opens a page that installs the APK. Allow installing from the browser
   if Android asks.
2. Open TESL Reborn. On first start it shows the game data screen: scan the same
   QR inside the app and tap **Download missing game data**. Keep the Builder
   open until the phone says it is ready.

Without the network: copy the APK and the ZIP to the phone by cable, install the
APK and choose **Import data ZIP**. If Android says the app cannot open the ZIP
in *Downloads*, move it to another folder (for example `Documents`) and pick it
again.

When the data is verified the game starts directly. Later the data screen is in
the game: *Settings → Game data*.

## 4. Play

Log in with your TESL Reborn account. Only one device can be in the game with an
account at a time: close the PC client (or the other phone) first.

## Updates

There are two kinds of updates:

- **Patches** (fixes in the game itself) arrive over the air. The game downloads
  them in the background and applies them on the next start. No reinstall.
- **A new APK** is needed only rarely (a new language, changes to the setup
  screens). Build *APK only* in the Builder and install it over
  the old one: your game data stays.

### Stable and Test

| | Stable | Test |
| --- | --- | --- |
| Gets | checked patches | every new patch, days earlier |
| Risk | low | may have fresh bugs |

A phone keeps the channel it started with. Change it in
*Settings → Game data → Update channel*; it applies on the next start. Moving
from Test to Stable never goes back to an older patch: the phone waits until
Stable catches up.

## More

- Problems and how to report them: [troubleshooting.md](troubleshooting.md).
- Everything the Builder can do: [builder.md](builder.md).
