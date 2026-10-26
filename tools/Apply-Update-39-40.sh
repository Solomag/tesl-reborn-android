#!/usr/bin/env bash
set -euo pipefail
patch_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo="${1:-$HOME/tesl-reborn-android-review}"
git_dir="$(git -C "$repo" rev-parse --absolute-git-dir)"
if [[ -d "$git_dir/rebase-apply" || -d "$git_dir/rebase-merge" ]]; then
  echo 'Git has an unfinished operation. Check git status before applying this update.' >&2
  exit 1
fi
if ! git -C "$repo" diff --quiet || ! git -C "$repo" diff --cached --quiet; then
  echo 'Tracked files have local changes. Check git status; no patches were applied.' >&2
  exit 1
fi
history="$(git -C "$repo" log -100 --format=%s)"
has_commit() {
  local subject
  while IFS= read -r subject; do
    if [[ "$subject" == "$1" ]]; then return 0; fi
  done <<< "$history"
  return 1
}
if has_commit 'Add private rolling logs and on-phone diagnostic report sharing'; then
  echo 'Update already applied. No patches were repeated.'
  exit 0
fi
if ! has_commit 'Show Android port versions and stabilize language handoff with resource diagnostics'; then
  git -C "$repo" am "$patch_dir/01-versions-and-handoff.patch"
fi
git -C "$repo" am "$patch_dir/02-on-phone-diagnostics.patch"
echo 'Update applied. Push the branch to build APK 40.'
