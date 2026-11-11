#!/usr/bin/env python3
"""Upload the frozen Builder to the release its channel updates from.

Run in CI after packaging, in the main repository only. The executable goes to
the builder-<channel> release, replacing the previous build, named with its
channel (TESL-Reborn-Builder-Test.exe) and with the build number in the asset's
label ("[Windows]TESL-Reborn-Builder-Test.exe · build 7"). The Builder reads
that label and the SHA-256 GitHub reports for the asset (builder/selfupdate.py);
nothing else is uploaded. The unsuffixed "transition" copy for Builders made
before the channel names is removed: those update by hand now. The release is created on
first use; test is marked as a pre-release.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
# Descriptions the first releases carried before GitHub's own digests were used.
LEGACY_ASSETS = ("builder-windows.json", "builder-linux.json")


def label(executable, build, windows=sys.platform == "win32"):
    """The name shown on the release page: [platform] then the file, which
    already carries the channel."""
    return f"[{'Windows' if windows else 'Linux'}]{executable.name} · build {build}"


def main(argv=None):
    # CI builds on Windows and Linux with a read-only token and publishes both
    # from one job of its own: --platform and --dist say whose file this is.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", choices=("windows", "linux"),
                        default="windows" if sys.platform == "win32" else "linux")
    parser.add_argument("--dist", type=Path, default=ROOT / "dist")
    args = parser.parse_args(argv)
    version = json.loads((ROOT / "builder/version.json").read_text(encoding="utf-8"))
    if version.get("build", 0) <= 0:
        raise SystemExit("Not an official build: builder/version.json has no build number")
    windows = args.platform == "windows"
    executable = args.dist / ("TESL-Reborn-Builder" + (".exe" if windows else ""))
    if not executable.is_file():
        raise SystemExit(f"{executable} is missing")
    if not os.environ.get("GITHUB_SHA"):
        raise SystemExit("GITHUB_SHA is not set: run from CI")
    tag = "builder-" + version["channel"]
    channel = version["channel"].capitalize()
    notes = ("Updated by CI; the Builder updates itself from here. "
             f"Download TESL-Reborn-Builder-{channel}.exe (Windows) or TESL-Reborn-Builder-{channel} (Linux).\n\n"
             "What's new: https://github.com/ssorgatem/tesl-reborn-android/blob/"
             + ("main" if version["channel"] == "stable" else "android-ui-and-update-loader") + "/CHANGELOG.md")
    if subprocess.run(["gh", "release", "view", tag], capture_output=True).returncode != 0:
        title = "Builder (" + version["channel"] + ")"
        flags = ["--prerelease"] if version["channel"] == "test" else []
        created = subprocess.run(["gh", "release", "create", tag, "--title", title, "--notes", notes,
                                  "--target", os.environ["GITHUB_SHA"], *flags])
        # A parallel job may have created it first.
        if created.returncode != 0 and subprocess.run(["gh", "release", "view", tag], capture_output=True).returncode != 0:
            raise SystemExit("Could not create release " + tag)
    else:
        subprocess.run(["gh", "release", "edit", tag, "--notes", notes], check=True)
    named = executable.with_name(executable.stem + "-" + version["channel"].capitalize() + executable.suffix)
    shutil.copyfile(executable, named)
    subprocess.run(["gh", "release", "upload", tag, f"{named}#{label(named, version['build'], windows)}", "--clobber"],
                   check=True)
    for name in (executable.name, *LEGACY_ASSETS):
        subprocess.run(["gh", "release", "delete-asset", tag, name, "--yes"], capture_output=True)
    print(f"BUILDER: {named.name} build {version['build']} on {tag}")


if __name__ == "__main__":
    main()
