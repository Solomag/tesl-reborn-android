#!/usr/bin/env bash
# Rebuild the tested bridge snapshot, current core and OTA loader together.
set -e
cd "$(dirname "$0")"
node tools/build-hook.mjs
