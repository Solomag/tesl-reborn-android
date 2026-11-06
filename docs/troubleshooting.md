# Troubleshooting and bug reports

## Reporting a bug

Every report needs the diagnostic report, otherwise there is little to go on.

1. In the game: *Settings → Game data → Share diagnostic report*. (If the game
   does not start, the same button is on the game data screen.)
2. Share the ZIP together with what happened, when (time), and a screenshot if
   something looks wrong.
3. Send it as a [GitHub issue](https://github.com/ssorgatem/tesl-reborn-android/issues)
   (attach the ZIP).

The report contains the game's logs and settings. Passwords and login tokens are
removed from it.

## Known issues

- **China:** the game server's port 8443 and GitHub (patch downloads) are not
  reachable from mainland China without a VPN.
- **One device per account:** logging in on the phone disconnects the PC client
  and the other way round.
- **Long text on narrow screens:** some popups were made for 16:9 PC screens. The
  game scales down a popup that does not fit; if a button is still off screen,
  send a report.

## Common problems

**The app cannot open `tesl-reborn-data.zip`.** Android does not give apps the
files in *Downloads* that another app put there. Move the ZIP to another folder
and pick it again, or use the QR transfer.

**The phone does not reach the PC.** Both must be on the same network; guest
Wi-Fi often isolates devices. Allow the Builder in the Windows firewall when it
asks. Tailscale works across networks.

**Low or unstable FPS.** In battle the game lowers its frame rate by itself when
the phone cannot keep up (heat, power saving) and raises it again after a couple
of minutes. If it stays low, send a report: it records the frame rate.

**Game data is missing after installing a new APK.** Open *Game data* and use
*Download missing game data* with the Builder that made the APK, or import the
data ZIP of the same build.

**A patch broke something.** Switch to *Stable* in *Game data → Update channel*
and send a report from the Test channel build.
