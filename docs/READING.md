# Curio — the reading behind the decisions

A private list for keeping up with (and second-guessing) the pedagogical
choices in this codebase. Each entry says what it is and **which decision it
informs**, so you can read in any order and still know why it's here.

Read it the way Curio would have you read: one thing at a time, spaced, and
test yourself — after each, try to state from memory which mechanism it
justifies and whether you buy it.

## Tier 1 — the core four (start here)

1. **Brown, Roediger & McDaniel — *Make It Stick* (2014).** The accessible
   synthesis of retrieval practice, spacing, interleaving, and desirable
   difficulties, by the researchers themselves. One book that explains most of
   the Practice tab and all of Phase F. If you read nothing else, read this.
2. **Bloom — "The 2 Sigma Problem" (*Educational Researcher*, 1984).** Eight
   pages. The mission paper: tutored students two standard deviations above the
   classroom, and the challenge to match it at scale.
3. **VanLehn — "The Relative Effectiveness of Human Tutoring, Intelligent
   Tutoring Systems, and Other Tutoring Systems" (*Educational Psychologist*,
   2011).** The honest correction to #2: careful meta-analysis puts human
   tutoring nearer **0.8σ** than 2σ — and finds good tutoring *software*
   already statistically indistinguishable from human tutors. Read this so our
   own mission statement doesn't fool you: the gap is real and closable, but
   the famous number is the upper legend, not the meta-analytic estimate.
4. **Dunlosky et al. — "Improving Students' Learning With Effective Learning
   Techniques" (*Psychological Science in the Public Interest*, 2013).** Rates
   ten study techniques by evidence. Practice testing and distributed practice
   come out on top; highlighting and rereading near the bottom. This is why
   Curio's loop is retrieval-and-spacing shaped, and why "a nicer reading
   experience" alone was never going to be the product.

## Tier 2 — the mechanism-by-mechanism primary sources

| Reading | Decision it informs |
|---|---|
| Roediger & Karpicke, "Test-Enhanced Learning" (2006) | Mastery rises **only** on demonstration; the tutor explaining well counts as exposure, never mastery |
| Bloom, "Learning for Mastery" (1968) | Prerequisite gating; the action engine's refusal to build on sand |
| Cepeda et al., distributed-practice meta-analysis (2006) | Phase F's expanding review intervals |
| Rohrer & Taylor, "The shuffling of mathematics problems..." (2007) | Review sessions mix concepts and item kinds rather than blocking |
| Bjork & Bjork, "Making Things Hard on Yourself, But in a Good Way" (2011 chapter — short, readable) | Practice requires an attempt before feedback; ease of processing is not learning |
| Chi et al., "Eliciting Self-Explanations Improves Understanding" (1994) | Teach-back actions; the "explanation" item kind |
| Black & Wiliam, "Inside the Black Box" (1998) | Grading feedback shape: what was right, what was missing, then the correct point |
| Wood, Bruner & Ross, "The Role of Tutoring in Problem Solving" (1976) | Scaffolding as the tutor's job description; the ZPD ordering in the action engine |
| Sweller, worked-example effect (any of his reviews; or Clark, Nguyen & Sweller, *Efficiency in Learning*) | Worked examples kept whole as first-class blocks; fading them is planned planner work |
| Kalyuga et al., "The Expertise Reversal Effect" (2003) | Why scaffolding must *fade* — help that aids novices harms the practised |
| Barnett & Ceci, "When and Where Do We Apply What We Learn?" (2002) | The transfer item kind, and why "solid on the book's example" isn't the end state |

## Tier 3 — for the horizons

- **Deci & Ryan, "Self-Determination Theory and the Facilitation of Intrinsic
  Motivation" (2000).** Autonomy, competence, relatedness. Behind the
  anti-engagement-farming stance and Phase G's learner-owned goals.
- **Mayer — *Multimedia Learning*.** The evidence on narration + graphics,
  coherence, and what decoration costs. Required before Phase J (generated
  lectures) writes a single frame.
- **Freeman et al., active-learning meta-analysis (*PNAS*, 2014).** Doing beats
  listening across STEM. The argument for labs (Phase K) being a core renderer
  rather than a gimmick.
- **Koedinger & Aleven, "Exploring the Assistance Dilemma" (2007).** When
  giving help beats withholding it and vice versa — the sharpest framing of the
  tension between our answer-directly tutor and our attempt-first practice.

## Tier 4 — the contrarian shelf (read to disagree with us)

- **Pashler et al., "Learning Styles: Concepts and Evidence" (2008).** The
  canonical debunking. It's why Curio personalizes on *evidence of knowledge
  state* and never on "visual vs auditory learner" questionnaires.
- **Karpicke & Blunt, "Retrieval Practice Produces More Learning than
  Elaborative Studying with Concept Mapping" (2011).** A direct shot at concept
  maps — which we built. The reconciliation matters: Curio's map is a
  *metacognitive display* of demonstrated knowledge, not a study activity; the
  studying happens in retrieval. If we ever catch ourselves treating the map as
  the learning, this paper is the correction.

## Standing rule

When a reading here and a mechanism in the codebase disagree, one of them is
wrong — file it, don't shrug. The principles table in [MISSION.md](MISSION.md)
is the contract; this list is its bibliography.
