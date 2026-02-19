#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="${BACKUP_OUT_DIR:-$HOME/.openclaw/backups/giles-hq-dashboard}"
STAMP="$(date +%Y%m%d-%H%M%S)"
NAME="giles-hq-dashboard-${STAMP}.tar.gz"

mkdir -p "$OUT_DIR"

tar -czf "$OUT_DIR/$NAME" \
  --exclude=".next" \
  --exclude="node_modules" \
  --exclude=".git" \
  -C "$(dirname "$SRC")" "$(basename "$SRC")"

# Keep most recent 30 backups
ls -1t "$OUT_DIR"/giles-hq-dashboard-*.tar.gz 2>/dev/null | tail -n +31 | xargs -I {} rm -f "{}"

echo "Backup created: $OUT_DIR/$NAME"