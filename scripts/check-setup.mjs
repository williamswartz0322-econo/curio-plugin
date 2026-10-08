#!/usr/bin/env node
// SessionStart hook: say so (into Claude's context) when the reader needs
// building for this plugin version. Silent when everything is current.
import path from "path";
import { isCurrent } from "./reader-build.mjs";

try {
  const data = process.env.CLAUDE_PLUGIN_DATA;
  if (!data || !isCurrent(path.join(data, "app"))) {
    console.log(
      "Curio: the reader is not built for this version of the plugin. If the learner wants to study or open the reader, run /curio:setup first."
    );
  }
} catch {
  // A broken check must never block a session from starting.
}
