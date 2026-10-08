#!/usr/bin/env bash
# Print a short hash of the reader's sources, so a build can tell whether it
# is current. Usage: reader-hash.sh <plugin root>
set -euo pipefail
APP="$1/app"
{
  cat "$APP/package-lock.json" "$APP/package.json" "$APP/next.config.ts" "$APP/tsconfig.json"
  find "$APP/src" -type f | LC_ALL=C sort | while IFS= read -r f; do
    printf '%s\n' "${f#"$APP"/}"
    cat "$f"
  done
} | shasum | cut -c1-16
