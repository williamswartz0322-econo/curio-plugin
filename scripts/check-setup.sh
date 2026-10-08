#!/usr/bin/env bash
# SessionStart hook: say so (into Claude's context) when the reader needs
# building for this plugin version. Silent when everything is current.
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP="${CLAUDE_PLUGIN_DATA:-}/app"
want="$("$ROOT/scripts/reader-hash.sh" "$ROOT" 2>/dev/null)" || exit 0
if [[ -f "$APP/.curio-build" && "$(cat "$APP/.curio-build")" == "$want" && -f "$APP/.next/BUILD_ID" ]]; then
  exit 0
fi
echo "Curio: the reader is not built for this version of the plugin. If the learner wants to study or open the reader, run /curio:setup first."
