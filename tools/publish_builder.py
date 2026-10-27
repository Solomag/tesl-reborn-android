#!/usr/bin/env python3
"""Upload the frozen Builder to the release its channel updates from.

Run in CI after packaging, in the main repository only. Writes
dist/builder-<platform>.json (build, SHA-256, size) next to the executable and
uploads both to the builder-<channel> release, replacing the previous build.
The release is created on first use; test is marked as a pre-release.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def describe(executable, version, platform):
    data = executable.read_bytes()
    return dict(build=version["build"], commit=version.get("commit", ""), platform=platform,
                asset=executable.name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())


def main():
    version = json.loads((ROOT / "builder/version.json").read_text(encoding="utf-8"))
    if version.get("build", 0) <= 0:
        raise SystemExit("Not an official build: builder/version.json has no build number")
    platform = "windows" if sys.platform == "win32" else "linux"
    executable = ROOT / "dist" / ("TESL-Reborn-Builder" + (".exe" if platform == "windows" else ""))
    info = describe(executable, version, platform)
    description = ROOT / "dist" / f"builder-{platform}.json"
    description.write_text(json.dumps(info) + "\n", encoding="utf-8")
    tag = "builder-" + version["channel"]
    if subprocess.run(["gh", "release", "view", tag], capture_output=True).returncode != 0:
        title = "Builder (" + version["channel"] + ")"
        flags = ["--prerelease"] if version["channel"] == "test" else []
        created = subprocess.run(["gh", "release", "create", tag, "--title", title, "--notes",
                                  "Updated by CI; the Builder updates itself from here.",
                                  "--target", os.environ.get("GITHUB_SHA", "HEAD"), *flags])
        # A parallel job may have created it first.
        if created.returncode != 0 and subprocess.run(["gh", "release", "view", tag], capture_output=True).returncode != 0:
            raise SystemExit("Could not create release " + tag)
    # The executable first: a client that reads the new description must find
    # the new file, never the reverse.
    subprocess.run(["gh", "release", "upload", tag, str(executable), "--clobber"], check=True)
    subprocess.run(["gh", "release", "upload", tag, str(description), "--clobber"], check=True)
    print(f"BUILDER: {platform} build {info['build']} on {tag}, sha256 {info['sha256']}")


if __name__ == "__main__":
    main()
