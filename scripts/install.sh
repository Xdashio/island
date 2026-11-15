#!/usr/bin/env bash
# Copies the extension into the user's GNOME Shell extensions folder.
set -euo pipefail

UUID="island@xdashio"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

glib-compile-schemas --strict "$ROOT/src/schemas"
mkdir -p "$DEST"
rsync -a --delete "$ROOT/src/" "$DEST/"
echo "Installed to $DEST"
