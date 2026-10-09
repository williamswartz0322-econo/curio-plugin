# Curio build roadmap

Section refs are to [curio_product_memo.md](curio_product_memo.md). The mission,
the pedagogical principles each phase must trace to, and the long-range
kernel/renderer architecture live in [MISSION.md](MISSION.md) — this file is the
build order; that one is the why.

## The plugin edition (October 2026)

Curio now ships as a Claude Code plugin: anyone can build and study their own
courses on their Claude Code plan, with no API key. Every phase below carried
over; what changed is where the model runs.

- **Ingestion** — each API call became prepare → agent → check. The `curio`
  CLI writes task files; Claude Code agents transcribe chapters into block
  markup (no JSON escaping, so LaTeX survives) and name concepts; the CLI
  checks schema, pages, figures, and word coverage against the source before
  anything is written.
- **The loop** — tutor answers, learner-model updates, item writing, and
  grading are done by Claude in the learner's session. The reader reaches that
  session through an MCP channel (a Claude Code research preview); the
  kernel's state changes go through MCP tools that validate them.
- **§2.19 still holds** — an independent item-validator agent approves every
  practice item before it is served.

Open questions this edition raises: getting the channel onto an allowlist (so
users don't need the development flag), plan-usage cost of ingesting a whole
book, and a prebuilt reader so setup needs no `npm ci`.

## The cut

The memo describes a complete system. The mistake to avoid is building it
**horizontally** (all of the reader, none of the loop) — that produces something
a Chrome extension over a PDF can already do. Each phase below is a **vertical**
slice through §1.3's five layers.

| §1.3 layer | Status |
|---|---|
| 1. Content compiler | ✅ pipeline — typed objects (§2.4), figures, concepts |
| 2. Knowledge graph | ✅ typed probabilistic edges via `curio link` (§2.5) |
| 3. Learner model | ✅ per-concept mastery, evidence, misconceptions (§2.8) |
| 4. Pedagogical action engine | ✅ rule policy + "Next up" surface (§2.9) |
| 5. Interactive interface | ✅ reader, highlight-to-tutor (§2.11) |

## Phases

### A — Learner model spine (§2.8) ✅ done

Per-concept state on an interpretable ladder (exposed / shaky / developing /
solid) with confidence, exposure count, dated evidence, and misconceptions.

Encoded rule from §1.5: *the tutor explaining well is evidence of exposure, not
mastery.* Mastery rises only when the learner demonstrates it — which is why B
is required for anything above `exposed`.

Conversations are the immutable log; `learner.json` is derived state.

### B — Assessment (§2.14) ✅ done

Generate diagnostic items targeting a concept and grounded in specific blocks;
grade free-text answers; write observed mastery back to the learner model.

Per §2.19, generated items get a validation pass before being served — a wrong
practice answer actively teaches something false, which is worse than no
practice at all. Varian's own review questions (already extracted as `exercise`
blocks) are the ground-truth check.

### C — Pedagogical action engine (§2.9) ✅ done

Ordered rule policy over the learner model, surfaced as the default "Next up"
tab with reasoning attached to every recommendation (§1.5). Actions deliver into
the existing practice and tutor surfaces.

One branch is deliberately missing: §2.9's first rule is *"if prerequisite
mastery is low, assign prerequisite review"*, which needs the edges from D. When
those land it belongs above everything else, since a missing prerequisite
explains the failures below it.

### D — Prerequisite graph (§2.5) ✅ done

`curio link` extracts typed edges across the whole course — `prerequisite_of`,
`builds_on`, `contrasts_with`, `commonly_confused_with` — each with confidence
and evidence, treated as probabilistic per the memo. Re-run it after ingesting a
chapter.

Two structural validators earn their keep: dependencies may not point backward
in reading order, and edges between duplicate copies of a concept that spans
chapters get dropped as extraction artifacts.

Concepts are extracted per chapter, so a concept spanning chapters exists as
several nodes. The map (E) merges them by slug for display; the learner model
still keys per chapter, which is correct — evidence is chapter-specific.

### E — Visual course map ✅ done

An interactive graph of the whole book the learner can see and work through.
Memo-native: §1.1 lists "a personalized course map" as a core output, §2.5 names
course maps as the graph's primary user-facing value, and §2.11 puts it at the
top of the left rail.

At `/map/<course>`. Chapter-ordered DAG, hand-rolled SVG, no graph library.
Nodes carry mastery colour and a misconception flag; selecting one dims the rest
and shows both directions of the graph with per-edge evidence, plus deep links
to every section that teaches the concept.

"Ready to learn" means *earned* — unseen, with every prerequisite solid. Root
concepts are deliberately excluded, since badging everything unblocked makes the
signal useless.

### F — Retention and review (§2.17) ✅ done

Spaced scheduling over concepts, driven by mastery, last-practiced date, and
predicted forgetting. Turns the loop from reactive to proactive.

## Beyond F — Horizon 2 and 3 (see MISSION.md)

Phases A–F complete Horizon 1: the adaptive textbook. What follows, in mission
order, each shipped as a vertical slice wired into the kernel:

- **G — Goals and the lesson plan** ✅ (H2; §2.6, §2.7): goal + deadline +
  available time → the action engine extended over a horizon; replans as
  evidence arrives. First renderer that makes Curio a *course* rather than a
  book.
- **H — Multi-source compilation** (H2): several sources compiled into one
  concept graph per course. Concepts already merge across chapters; across
  sources is the same operation. Journals enter here.
- **I — Live tutoring sessions** (H3): structured session blocks — opening
  retrieval, guided work, closing check — run by the tutor; voice later.
- **J — Generated lectures** (H3; §2.13, §2.19, Mayer's principles): exposition
  over a graph path, reusing the book's own figures, checkpointed, cached, and
  verified before serving.
- **K — Labs** (H3): sandboxed generated exercises (code first), auto-graded,
  feeding the same learner model as every other attempt.
- **L — The knowledge web** ◐ thin slice live at /web (long-term): an Obsidian-style graph of everything
  the learner has learned across all subjects. Differs from the course map on
  every axis: personal rather than curricular, cross-course rather than
  per-course, emergent (force-directed feels right here) rather than
  chapter-ordered, and *earned* — a concept enters the web when demonstrated,
  not when published. Needs a cross-course linking pass (same machinery as
  `curio link`, run over every course's concepts) and a learner-level view over
  the per-course models. Multiple courses already exist, so a thin version is
  buildable early.

New renderers may not invent private state — one learner, one model, every
surface.

## Deferred

Business model, instructor/publisher products (§1.7, §2.22), and copyright /
licensing infrastructure for shared use (§2.20) — deliberately deferred while
this is a personal tool, tracked in MISSION.md's anti-goals so it isn't
forgotten. Sources remain private to the learner until that work is done.
