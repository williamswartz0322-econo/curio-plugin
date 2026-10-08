#!/usr/bin/env bash
# Build the Curio reader into the plugin's data directory. The plugin's own
# directory is replaced on every update, so the reader (with its
# node_modules and production build) lives in ${CLAUDE_PLUGIN_DATA}/app and is
# rebuilt only when its sources change.
# Usage: setup.sh <plugin data dir>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="${1:?usage: setup.sh <plugin data dir>}"
APP="$DATA/app"
STAMP="$APP/.curio-build"

want="$("$ROOT/scripts/reader-hash.sh" "$ROOT")"
if [[ -f "$STAMP" && "$(cat "$STAMP")" == "$want" && -f "$APP/.next/BUILD_ID" ]]; then
  echo "reader: up to date ($APP)"
  exit 0
fi

echo "reader: building into $APP ..."
mkdir -p "$APP"
rsync -a --delete --exclude node_modules --exclude .next --exclude .curio-build \
  --exclude '.env*' "$ROOT/app/" "$APP/"
cd "$APP"
npm ci --no-audit --no-fund --loglevel=error
NEXT_TELEMETRY_DISABLED=1 npx --no-install next build >"$APP/.build.log" 2>&1 || {
  tail -40 "$APP/.build.log"
  echo "reader: build failed (full log: $APP/.build.log)" >&2
  exit 1
}
echo "$want" >"$STAMP"
echo "reader: built"
