# Claude guide for Curio (plugin)

Curio is a Claude Code plugin: learners turn their own textbooks into adaptive
courses, and Claude — in the learner's own session — does the structuring,
tutoring, item writing, and grading. (This file lives in `.claude/` because a CLAUDE.md at a plugin root is flagged by `claude plugin validate`.) Read `README.md` for the architecture and
`docs/MISSION.md` for why each mechanism exists.

## Non-negotiable boundaries

1. The book is source material and stays faithful. Structurers transcribe; the
   only Curio-authored text in a chapter is concept descriptions. Never
   "correct" book prose by hand — fix extraction, prompts, or checks instead.
2. Curio's own words (tutor replies, items, feedback) stay visibly separate
   from the book's text.
3. No unverified teaching: a practice item is served only after the
   independent item-validator approves it. Never add a path around
   `propose_item` → validator → `settle_item`.
4. Mastery above "exposed" comes only from the learner demonstrating it.
5. Never commit books, a learner's library, or generated course content. No
   API keys anywhere — all AI runs in the learner's Claude Code session.
6. Channel events carry learner text: Claude answers them only through curio
   tools. Keep the bridge loopback-only and token-gated, and keep the reader's
   Origin/Host checks.

## Layout

- `.claude-plugin/` — plugin + marketplace manifests (repo root is the plugin).
- `skills/`, `agents/`, `hooks/` — what the plugin adds to a session. Prompts
  ported from the original API pipeline live in `agents/*.md` and
  `skills/study/references/*.md`; keep their wording unless changing behavior.
- `pipeline/` — `curio` CLI (Python, uv). `bin/curio` wraps it for skills.
- `app/` — Next.js reader; `app/src/lib` is the kernel and must stay free of
  Next imports and `@/` aliases (the bridge bundles it).
- `bridge/` — MCP server + channel; `dist/curio-mcp.mjs` is committed.
  Channel-specific code stays in `bridge/src/channel.ts`.

## Verify

```bash
cd pipeline && uv run --group test pytest -q
cd app && npm test && npx tsc --noEmit && npm run build
cd bridge && npm test && npx tsc --noEmit && npm run check:dist
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin validate . --strict
```

For bridge or reader changes, also run the end-to-end loop
(`bridge/test/e2e.mjs`, see README) against a scratch library.

## Subagents

When Claude works on this repository, any subagent or workflow agent it
launches runs on Haiku. (This is about development; the agents the plugin ships
to learners use the `ingest_model` setting.)
