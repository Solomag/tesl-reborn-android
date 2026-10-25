#!/usr/bin/env bash
# Rebuild hook.js from hook.ts. Dependencies come from node_modules in this directory (see package.json), or from $HOOK_DEPS/node_modules when HOOK_DEPS is set (for a checkout on a slow filesystem such as /mnt/d).
set -e
here="$(cd "$(dirname "$0")" && pwd)"
deps="${HOOK_DEPS:-$here}"
[ -f "$deps/node_modules/frida-compile/dist/cli.js" ] || { echo "frida-compile is not installed in $deps/node_modules, see README (Hook dependencies)" >&2; exit 1; }
# frida-compile resolves imports from the directory of hook.ts, so with HOOK_DEPS the source is compiled there and the result copied back
if [ "$deps" != "$here" ]; then cp "$here/hook.ts" "$deps/hook.ts"; fi
(cd "$deps" && node ./node_modules/frida-compile/dist/cli.js hook.ts -o hook.js -T none)
if [ "$deps" != "$here" ]; then cp "$deps/hook.js" "$here/hook.js"; fi
echo "built hook.js ($(wc -c < "$here/hook.js") bytes)"
