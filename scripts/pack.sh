#!/usr/bin/env bash
# Builds dist/island@xdashio.shell-extension.zip, installable with
# `gnome-extensions install --force dist/island@xdashio.shell-extension.zip`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/dist"
gnome-extensions pack "$ROOT/src" --extra-source=lib --force --out-dir="$ROOT/dist"
echo "Packed $ROOT/dist/island@xdashio.shell-extension.zip"
