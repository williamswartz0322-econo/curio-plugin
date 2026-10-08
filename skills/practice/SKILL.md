---
name: practice
description: Practise a Curio course right here in the terminal — validated questions grounded in the book, graded answers, and the learner model updated as you go. Use when the learner asks to be quizzed, to practise, or to do their reviews without the browser reader (or when the reader isn't connected).
argument-hint: "[course] [chapter id | review]"
allowed-tools: mcp__plugin_curio_curio, Read, Agent
---

# Practice in the terminal

Same loop as the reader's Practice tab, with you presenting each question
here. Read these once, the first time you need them:
`${CLAUDE_PLUGIN_ROOT}/skills/study/references/practice.md` and
`${CLAUDE_PLUGIN_ROOT}/skills/study/references/grading.md`.

1. Choose the course (`status` with no arguments lists them; ask if unclear).
2. Choose what to practise:
   - `review` (or no chapter and reviews are due): `status(course)` and work
     through `review_due` in order — it is already interleaved across chapters.
   - a chapter: `practice_targets(course, chapter)`, weakest first.
3. For each concept:
   1. `concept_passages` → draft → `propose_item` → `curio:item-validator`
      agent on the validation file → `settle_item` (no request_id).
      Rejected: move to the next concept. Never present an unvalidated item.
   2. Show the learner only the question (with its kind and concept name),
      then stop and wait for their answer.
   3. `get_item` → grade → `record_grade` (no request_id). Show the feedback
      and the verdict.
   4. Offer the next question; stop when they say so.
4. End with a one-line summary: questions answered, verdicts, and anything
   that moved to "solid" or "shaky".

Never reveal the expected answer or common errors before the learner answers.
