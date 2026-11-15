#!/usr/bin/env bash
# Runs the gjs smoke tests. Needs gjs, gdk-pixbuf, GTK 4 and libadwaita, not a running GNOME Shell.
# The preferences test needs a display; on a headless machine run this under xvfb-run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# A throwaway cache, so the cover test never touches ~/.cache/island-xdashio
XDG_CACHE_HOME="$TMP/cache" gjs -m "$ROOT/tests/smoke/art.smoke.js"

# A throwaway schema and in-memory settings, so the preferences test never writes real settings
mkdir -p "$TMP/schemas"
glib-compile-schemas --strict --targetdir="$TMP/schemas" "$ROOT/src/schemas"
GSETTINGS_BACKEND=memory ISLAND_SCHEMA_DIR="$TMP/schemas" gjs -m "$ROOT/tests/smoke/prefs.smoke.js"
