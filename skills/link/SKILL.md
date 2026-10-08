---
name: link
description: Build a Curio course's prerequisite graph (which concepts depend on which, across chapters) and, with several courses, the cross-course knowledge web. Use after ingesting chapters, or when the learner asks for the course map's connections.
argument-hint: "<course> [--web]"
allowed-tools: Bash(curio *), Read, Agent
---

# Link concepts

Arguments: $ARGUMENTS

Library: `${user_config.library}`. If that still reads as a `${…}` placeholder,
the setting is unset: run the `curio` commands below without `--library` (the
default library is used). Otherwise add `--library "<that path>"` to each.

If `curio` is not found as a command (some Windows setups), call it by its
full path instead: `"${CLAUDE_PLUGIN_ROOT}/bin/curio"` from Git Bash, or
`& "${CLAUDE_PLUGIN_ROOT}/bin/curio.cmd"` from PowerShell.

## Course graph

1. Choose the course (`curio library` lists them).
2. `curio link-prepare --course <slug>` prints the task and answer paths.
3. Run the `curio:graph-linker` agent with model `${user_config.ingest_model}`
   (omit the model parameter if that says `inherit`; use `sonnet` if it still
   reads as a `${…}` placeholder) and the prompt:
   `Task file: <task path>. Answer file: <answer path>. Apply command: curio link-apply --course <slug>`
   (adding `--library` as above).
4. Report the edge counts it returns. Re-run this after ingesting more
   chapters — the graph is rebuilt from every chapter's concepts each time.

## Knowledge web (two or more courses)

With `--web`, or when the library has several courses and the learner wants
the cross-subject view:

1. `curio weave-prepare` prints the task and answer paths.
2. Run `curio:graph-linker` the same way, with apply command
   `curio weave-apply` (adding `--library` as above).
3. The web appears at `/web` in the reader. Only concepts the learner has
   demonstrated show up there, so it fills in as they practise.
