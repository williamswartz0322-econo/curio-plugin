# Curio — Mission

> **Curio exists to give every learner what the best-taught student has always had: a course built around them.** Grounded in real sources, aware of what they know, honest about what it takes to know more — and always able to say what to do next, and why.

## The problem, precisely

In 1984 Benjamin Bloom published the "two-sigma problem": students taught one-on-one by a tutor using mastery methods performed **two standard deviations** better than students in a conventional classroom — the average tutored student beat 98% of the classroom. Bloom called it a problem because one-to-one tutoring doesn't scale, and challenged researchers to find methods that get classroom instruction close to it.

That is the gap Curio exists to close. Not "make studying more convenient" — close the tutoring gap with software. (Honesty footnote: careful meta-analysis — VanLehn 2011 — puts human tutoring nearer 0.8σ than Bloom's 2σ, and finds good tutoring software already rivaling human tutors. The gap is real and closable even if the famous number is the legend rather than the estimate; see [READING.md](READING.md).) Everything the tutor does that the classroom cannot is a mechanism Curio must eventually have: knowing exactly what this learner knows, choosing the next activity for *them*, refusing to move on past sand, giving immediate feedback on their actual attempt, and returning to things at the moment they're about to be forgotten.

## What we believe

1. **The loop is the product.** The value of AI in education is not explanation on demand — a sidebar can do that. It is the continuous cycle of *observe → model → choose → deliver → assess → update → revisit*. Every feature must either feed the loop or render it. (This was the original memo's §1.2 thesis. It was right.)
2. **Grounding is non-negotiable.** Learning runs on trust. Curio teaches *from* real sources — textbooks, and eventually journals and instructor materials — with the source and the system's own additions always distinguishable. A wrong practice answer teaches something false; generated content is verified before it is served or it is not served.
3. **We optimize for independence, not engagement.** Success is the learner needing Curio less: solving unaided, transferring to unfamiliar problems, retaining at a delay. Session length and message volume are cost metrics, not goals.
4. **The learner is the protagonist.** Curio recommends and explains; the learner decides. Every recommendation states its reason ("this rests on X, and X is shaky"). The learner can always see their own map — what they know, what's shaky, what's next, and why.

## Pedagogical principles → mechanisms

Every mechanism in Curio must trace to an evidence-based principle. Every principle we claim must name its mechanism. Features that map to no principle don't get built.

| Principle | Evidence base | Mechanism in Curio | Status |
|---|---|---|---|
| Retrieval practice — testing beats re-reading | Roediger & Karpicke (2006) | Practice tab; graded free-text answers as the only path to "solid" | ✅ built |
| Mastery learning — don't advance past unstable prerequisites | Bloom (1968, 1984) | Prerequisite graph + root-cause/shore-up rules in the action engine | ✅ built |
| Formative assessment — immediate, specific, actionable feedback | Black & Wiliam (1998) | Per-answer grading with what-was-right / what-was-missing / the correct point | ✅ built |
| Self-explanation & elaboration | Chi et al. (1994) | Teach-back actions; "explain in your own words" item kind | ✅ built |
| Misconception confrontation — errors named and contrasted, not talked around | diSessa; Chi (conceptual change) | Misconception records; contrast actions using the book's own counterexample | ✅ built |
| Metacognition & calibration — learners act on an accurate view of their own knowledge | Flavell; Dunning-Kruger literature | The course map: mastery-coloured, misconception-flagged, prerequisite-linked | ✅ built |
| Zone of proximal development — work just beyond current ability, scaffolded | Vygotsky | Action engine ordering: explain when thin, diagnose when shaky, stretch when solid | ✅ built |
| Transfer — mastery means use beyond the taught example | Barnett & Ceci (2002) | Transfer item kind, generated off the book's walked path | ✅ built |
| Spaced practice — reviews timed to forgetting | Ebbinghaus; Cepeda et al. (2006) | Phase F: per-concept review scheduling from mastery + last-seen + decay | ✅ built |
| Interleaving — mixed practice beats blocked | Rohrer & Taylor (2007) | Phase F: review sessions mix concepts across chapters | ✅ built |
| Worked examples first, fading as expertise grows | Sweller (cognitive load); expertise-reversal effect | Worked-example blocks exist; fading policy belongs to the planner | ○ planned |
| Desirable difficulty — productive struggle, not frictionless answers | Bjork & Bjork | Tutor answers directly (learner's choice) but practice never reveals before an attempt | ◐ partial |
| Goal-directed learning & autonomy | Deci & Ryan (self-determination theory) | Phase G: goal capture, target dates, a daily plan that replans as evidence arrives | ◐ partial |
| Active learning over passive reception | Freeman et al. (2014) | Horizon 3: labs and sessions are doing-first; lectures embed checkpoints | ○ planned |
| Multimedia learning — narration + graphics, coherence over decoration | Mayer | Horizon 3: generated lectures follow Mayer's principles, reuse the book's own figures | ○ planned |

## Architecture doctrine: one kernel, many renderers

The lesson from building v0: **everything tailored shares one spine.** What makes a lesson plan, a tutoring session, a lecture, or a coding lab *personal* is not the modality — it is that the modality reads and writes the same learner state.

**The kernel** (exists today, must stay source- and modality-agnostic):

- **Content compiler** — sources → typed educational objects. Today: one textbook per course. Direction: many sources per course (multiple books, journal articles, instructor notes) compiled into *one* concept graph — concepts already merge across chapters; merging across sources is the same operation.
- **Knowledge graph** — typed, evidenced, probabilistic relations between concepts.
- **Learner model** — per-concept mastery on an interpretable ladder, evidence trails, misconceptions. The only path above "exposed" is demonstration.
- **Assessment engine** — generates grounded items, validates before serving, grades attempts, writes evidence back.
- **Action engine** — transparent policy over all of the above; every action carries its reason.

**Renderers** (each is a way of *delivering* kernel decisions and *collecting* kernel evidence):

| Renderer | What it is | Status |
|---|---|---|
| Reader | The book itself, typed and interactive | ✅ |
| Tutor | Grounded conversation, anywhere in the text | ✅ |
| Practice | One-item assessment loop | ✅ |
| Course map | The learner's own knowledge state, visible | ✅ |
| Review queue | Spaced, interleaved retrieval (F) | ✅ |
| **Lesson plan** | The action engine extended over a time horizon: goal + deadline + available hours → a schedule of kernel actions, replanned as evidence arrives | ◐ daily plan (G) |
| **Live tutoring session** | A structured block of time — opening retrieval, guided work in the ZPD, closing check — run by the tutor with session state; voice later | ○ |
| **Lecture** | Generated exposition over a graph path: the book's figures, narration, embedded checkpoints; cached per §2.13, verified per §2.19 | ○ |
| **Coding / problem lab** | Sandboxed exercises generated from source material, auto-graded, feeding evidence back like any other attempt | ○ |
| **Knowledge web** | Obsidian-style graph of everything the learner has *learned*, across all courses and subjects — only demonstrated concepts appear, cross-subject links included, growing as they learn. The course map shows the curriculum; the web shows the person. | ◐ thin slice |

The rule that keeps the "insane architectural project" sane: **new renderers may not invent private state.** If a lab grades an attempt, that grade lands in the same learner model the tutor reads. If a lecture explains a concept, that exposure is recorded where the planner can see it. One learner, one model, every surface.

## Horizons

- **H1 — the adaptive textbook** (now): one learner, one source per course, full loop. Phase F (spacing + interleaving) is built. Exit test: measurably better delayed retrieval on practised vs unpractised concepts.
- **H2 — the course**: goal capture and deadlines (§2.7), syllabus alignment (§2.6), the lesson-plan renderer, multi-source compilation. Exit test: give Curio a goal and a date; it runs your week and adapts when you slip.
- **H3 — the classroom of one**: live sessions, generated lectures, labs. Each new modality ships as a vertical slice wired into the kernel from day one — never as a standalone feature. Exit test: a learner can go from "I want to learn X" to competence without ever assembling their own study plan.

Sequencing rule, learned the hard way: **cut vertically.** A thin slice through kernel + renderer beats a polished surface with no loop behind it, every time.

## What we will not do

- **No engagement farming.** No streaks-for-their-own-sake, no push-notification guilt. Reviews are scheduled because forgetting curves say so.
- **No answer-vending identity.** Curio never withholds (the learner is an adult), but its measure of success is what the learner can do unaided afterwards.
- **No unverified teaching.** Content that grades or instructs passes validation or doesn't ship. Better no question than a wrong one.
- **No source laundering.** Curio doesn't replace books and papers; it compiles them into a learnable form, keeps them private to the learner, and always shows where an idea came from. (Rights and licensing for shared use: a real problem, deliberately deferred, tracked — not forgotten.)
- **No black-box pedagogy.** The learner model stays interpretable and the policy stays explainable for as long as this project has a say in it.

## How we measure ourselves

North star (memo §2.27): **durable independent mastery per hour of study.** Proxies Curio can already measure for a single learner: delayed-retrieval success rate, transfer success rate, prerequisite-gap catch rate, and the mastery ladder's honest distribution over time. When a claim of ours and a measurement disagree, the measurement wins.
