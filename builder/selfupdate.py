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


APK_LEVEL_SOURCE = "android-setup/src/org/teslreborn/setup/ApkLevel.java"


def source_apk_level(root):
    """ApkLevel.LEVEL of the APK this checkout builds; 0 when unknown."""
    try:
        found = re.search(r"static final int LEVEL\s*=\s*(\d+)", (Path(root) / APK_LEVEL_SOURCE).read_text(encoding="utf-8"))
        return int(found.group(1)) if found else 0
    except OSError:
        return 0


def current(root):
    """This Builder's channel and build, and the level of the APKs it makes
    (CI stamps it; a source checkout reads it); a local build is build 0 on
    test."""
    try:
        data = json.loads((Path(root) / "builder/version.json").read_text(encoding="utf-8"))
        channel = data.get("channel")
        return {
            "channel": channel if channel in ("stable", "test") else "test",
            "build": int(data.get("build", 0)),
            "commit": str(data.get("commit", ""))[:40],
            "apkLevel": int(data.get("apkLevel") or source_apk_level(root)),
        }
    except (OSError, ValueError, TypeError):
        return {"channel": "test", "build": 0, "commit": "", "apkLevel": source_apk_level(root)}


def display(version):
    """How people see a Builder: "Builder 2.229" (APK level, then build)."""
    build, level = version.get("build", 0), version.get("apkLevel", 0)
    if not build:
        return "Builder local build"
    return f"Builder {level}.{build}" if level else f"Builder build {build}"


def _get(url, limit, timeout=15, accept=None, progress=None):
    headers = {"User-Agent": "TESL-Reborn-Builder"}
    if accept:
        headers["Accept"] = accept
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise OSError(f"HTTP {response.status}")
        if progress is None:
            data = response.read(limit + 1)
        else:
            # The Builder download is tens of MB: read it in pieces and report
            # the share received, from the Content-Length GitHub sends.
            total = int(response.headers.get("Content-Length") or 0)
            parts, received = [], 0
            while received <= limit:
                chunk = response.read(256 * 1024)
                if not chunk:
                    break
                parts.append(chunk)
                received += len(chunk)
                if total:
                    progress(min(100, received * 100 // total))
            data = b"".join(parts)
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
    level = re.search(r"Builder (\d+)\.\d+", str(asset.get("label") or ""))
    return {"build": build, "apkLevel": int(level.group(1)) if level else 0,
            "sha256": digest.group(1), "bytes": size, "url": url,
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


def _file_sha256(path):
    try:
        digest = hashlib.sha256()
        with open(path, "rb") as stream:
            for chunk in iter(lambda: stream.read(1 << 20), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except OSError:
        return None


def install(offer, executable=None, fetch=_get, progress=None):
    """Swap this executable for the verified new build; returns its path.
    The new build takes the channel name (TESL-Reborn-Builder-Test.exe) when
    the offer has one, so an older TESL-Reborn-Builder.exe is renamed."""
    executable = Path(executable or sys.executable)
    target = executable.with_name(offer.get("name") or executable.name)
    # Another Builder window from this folder may have installed this very
    # build already: then there is nothing to swap, only to restart.
    if _file_sha256(target) == offer["sha256"]:
        return target
    data = fetch(offer["url"], LIMIT, timeout=120, **({"progress": progress} if progress else {}))
    if len(data) != offer["bytes"] or hashlib.sha256(data).hexdigest() != offer["sha256"]:
        raise ValueError("Downloaded Builder does not match its SHA-256")
    fresh = executable.with_name(executable.name + ".new")
    old = executable.with_name(executable.name + ".old")
    try:
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
    except BaseException:
        # Nothing half-installed is left next to the Builder.
        try:
            fresh.unlink()
        except OSError:
            pass
        raise
    return target


LIST_VARIABLES = {"PATH", "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH", "PYTHONPATH", "XDG_DATA_DIRS"}


def restart_environment(environment=None, bundle=None):
    """A one-file Builder passes its unpacked folder to child processes. The
    restarted Builder then ran its new code on the old build's data (it still
    said "build 7"), and that folder is deleted when the old process exits.
    PyInstaller starts a fresh instance with PYINSTALLER_RESET_ENVIRONMENT, and
    no variable may point into the old folder (TCL_LIBRARY and the like)."""
    environment = dict(os.environ if environment is None else environment)
    bundle = getattr(sys, "_MEIPASS", None) if bundle is None else bundle
    if bundle:
        # A list of folders (PATH and the like) loses only the entries inside
        # the old folder and keeps the user's others; any other variable that
        # points into it goes. Only list variables are split: ":" separates
        # them on Linux but is also part of other values.
        cleaned = {}
        for key, value in environment.items():
            if str(bundle) not in value:
                cleaned[key] = value
                continue
            if key.upper() not in LIST_VARIABLES:
                continue
            kept = [part for part in value.split(os.pathsep) if part and str(bundle) not in part]
            if kept:
                cleaned[key] = os.pathsep.join(kept)
        environment = cleaned
    environment["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    return environment


def restart(executable):
    subprocess.Popen([str(executable)], cwd=str(Path(executable).parent), close_fds=True,
                     env=restart_environment())
