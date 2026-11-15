#!/usr/bin/env bash
# Runs the gjs smoke tests. Needs gjs and gdk-pixbuf, not a running GNOME Shell.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$(mktemp -d)"
trap 'rm -rf "$CACHE"' EXIT

# A throwaway cache, so the smoke test never touches ~/.cache/island-xdashio
XDG_CACHE_HOME="$CACHE" gjs -m "$ROOT/tests/smoke/art.smoke.js"
