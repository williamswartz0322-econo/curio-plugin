---
name: next
description: What should I study next in Curio? Shows today's plan, the reviews that are due, and the action engine's recommendations — each with its reason. Use when the learner asks what to do next, how they're doing, or for their study plan.
argument-hint: "[course]"
allowed-tools: mcp__plugin_curio_curio
---

# What next

1. Choose the course (`status` with no arguments lists them; ask if unclear).
2. Call `status(course)` and present, briefly:
   - today's plan, if a goal is set (`today`) — or one line saying the reader's
     home page can set a goal and deadline;
   - how many reviews are due and for which concepts;
   - the top two or three `next_actions`, each with its `why` in the
     learner's terms.
3. Offer to run the top action: practice → `/curio:practice`; a tutor action
   → explain here using `context` (and `update_learner` afterwards, as in
   `${CLAUDE_PLUGIN_ROOT}/skills/study/references/learner-update.md`);
   reading → `/curio:study <course> <chapter>`.

The recommendations come from Curio's transparent rule policy — report them
and their reasons; don't invent your own ranking.
