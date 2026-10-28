"""Keep the frozen Builder current from the main repository's releases.

CI uploads the Builder to one release per channel: builder-test for the test
branch, builder-stable for main, with the build number in the asset's label
("TESL-Reborn-Builder.exe · build 7"). A Builder reads its channel's release
through the GitHub API, which also gives each asset's SHA-256, downloads a
newer build, checks it and swaps itself: a running executable can be renamed on
Windows and Linux, so the old file becomes *.old, the new one takes its
place, and the old copy is removed on the next start.
"""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

RELEASE = "https://api.github.com/repos/ssorgatem/tesl-reborn-android/releases/tags/builder-{channel}"
LIMIT = 512 * 1024 * 1024


def platform_name():
    return "windows" if sys.platform == "win32" else "linux"


def asset_name(channel=None):
    """TESL-Reborn-Builder-Test.exe; without a channel the name Builders
    before the rename look for, which CI still uploads."""
    suffix = "-" + channel.capitalize() if channel else ""
    return "TESL-Reborn-Builder" + suffix + (".exe" if sys.platform == "win32" else "")


def current(root):
    """This Builder's channel and build; a local build is build 0 on test."""
    try:
        data = json.loads((Path(root) / "builder/version.json").read_text(encoding="utf-8"))
        channel = data.get("channel")
        return {
            "channel": channel if channel in ("stable", "test") else "test",
            "build": int(data.get("build", 0)),
            "commit": str(data.get("commit", ""))[:40],
        }
    except (OSError, ValueError, TypeError):
        return {"channel": "test", "build": 0, "commit": ""}


def _get(url, limit, timeout=15, accept=None):
    headers = {"User-Agent": "TESL-Reborn-Builder"}
    if accept:
        headers["Accept"] = accept
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise OSError(f"HTTP {response.status}")
        data = response.read(limit + 1)
    if len(data) > limit:
        raise OSError("Update exceeds size limit")
    return data


def check(version, fetch=_get):
    """The newer build on this channel, or None. Raises on a bad release."""
    release = json.loads(fetch(RELEASE.format(channel=version["channel"]), 1024 * 1024,
                               accept="application/vnd.github+json").decode("utf-8"))
    assets = {a.get("name"): a for a in release.get("assets") or []}
    asset = assets.get(asset_name(version["channel"])) or assets.get(asset_name())
    # Being replaced right now (upload deletes, then adds): try again later.
    if asset is None or asset.get("state", "uploaded") != "uploaded":
        return None
    label = re.search(r"build (\d+)", str(asset.get("label") or ""))
    digest = re.fullmatch(r"sha256:([0-9a-f]{64})", str(asset.get("digest") or ""))
    size, url = asset.get("size"), str(asset.get("browser_download_url") or "")
    if (
        not label
        or not digest
        or not isinstance(size, int)
        or not 0 < size <= LIMIT
        or not url.startswith("https://github.com/ssorgatem/tesl-reborn-android/releases/download/")
    ):
        raise ValueError("Invalid Builder release asset")
    build = int(label.group(1))
    if build <= version["build"]:
        return None
    return {"build": build, "sha256": digest.group(1), "bytes": size, "url": url,
            "name": asset_name(version["channel"])}


def cleanup(executable=None):
    """Remove the copy a previous update left behind, also one under the name
    the Builder had before an update renamed it."""
    executable = Path(executable or sys.executable)
    for old in {executable.with_name(executable.name + ".old"), *executable.parent.glob("TESL-Reborn-Builder*.old")}:
        try:
            old.unlink()
        except OSError:
            pass


def install(offer, executable=None, fetch=_get):
    """Swap this executable for the verified new build; returns its path.
    The new build takes the channel name (TESL-Reborn-Builder-Test.exe) when
    the offer has one, so an older TESL-Reborn-Builder.exe is renamed."""
    executable = Path(executable or sys.executable)
    target = executable.with_name(offer.get("name") or executable.name)
    data = fetch(offer["url"], LIMIT, timeout=120)
    if len(data) != offer["bytes"] or hashlib.sha256(data).hexdigest() != offer["sha256"]:
        raise ValueError("Downloaded Builder does not match its SHA-256")
    fresh = executable.with_name(executable.name + ".new")
    old = executable.with_name(executable.name + ".old")
    fresh.write_bytes(data)
    if sys.platform != "win32":
        fresh.chmod(executable.stat().st_mode | 0o500)
    try:
        old.unlink()
    except OSError:
        pass
    os.replace(executable, old)
    try:
        os.replace(fresh, target)
    except OSError:
        os.replace(old, executable)
        raise
    return target


def restart_environment(environment=None, bundle=None):
    """A one-file Builder passes its unpacked folder to child processes. The
    restarted Builder then ran its new code on the old build's data (it still
    said "build 7"), and that folder is deleted when the old process exits.
    PyInstaller starts a fresh instance with PYINSTALLER_RESET_ENVIRONMENT, and
    no variable may point into the old folder (TCL_LIBRARY and the like)."""
    environment = dict(os.environ if environment is None else environment)
    bundle = getattr(sys, "_MEIPASS", None) if bundle is None else bundle
    if bundle:
        environment = {k: v for k, v in environment.items() if str(bundle) not in v}
    environment["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    return environment


def restart(executable):
    subprocess.Popen([str(executable)], cwd=str(Path(executable).parent), close_fds=True,
                     env=restart_environment())
