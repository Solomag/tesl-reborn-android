"""Find the installed PC game: Steam libraries, the Bethesda.net launcher and
any installer that registered itself with Windows. Nothing here needs tkinter,
so the command-line Builder uses it too. An unreadable folder or drive is
skipped, never an error: the player can still pick the folder by hand."""
import re
import sys
from pathlib import Path

from .resources import find_assets


def _registry_values(entries):
    """(hive, key, value) triples that exist, read on Windows only."""
    if sys.platform != "win32":
        return []
    import winreg

    found = []
    for hive, name, value in entries:
        try:
            with winreg.OpenKey(hive, name) as key:
                found.append(winreg.QueryValueEx(key, value)[0])
        except OSError:
            pass
    return found


def _uninstall_locations(pattern):
    """InstallLocation of every Windows uninstall entry whose name matches."""
    if sys.platform != "win32":
        return []
    import winreg

    found = []
    for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        for root in (r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                     r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"):
            try:
                with winreg.OpenKey(hive, root) as uninstall:
                    for index in range(winreg.QueryInfoKey(uninstall)[0]):
                        try:
                            with winreg.OpenKey(uninstall, winreg.EnumKey(uninstall, index)) as entry:
                                name = winreg.QueryValueEx(entry, "DisplayName")[0]
                                if re.search(pattern, str(name), re.I):
                                    found.append(Path(winreg.QueryValueEx(entry, "InstallLocation")[0]))
                        except OSError:
                            pass
            except OSError:
                pass
    return found


def steam_libraries():
    libraries = []
    if sys.platform == "win32":
        import winreg

        libraries += [Path(p) for p in _registry_values([
            (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "InstallPath"),
        ])]
    libraries += [
        Path.home() / ".steam/steam",
        Path.home() / ".local/share/Steam",
        Path.home() / ".var/app/com.valvesoftware.Steam/.local/share/Steam",
        Path("C:/Program Files (x86)/Steam"),
    ]
    for library in list(libraries):
        try:
            text = (library / "steamapps/libraryfolders.vdf").read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for value in re.findall(r'"path"\s+"([^"]+)"', text):
            libraries.append(Path(value.replace("\\\\", "\\")))
    return libraries


def candidate_folders():
    """Folders that may hold the game, most likely first; duplicates and
    missing ones are left to find_games()."""
    for library in steam_libraries():
        common = library / "steamapps/common"
        try:
            yield from (d for d in common.iterdir() if "legend" in d.name.lower())
        except OSError:
            pass
    # The Bethesda.net launcher installed games under <launcher>/games.
    launchers = [Path("C:/Program Files (x86)/Bethesda.net Launcher"), *_uninstall_locations(r"Bethesda\.net Launcher")]
    for launcher in launchers:
        try:
            yield from (d for d in (launcher / "games").iterdir() if "legend" in d.name.lower())
        except OSError:
            pass
    yield from _uninstall_locations(r"Elder Scrolls.*Legends|^Legends$")


def find_games(candidates=None):
    """Game folders with StreamingAssets, each once."""
    found = []
    for directory in candidates if candidates is not None else candidate_folders():
        try:
            find_assets(directory)
            resolved = Path(directory).resolve()
        except (ValueError, OSError):
            continue
        if resolved not in found:
            found.append(resolved)
    return found
