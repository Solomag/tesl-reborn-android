#!/usr/bin/env python3
"""Upload the frozen Builder to the release its channel updates from.

Run in CI after packaging, in the main repository only. The executable goes to
the builder-<channel> release, replacing the previous build, with the build
number in the asset's label ("[Windows][Test]TESL-Reborn-Builder.exe · build 7").
It is named with its channel (TESL-Reborn-Builder-Test.exe). Builders made
before that look only for TESL-Reborn-Builder(.exe): the first build with the
rename goes up under that name once more, labelled "transition", and stays
there for good. An old Builder updates to it, renames itself and from then on
follows the channel name; later builds leave the transition asset alone. The
Builder reads that label and the SHA-256 GitHub reports for the asset
(builder/selfupdate.py); nothing else is uploaded. The release is created on
first use; test is marked as a pre-release.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
# Descriptions the first releases carried before GitHub's own digests were used.
LEGACY_ASSETS = ("builder-windows.json", "builder-linux.json")


def label(executable, build, channel="test", windows=sys.platform == "win32"):
    """The name shown on the release page: [platform][channel] then the file."""
    return f"[{'Windows' if windows else 'Linux'}][{channel.capitalize()}]{executable.name} · build {build}"


def main():
    version = json.loads((ROOT / "builder/version.json").read_text(encoding="utf-8"))
    if version.get("build", 0) <= 0:
        raise SystemExit("Not an official build: builder/version.json has no build number")
    windows = sys.platform == "win32"
    executable = ROOT / "dist" / ("TESL-Reborn-Builder" + (".exe" if windows else ""))
    tag = "builder-" + version["channel"]
    if subprocess.run(["gh", "release", "view", tag], capture_output=True).returncode != 0:
        title = "Builder (" + version["channel"] + ")"
        flags = ["--prerelease"] if version["channel"] == "test" else []
        created = subprocess.run(["gh", "release", "create", tag, "--title", title, "--notes",
                                  "Updated by CI; the Builder updates itself from here. "
                                  "Download TESL-Reborn-Builder-<Channel>.exe (Windows) or TESL-Reborn-Builder-<Channel> (Linux).",
                                  "--target", os.environ.get("GITHUB_SHA", "HEAD"), *flags])
        # A parallel job may have created it first.
        if created.returncode != 0 and subprocess.run(["gh", "release", "view", tag], capture_output=True).returncode != 0:
            raise SystemExit("Could not create release " + tag)
    named = executable.with_name(executable.stem + "-" + version["channel"].capitalize() + executable.suffix)
    shutil.copyfile(executable, named)
    subprocess.run(["gh", "release", "upload", tag, f"{named}#{label(named, version['build'], version['channel'])}", "--clobber"],
                   check=True)
    assets = json.loads(subprocess.run(["gh", "release", "view", tag, "--json", "assets"], capture_output=True,
                                       text=True, check=True).stdout).get("assets") or []
    legacy = next((a for a in assets if a.get("name") == executable.name), None)
    if not legacy or "transition" not in str(legacy.get("label") or ""):
        subprocess.run(["gh", "release", "upload", tag,
                        f"{executable}#{label(executable, version['build'], version['channel'])} · transition", "--clobber"],
                       check=True)
        print(f"BUILDER: transition {executable.name} build {version['build']} on {tag}")
    for name in LEGACY_ASSETS:
        subprocess.run(["gh", "release", "delete-asset", tag, name, "--yes"], capture_output=True)
    print(f"BUILDER: {named.name} build {version['build']} on {tag}")


if __name__ == "__main__":
    main()
