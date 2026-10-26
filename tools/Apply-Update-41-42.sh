#!/usr/bin/env bash
set -euo pipefail
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=${1:-"$HOME/tesl-reborn-android-review"}
cd -- "$repo"
gitdir=$(git rev-parse --absolute-git-dir)
if [[ -d "$gitdir/rebase-apply" || -d "$gitdir/rebase-merge" ]]; then
    echo 'СТОП: есть незавершённая операция Git. Сначала проверь git status.' >&2
    exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo 'СТОП: есть незакоммиченные изменения. Сначала проверь git status.' >&2
    exit 1
fi
subjects=$(git log -100 --format=%s)
has_commit() {
    while IFS= read -r subject; do
        if [[ "$subject" == "$1" ]]; then return 0; fi
    done <<< "$subjects"
    return 1
}
if has_commit 'Polish Builder controls and repair language and update UI'; then
    echo 'Обновление 41–42 уже применено.'
    exit 0
fi
if ! has_commit 'Add private rolling logs and on-phone diagnostic report sharing'; then
    echo 'СТОП: требуется предыдущий патч 39–40. Этот архив — обновление поверх него.' >&2
    exit 1
fi
git am "$bundle/tesl-reborn-android-41-42.patch"
echo 'Обновление 41–42 применено. Проверь git status, затем выполни git push.'
