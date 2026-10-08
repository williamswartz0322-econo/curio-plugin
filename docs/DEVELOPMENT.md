# Developing Curio

How the plugin is put together, and how to work on it. For what Curio is and
how to use it, see the [README](../README.md); for why each mechanism exists,
[MISSION.md](MISSION.md) and [READING.md](READING.md).

## Architecture

All AI work runs inside the learner's own interactive Claude Code session —
that is what lets Curio run on a Claude Code plan instead of an API key.

```
Claude Code session (the learner's plan)
 ├─ skills   /curio:setup  ingest  link  study  practice  next
 ├─ agents   structurer · concept-extractor · graph-linker · item-validator · pdf-chapter-extractor
 └─ MCP server "curio"  (bridge/dist/curio-mcp.mjs)
      ├─ tools: context, reply, update_learner, propose_item, settle_item, record_grade, status, …
      └─ on /curio:study: a loopback bridge + the Next.js reader, as child processes
```

- `pipeline/` — the deterministic half of ingestion (`curio` CLI, wrapped by
  `bin/curio`): PDF extraction, task files for the agents, and checks on every
  answer (schema, page ranges, figures, and word coverage against the source).
- `agents/` — the judgment half: transcription into block markup, concept
  naming, graph edges, practice validation.
- `app/` — the reader (Next.js) and, in `app/src/lib`, the kernel: learner
  model, assessment state, action engine, schedule, plan. The kernel uses
  relative imports only, because the bridge bundles it.
- `bridge/` — the MCP server that exposes the kernel to Claude as validated
  tools, and the channel that carries the reader's requests into the session.
  Channel-specific code lives in `bridge/src/channel.ts` (channels are a
  research preview). `dist/curio-mcp.mjs` is committed so the server runs
  without `npm install`.

### Ingestion

Each step that used to be one API call is now prepare → agent → check:

1. `curio extract` splits a chapter into batches of about 20k characters and
   writes one task file per batch (sections to emit, figure assets, the
   page-marked excerpt).
2. A `structurer` agent answers each batch in block markup — plain text, so
   LaTeX never needs JSON escaping — and runs `curio check-batch` until it
   passes.
3. `curio assemble` merges batches (dropping text duplicated across a shared
   boundary page), renumbers ids, and checks word coverage.
4. A `concept-extractor` agent writes `concepts.json`; `curio finalize`
   validates it and writes the chapter.

### The study loop

The reader posts a request to its own server, which forwards it (with a
per-launch token) to the bridge. The bridge emits a channel event into the
session and holds the request open until Claude answers through a tool
(`reply`, `settle_item`, `record_grade`, `fail_request`) or it times out. A
ping on open tells the reader whether the session is listening.

## Checks

```bash
cd pipeline && uv run --group test pytest -q
cd app && npm install && npm test && npx tsc --noEmit && npm run build
cd bridge && npm install && npm test && npx tsc --noEmit && npm run check:dist
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin validate . --strict
```

End-to-end check of the reader ↔ bridge ↔ session loop, with a script playing
Claude (point it at a scratch copy of a library — it writes learner state):

```bash
node scripts/setup.mjs /tmp/curio-data
CURIO_LIBRARY=/tmp/scratch-library CLAUDE_PLUGIN_DATA=/tmp/curio-data \
  node bridge/test/e2e.mjs <course> <chapter>
```

After changing anything the bridge imports (`bridge/src`, `app/src/lib`), run
`npm run build` in `bridge/` and commit `bridge/dist/curio-mcp.mjs`.

## Trying a working copy

Load it for one session, without installing:

```bash
claude --plugin-dir ~/path/to/curio-plugin \
  --dangerously-load-development-channels plugin:curio@inline
```

Or install it from the local folder (a local marketplace loads in place, so
edits apply on the next session or `/reload-plugins`):

```
/plugin marketplace add ~/path/to/curio-plugin
/plugin install curio@curio
```
