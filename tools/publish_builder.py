#!/usr/bin/env python3
"""Upload the frozen Builder to the release its channel updates from.

Run in CI after packaging, in the main repository only. The executable goes to
the builder-<channel> release, replacing the previous build, with the build
number in the asset's label ("[Windows][Test]TESL-Reborn-Builder.exe · build 7").
The file name itself stays TESL-Reborn-Builder(.exe): older Builders look
for it to update themselves. The
Builder reads that label and the SHA-256 GitHub reports for the asset
(builder/selfupdate.py); nothing else is uploaded. The release is created on
first use; test is marked as a pre-release.
"""
import json
import os
from pathlib import Path
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
                                  "Download TESL-Reborn-Builder.exe (Windows) or TESL-Reborn-Builder (Linux).",
                                  "--target", os.environ.get("GITHUB_SHA", "HEAD"), *flags])
        # A parallel job may have created it first.
        if created.returncode != 0 and subprocess.run(["gh", "release", "view", tag], capture_output=True).returncode != 0:
            raise SystemExit("Could not create release " + tag)
    subprocess.run(["gh", "release", "upload", tag, f"{executable}#{label(executable, version['build'], version['channel'])}", "--clobber"],
                   check=True)
    for name in LEGACY_ASSETS:
        subprocess.run(["gh", "release", "delete-asset", tag, name, "--yes"], capture_output=True)
    print(f"BUILDER: {executable.name} build {version['build']} on {tag}")


if __name__ == "__main__":
    main()
