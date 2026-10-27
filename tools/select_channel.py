#!/usr/bin/env python3
"""Choose the default update channel baked into this build.

The main repository's main branch builds stable; every other repository or
branch (the fork, PR builds, local builds) builds test. Run in CI before
`npm run build` and packaging; without GitHub variables nothing changes.
"""
import json
import os
from pathlib import Path

STABLE_REPOSITORY = "ssorgatem/tesl-reborn-android"
STABLE_REF = "refs/heads/main"


def channel_for(repository, ref):
    return "stable" if repository == STABLE_REPOSITORY and ref == STABLE_REF else "test"


def main():
    path = Path(__file__).resolve().parents[1] / "runtime/channel.json"
    config = json.loads(path.read_text(encoding="utf-8"))
    repository, ref = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_REF")
    if not repository or not ref:
        print("CHANNEL: no CI context, keeping", config["feedUrl"])
        return
    name = channel_for(repository, ref)
    config["feedUrl"] = config["channels"][name]
    path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    # The Builder's own version: it updates itself from the builder-<channel>
    # release of the main repository (builder/selfupdate.py). Only that
    # repository's builds count; others stay at build 0.
    official = repository == STABLE_REPOSITORY
    version = dict(channel=name, build=int(os.environ.get("GITHUB_RUN_NUMBER", "0")) if official else 0,
                   commit=os.environ.get("GITHUB_SHA", ""))
    (path.parents[1] / "builder/version.json").write_text(json.dumps(version) + "\n", encoding="utf-8")
    print(f"CHANNEL: {name} for {repository} {ref}; Builder build {version['build']}")


if __name__ == "__main__":
    main()
