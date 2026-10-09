---
name: ingest
description: Turn a textbook PDF into a Curio course, chapter by chapter, with Claude Code agents transcribing and structuring the text. Use when the learner wants to add a book, or more chapters of a book, to Curio.
argument-hint: "<path to PDF> [chapters, e.g. 1-3]"
allowed-tools: Bash(curio *), Read, Agent
---

# Ingest a textbook

Arguments: $ARGUMENTS

Library: `${user_config.library}`. If that still reads as a `${…}` placeholder,
the setting is unset: run the `curio` commands below without `--library` (the
default library is used). Otherwise add `--library "<that path>"` to each.

The book is source material and must stay faithful. Structurer agents
transcribe; they never paraphrase, and `curio` checks every answer for
dropped text. Only concept descriptions are Curio's own words. Everything
stays on this computer.

If `curio` is not found as a command (some Windows setups), call it by its
full path instead: `"${CLAUDE_PLUGIN_ROOT}/bin/curio"` from Git Bash, or
`& "${CLAUDE_PLUGIN_ROOT}/bin/curio.cmd"` from PowerShell.

## 1. The book

1. Get the PDF path from the arguments, or ask for it. Remind the learner in
   one line to use only books they have the right to use.
2. Run `curio inspect "<pdf>"`. If it lists no chapters, run the
   `curio:pdf-chapter-extractor` agent with the PDF path, then use the
   bookmarked copy it reports.
3. Agree on a course slug (the suggested one, shortened to something
   readable, e.g. `wooldridge-panel-data`) and on which chapters. Structuring
   uses a real share of plan usage — roughly a chapter's length in output — so
   suggest starting with one or two chapters unless the learner asked for more.
   Reuse the existing slug when adding chapters to a course (`curio library`).

## 2. Each chapter

Work through chapters one at a time:

1. `curio extract "<pdf>" --chapter N --course <slug>` — prints one task file
   and one answer path per batch. Re-running it keeps finished answers: batches
   it marks "already done" need no agent (useful after hitting a usage limit).
2. Run one `curio:structurer` agent per remaining batch, all of the chapter's in a
   single message so they run in parallel (at most six at once). Use model
   `${user_config.ingest_model}` — if that says `inherit`, omit the model
   parameter; if it still reads as a `${…}` placeholder, use `sonnet`. Prompt
   each with just: `Task file: <task path>`.
3. `curio assemble --course <slug> --chapter N`. If a batch fails, run a
   structurer on that batch's task file again, quoting its error lines in the
   prompt (an error can name a batch whose own check passed — e.g. it stopped
   before finishing its last section). After two failed retries of the same
   batch, stop and report.
4. Run the `curio:concept-extractor` agent (same model rule) with:
   `Outline: <outline path>. Course: <slug>. Chapter: N.` (plus `Library: <path>`
   if you are passing `--library`).
   It writes the concepts and runs `curio finalize`.
5. Confirm with `curio library`, and report in one line: sections, blocks,
   concepts, and the coverage `assemble` printed.

## 3. Afterwards

- With two or more chapters ingested, run `/curio:link` (or offer to) so the
  course map shows prerequisites across chapters.
- Tell the learner to start with `/curio:study <slug>`.
- A free alternative for skimming: `curio draft "<pdf>" --chapter N --course <slug>`
  makes a readable draft with no AI (no typed blocks, concepts, or practice).
