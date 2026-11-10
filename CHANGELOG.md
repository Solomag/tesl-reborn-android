# What's new

Changes players notice, newest first. **Patches** arrive in the game by
themselves; a change marked **new APK** needs *APK only* built in the Builder
and installed over the old one (your game data stays). Test gets a patch
first; Stable gets it after testing.

## Patch 279 — Test

- The freeze watch no longer risks a long stall of its own after returning
  to the game (the same thread query that froze a Samsung for minutes).

## Patch 278

- After **Log Out**, the username is filled in again even when the login form
  appears late.

## Patch 277 — Stable

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
