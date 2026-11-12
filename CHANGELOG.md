# What's new

Changes players notice, newest first. **Patches** arrive in the game by
themselves; a change marked **new APK** needs *APK only* built in the Builder
and installed over the old one (your game data stays). Test gets a patch
first; Stable gets it after testing. **Builder** changes are marked so; a
Builder that only changed itself gets its own entry, by date. The Builder
offers its update when started.

## Builder, 12 November 2026

- The window closes again (the close button did nothing unless an update
  had been offered).
- The transfer over HTTPS no longer writes an error to the log when a
  phone or browser leaves during the secure connection setup.
- *APK only* and *Data ZIP only* are always shown, with a line on what each
  is for. Expert mode is gone: *Advanced connection* is a button in the
  transfer box.
- The Builder has its own icon, and on Windows 10/11 a dark title bar on
  its window and dialogs.

## Patch 287 — Test and Stable

- A game that freezes after coming back is recognised after 12 s instead
  of 20; leaving it and opening it again restarts it.
- Back after a while, the game is restarted by itself when it froze after
  drawing a single frame (before, one frame counted as running). *(new APK)*

## Patch 286

- Performance hints cover only the threads that run the game (9 instead
  of 18 on a Pixel 6 Pro).
- The account name is no longer written to the phone's system log.

## Patch 285

- Phones that raise clocks for games (Pixels): the game's job workers,
  created after the start, now get the performance hints too, and on a
  phone with one fastest core they leave it to the main thread.

## Patch 284

- Frame pacing no longer jumps when the phone's clock is changed.
- A downloaded patch that could not be read once (storage busy) is tried
  again instead of being refused for good. *(new APK)*
- **Builder:** an APK with any file name can be sent to the phone; a wrong
  XAPK gets a clear message.

## Patch 283

- Starting the game from its icon no longer opens the multi-gigabyte game
  data each time (a shorter pause). *(new APK)*
- Test channel: the CPU and temperature report no longer runs on the
  game's main thread.
- **Builder:** Cancel stops at once also while copying, checking or
  packing the game data.

## Patch 282

- Files the game shares with the setup screens are never read half-written
  (could switch off the restart after leaving the game while loading).
- After installing a new APK, the "new APK needed" notice goes away even
  when the game is opened from recent apps. *(new APK)*
- The update check is no longer postponed by tapping the icon often. *(new APK)*
- A text box used for the password no longer shows dots in the chat
  afterwards. *(new APK)*
- **Builder:** finds games installed with the Bethesda.net launcher; the
  transfer listens only on the chosen address.

## Patch 281

- The **saved login** moved from the shared game folder to the game's
  private storage, which other apps and USB cannot read. Moved by itself.
- A new patch is kept only after the game has run for 15 seconds; one that
  breaks the start goes back to the previous patch by itself.
- Password managers: what they fill is handed over through private storage
  too. *(new APK)*

## Patch 279

- The freeze watch no longer risks a long stall of its own after returning
  to the game (the same thread query that froze a Samsung for minutes).

## Patch 278

- After **Log Out**, the username is filled in again even when the login form
  appears late.

## Patch 277

- **Password managers** fill the login form: username and password together,
  from the suggestions in the keyboard. *(new APK)*
- **Restart in one tap:** when an update is downloaded during play, the game
  asks *Restart / Later* instead of waiting for you to restart it. Not shown
  in a battle. *(new APK; older APKs keep the notice)*
- **New APK notice:** when a patch needs a newer APK, the loading screen says
  so.
- The **text box** above the keyboard (chat, deck search, login) has the
  game's dark look. *(new APK)*
- **Sound settings** (Mute Music, volumes) are kept after a restart.
- **Log Out** stays logged out instead of signing straight back in; the
  username is kept for the form.
- Popups are checked once instead of three times at a battle start
  (shorter hitch).
- After an update the game says in one line what is new; this list is
  [CHANGELOG.md](CHANGELOG.md).

## Patch 266

- **Popups fit the screen:** a popup taller than the screen (the arena rules
  before a match in Russian, on 20:9 phones) is scaled down so its buttons
  stay visible.
- **Frame rate after the background:** coming back to the game no longer
  drops a battle to 30 FPS.

## Patch 262

- **Simplified Chinese** as a full game language: menus, cards, store and
  server texts, its own entry in the language list.
- Chinese battles no longer freeze after the mulligan.
- Player names are no longer translated.
- The frame-rate limit holds on phones that tried to raise it themselves.
