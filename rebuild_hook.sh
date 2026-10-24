#!/usr/bin/env bash
# Rebuild the core and the stable loader installed in the APK.
set -e
cd "$(dirname "$0")"
npm run build
echo "built hook.js ($(wc -c < hook.js) bytes)"
