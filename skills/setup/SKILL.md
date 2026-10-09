---
name: setup
description: Set up Curio on this computer — install what's missing (Node.js, uv), build the reader, create the library folder, allow Curio's tools so the reader isn't stalled by permission prompts, and make a `curio-study` shortcut. Use on first install, after an update, or when the reader won't open.
allowed-tools: Bash(node --version), Bash(uv --version), Bash(curio *), Read
---

# Set up Curio

The learner may not be technical. Explain each step in a sentence of plain
language, ask before installing anything or changing settings, and never
assume they know what a terminal command does. Work out the platform first
(macOS, Windows, or Linux) and use the matching instructions below.

## 1. Check what's installed

Run `node --version` (needs 20 or newer) and `uv --version`; on Windows also
`git --version` (Git for Windows gives Claude Code the shell Curio's commands
expect).

If something is missing or Node is too old, offer to install it. With their
yes:

- **Windows:** `winget install --id Git.Git -e`,
  `winget install --id OpenJS.NodeJS.LTS -e`, and
  `winget install --id astral-sh.uv -e` (accept the source agreements if
  winget asks). If winget isn't available, send them to https://nodejs.org
  (big download button, click Next through the installer) and run
  `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"` for uv.
- **macOS:** Node — if `brew` exists, `brew install node`; otherwise send them
  to https://nodejs.org (big download button, open the file, click Continue
  through the installer). uv — `curl -LsSf https://astral.sh/uv/install.sh | sh`.
- **Linux:** uv — `curl -LsSf https://astral.sh/uv/install.sh | sh`; Node —
  their distribution's `nodejs` package if it is 20+, otherwise nodejs.org.

New installs aren't visible to this running session. After installing, tell
the learner: type `/exit`, close the terminal window, open a new one, start
Claude Code the same way as before, and run `/curio:setup` again. Stop here
until they do.

uv brings its own Python, so nothing else is needed.

## 2. Build the reader

A minute or two the first time (it downloads the reader's parts); instant
when already current:

`node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" "${CLAUDE_PLUGIN_DATA}"`

## 3. Create the library

`curio library --library "${user_config.library}"` — if that value still
reads as a `${…}` placeholder, run plain `curio library`. It creates the
library folder (by default `Curio` in their home folder) and prints its path.
Tell the learner that's where their books and progress live.

## 4. Allow Curio's tools

The reader's questions are answered by tool calls in this session; a
permission prompt on each one would leave the learner waiting in the reader.
Explain that, then ask whether to add these to `permissions.allow` in their
user settings file (`~/.claude/settings.json`; on Windows
`%USERPROFILE%\.claude\settings.json`):

- `mcp__plugin_curio_curio` — Curio's own tools (course and progress files)
- `Bash(curio *)` — the program that turns PDFs into courses
- `Read(<library>/**)` — so Curio's helpers can read the library
- `Edit(<library>/courses/*/work/**)` — so the PDF-processing helpers can
  write their answers. Only the `work` folders: chapters and progress are
  changed through Curio's own tools, which check every change.

Use the path step 3 printed, written as `~/Curio/...` for the default.

Only edit the file if they agree. Read it first and merge into the existing
`allow` list; never remove or replace anything already there.

## 5. Make the `curio-study` shortcut

Asking and practising in the reader need Claude Code started with Curio's
connection switched on:

`claude --dangerously-load-development-channels plugin:curio@curio`

(If this session loaded Curio with `--plugin-dir` rather than installing it,
the name is `plugin:curio@inline`.) Offer to save that as a shortcut called
`curio-study`. With their yes:

- **macOS / Linux:** append
  `alias curio-study='claude --dangerously-load-development-channels plugin:curio@curio'`
  to `~/.zshrc` (macOS default) or `~/.bashrc`, unless it's already there.
- **Windows:** append
  `function curio-study { claude --dangerously-load-development-channels plugin:curio@curio @args }`
  to their PowerShell profile (the path `$PROFILE` prints; create the file
  and its folder if missing), unless it's already there. If PowerShell later
  refuses to load the profile because scripts are disabled, they can run
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

Tell them what to expect: the first time, Claude Code shows a warning about a
"development channel" — it's the link between the book window and Claude, new
enough to carry a warning label — and they choose "I am using this for local
development". Team and Enterprise accounts may need an admin to allow
channels.

## 6. Finish

Summarize what was done in a few plain lines. Nothing needs a restart unless
step 1 installed something. Then the next steps:
1. If this session was started with Curio's connection on (a dim
   "Channels (experimental) … plugin:curio" line under the banner), they can
   carry straight on. Otherwise, `/exit` and start again with `curio-study`.
2. Add a book: `/curio:ingest` followed by the PDF (dragging the file into the
   window types its location).
3. Study: `/curio:study`.
