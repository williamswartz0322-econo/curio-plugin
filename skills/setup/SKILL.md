---
name: setup
description: Set up Curio on this computer — check Node and uv, build the reader, create the library folder, and allow Curio's tools so the reader isn't stalled by permission prompts. Use on first install, after an update, or when the reader won't open.
allowed-tools: Bash(node --version), Bash(uv --version), Bash(curio *), Read
---

# Set up Curio

1. Check the tools: `node --version` (needs 20 or newer) and `uv --version`.
   If either is missing, tell the learner how to install it — Node from
   https://nodejs.org or `brew install node`; uv with
   `curl -LsSf https://astral.sh/uv/install.sh | sh` or `brew install uv` —
   and stop until they have.
2. Build the reader (a minute or two the first time; instant when current):
   `bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh" "${CLAUDE_PLUGIN_DATA}"`
3. Warm the pipeline's Python environment and create the library:
   `mkdir -p "${user_config.library}"` (expand a leading `~`), then
   `curio library --library "${user_config.library}"`.
4. Permissions. Reader requests are answered by tool calls in this session; a
   permission prompt on each one would stall the learner's browser. Ask the
   learner whether to add these to `permissions.allow` in
   `~/.claude/settings.json`, explaining each in a few words:
   - `mcp__plugin_curio_curio` — Curio's own tools (course and learner files)
   - `Bash(curio *)` — the ingestion pipeline
   - `Read(<library>/**)` and `Edit(<library>/**)` — so ingestion agents can
     read tasks and write answers in the library (use the expanded absolute
     library path, prefixed with `/` so it reads as `//Users/...`, or `~/...`)
   Only edit the file if they agree; merge into the existing `allow` list
   rather than replacing anything.
5. Channels. Ask and Practice in the browser need Claude Code started with
   the curio channel, which is a research preview:
   `claude --dangerously-load-development-channels plugin:curio@curio`
   Suggest an alias, e.g. `alias curio-study='claude --dangerously-load-development-channels plugin:curio@curio'`,
   and mention that Team/Enterprise organizations must have channels enabled
   by an admin. Without the channel, reading works and `/curio:practice` runs
   in the terminal.
6. Finish with the next step: `/curio:ingest <path to a PDF>`.
