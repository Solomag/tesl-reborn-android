"""Keep the frozen Builder current from the main repository's releases.

CI uploads the Builder and a small description (build number, SHA-256) to
one release per channel: builder-test for the test branch, builder-stable for
main. A Builder reads the release of its own channel, downloads a newer build,
checks its SHA-256 and swaps itself: a running executable can be renamed on
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

RELEASES = "https://github.com/ssorgatem/tesl-reborn-android/releases/download/builder-{channel}/"
LIMIT = 512 * 1024 * 1024


def platform_name():
    return "windows" if sys.platform == "win32" else "linux"


def asset_name():
    return "TESL-Reborn-Builder" + (".exe" if sys.platform == "win32" else "")


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


def _get(url, limit, timeout=15):
    request = urllib.request.Request(url, headers={"User-Agent": "TESL-Reborn-Builder"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise OSError(f"HTTP {response.status}")
        data = response.read(limit + 1)
    if len(data) > limit:
        raise OSError("Update exceeds size limit")
    return data


def check(version, fetch=_get):
    """The newer build on this channel, or None. Raises on a bad description."""
    base = RELEASES.format(channel=version["channel"])
    info = json.loads(fetch(base + f"builder-{platform_name()}.json", 16384).decode("utf-8"))
    build, sha, size = info.get("build"), info.get("sha256"), info.get("bytes")
    if (
        not isinstance(build, int)
        or not isinstance(size, int)
        or not 0 < size <= LIMIT
        or not isinstance(sha, str)
        or not re.fullmatch(r"[0-9a-f]{64}", sha)
        or info.get("asset") != asset_name()
    ):
        raise ValueError("Invalid Builder update description")
    if build <= version["build"]:
        return None
    return {"build": build, "sha256": sha, "bytes": size, "url": base + asset_name(),
            "commit": str(info.get("commit", ""))[:40]}


def cleanup(executable=None):
    """Remove the copy a previous update left behind."""
    executable = Path(executable or sys.executable)
    try:
        executable.with_name(executable.name + ".old").unlink()
    except OSError:
        pass


def install(offer, executable=None, fetch=_get):
    """Swap this executable for the verified new build; returns its path."""
    executable = Path(executable or sys.executable)
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
        os.replace(fresh, executable)
    except OSError:
        os.replace(old, executable)
        raise
    return executable


def restart(executable):
    subprocess.Popen([str(executable)], cwd=str(Path(executable).parent), close_fds=True)
