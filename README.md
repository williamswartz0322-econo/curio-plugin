# Curio

Turn your own textbooks into an adaptive course — built and tutored by Claude
Code, on your Claude Code plan. No API key.

- **A faithful reader.** Your PDF becomes typed, readable chapters: the
  author's words verbatim, real LaTeX math, the book's own figures.
- **A grounded tutor.** Highlight any passage and ask. Answers use the book's
  notation and sections, and mark anything that goes beyond the text.
- **Practice that can't teach you something false.** Every question is
  written from the passages that teach a concept, then checked by an
  independent validator before you see it. Free-text answers are graded with
  specific feedback.
- **A learner model.** Per-concept mastery (exposed → shaky → developing →
  solid) that only rises when *you* demonstrate it — never because the tutor
  explained well.
- **What to do next, and why.** A prerequisite map of the whole book, spaced
  and interleaved reviews, goals with a daily plan, and a transparent "next
  up" policy that states its reasons.

Why it works this way: [docs/MISSION.md](docs/MISSION.md) and the reading list
behind each mechanism, [docs/READING.md](docs/READING.md).

## Install

Requirements: Claude Code, [Node.js](https://nodejs.org) 20+, and
[uv](https://docs.astral.sh/uv/).

```
/plugin marketplace add <owner>/curio-plugin
/plugin install curio@curio
/curio:setup
```

`/curio:setup` builds the reader (about a minute, once per version), creates
your library at `~/Curio`, and offers to allow Curio's tools so the reader
isn't stalled by permission prompts.

## Use

```
/curio:ingest ~/Books/my-textbook.pdf      # add a book, a chapter or two at a time
/curio:link my-textbook                    # prerequisite graph across chapters
/curio:study my-textbook                   # open the reader, tutored by this session
/curio:practice my-textbook review         # practise in the terminal instead
/curio:next my-textbook                    # today's plan and what to do next
```

The reader opens in its own window — no tabs or address bar — when Chrome,
Edge, Brave, Chromium, or Vivaldi is installed, and in your default browser
otherwise. Set `reader_window` to `browser` in `/config` to always use a tab.

### Asking and practising from the reader

The reader sends your questions into your running Claude Code session through
a **channel**. Channels are a Claude Code research preview, so Curio's isn't
on the default allowlist yet, and the session has to be started with:

```
claude --dangerously-load-development-channels plugin:curio@curio
```

An alias helps: `alias curio-study='claude --dangerously-load-development-channels plugin:curio@curio'`.
On Team and Enterprise plans an admin must enable channels first.

Without the channel, everything else still works: reading, the course map,
reviews and goals in the browser, and `/curio:practice` / `/curio:next` in the
terminal. The reader shows whether it is connected.

## Privacy and your books

Everything stays on your computer: the PDF, the structured course, and your
learner state live in your library folder (`~/Curio` by default; change it
in `/config`). Text goes only to Claude, through your own Claude Code
session. Use books you have the right to use; Curio never uploads or shares
them.

## Usage on your plan

Turning a book into a course is the expensive part: structuring writes out
roughly a chapter's worth of text per chapter. Ingest a chapter or two at a
time, and pick the model in `/config` (`ingest_model`: sonnet by default; opus
is most faithful on dense math). Studying costs about what any Claude Code
conversation does.

## How it fits together

```
Claude Code session (your plan)
 ├─ skills   /curio:setup  ingest  link  study  practice  next
 ├─ agents   structurer · concept-extractor · graph-linker · item-validator · pdf-chapter-extractor
 └─ MCP server "curio"  (bridge/dist/curio-mcp.mjs)
      ├─ tools: context, reply, update_learner, propose_item, settle_item, record_grade, status, …
      └─ on /curio:study: a loopback bridge + the Next.js reader, as child processes
```

- `pipeline/` — the deterministic half of ingestion (`curio` CLI): PDF
  extraction, task files for the agents, and checks on every answer
  (schema, page ranges, figures, and word coverage against the source).
- `agents/` — the judgment half: transcription into block markup, concept
  naming, graph edges, practice validation.
- `app/` — the reader (Next.js) and, in `app/src/lib`, the kernel: learner
  model, assessment state, action engine, schedule, plan.
- `bridge/` — the MCP server that exposes the kernel to Claude and carries the
  reader's requests into the session.

## Develop

```bash
cd pipeline && uv run --group test pytest -q
cd app && npm install && npm test && npx tsc --noEmit
cd bridge && npm install && npm test && npm run check:dist
```

Load your working copy as the plugin: `/plugin marketplace add ~/path/to/curio-plugin`
then `/plugin install curio@curio` (a local marketplace loads in place, so
edits apply on the next session or `/reload-plugins`).

End-to-end check of the reader ↔ bridge ↔ session loop, with a script playing
Claude (use a scratch copy of a library — it writes learner state):

```bash
bash scripts/setup.sh /tmp/curio-data
CURIO_LIBRARY=/tmp/scratch-library CLAUDE_PLUGIN_DATA=/tmp/curio-data \
  node bridge/test/e2e.mjs <course> <chapter>
```

After changing anything the bridge imports (`bridge/src`, `app/src/lib`), run
`npm run build` in `bridge/` and commit `bridge/dist/curio-mcp.mjs`.
