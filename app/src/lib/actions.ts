// Pedagogical action engine (memo §2.9).
//
// A transparent, ordered rule policy — explicitly NOT a learned ranker; the memo
// is clear that a readable policy comes first and learned ranking waits for
// outcome data. Every action carries a `why` because §1.5 requires that any
// recommendation can explain itself to the learner.
import type { ItemKind } from "./assessment";
import { loadChapter } from "./content";
import { loadGraph, prerequisitesOf } from "./graph";
import { conceptRegistry, loadLearner, type ConceptState, type Mastery } from "./learner";
import { reviewQueue } from "./schedule";

export type ActionType =
  | "prerequisite_review"
  | "prerequisite_gap"
  | "misconception_contrast"
  | "explain"
  | "diagnostic"
  | "teach_back"
  | "retrieval"
  | "transfer"
  | "advance"
  | "chapter_clear";

export interface Action {
  type: ActionType;
  conceptKey: string | null;
  conceptName: string | null;
  /** The chapter this action operates in — not always the one being read (§2.5 cross-chapter). */
  chapter: string;
  label: string;
  why: string;
  deliver: "practice" | "tutor" | "read" | "none";
  itemKind?: ItemKind;
  emphasis?: string;
  prompt?: string;
}

/** A concept seen only once or twice hasn't had enough exposure to quiz cold. */
const THIN_EXPOSURE = 1;

/** Concepts in reading order — by the earliest section that develops them. */
function conceptsInReadingOrder(courseId: string, chapterId: string) {
  const chapter = loadChapter(courseId, chapterId);
  const registry = conceptRegistry(courseId);
  const entries = [...registry.values()].filter((e) => e.chapter === chapterId);
  if (!chapter) return entries;

  const sectionIndex = new Map(chapter.sections.map((s, i) => [s.id, i]));
  const position = (conceptId: string) => {
    const concept = chapter.concepts.find((c) => c.id === conceptId);
    const indices = (concept?.section_ids ?? [])
      .map((id) => sectionIndex.get(id))
      .filter((i): i is number => i !== undefined);
    return indices.length ? Math.min(...indices) : Number.MAX_SAFE_INTEGER;
  };
  return entries.sort((a, b) => position(a.id) - position(b.id));
}

/** Weak enough that anything resting on it is built on sand. */
function isWeak(state: ConceptState | undefined): boolean {
  if (!state) return true; // never encountered
  return state.mastery === "shaky" || state.mastery === "exposed";
}

const MASTERY_WORD: Record<Mastery, string> = {
  exposed: "you've only been exposed to it",
  shaky: "it's shaky",
  developing: "it's still developing",
  solid: "it's solid",
};

function standingOf(state: ConceptState | undefined): string {
  return state ? MASTERY_WORD[state.mastery] : "you haven't touched it yet";
}

/**
 * Ranked next actions for this chapter, most valuable first.
 *
 * Rule order mirrors §2.9's example policy, whose first branch is
 * "if prerequisite mastery is low, assign prerequisite review". That branch
 * needs the §2.5 graph, so it degrades gracefully to the rest of the policy
 * when `curio link` hasn't been run.
 */
export function nextActions(courseId: string, chapterId: string, limit = 4): Action[] {
  const learner = loadLearner(courseId);
  const registry = conceptRegistry(courseId);
  const ordered = conceptsInReadingOrder(courseId, chapterId);
  const graph = loadGraph(courseId);
  const actions: Action[] = [];

  const stateOf = (key: string): ConceptState | undefined => learner.concepts[key];
  const claimed = new Set<string>();

  // 0. Prerequisite review (§2.9's first rule; §2.5's root-cause diagnosis).
  //    A gap underneath a struggle explains the struggle — fix the floor first.
  if (graph) {
    const rootCauses: Action[] = [];
    const upcomingGaps: Action[] = [];

    for (const entry of ordered) {
      const state = stateOf(entry.key);
      const struggling = state && (state.mastery === "shaky" || state.misconceptions.length > 0);

      for (const edge of prerequisitesOf(graph, entry.key)) {
        const prereq = registry.get(edge.source);
        if (!prereq || claimed.has(prereq.key)) continue;
        const prereqState = stateOf(prereq.key);
        if (!isWeak(prereqState)) continue;

        const elsewhere = prereq.chapter !== chapterId;
        const where = elsewhere ? ` (${prereq.chapterTitle})` : "";

        if (struggling) {
          claimed.add(prereq.key);
          rootCauses.push({
            type: "prerequisite_review",
            conceptKey: prereq.key,
            conceptName: prereq.name,
            chapter: prereq.chapter,
            label: `Go back to ${prereq.name}${where}`,
            why: `Your trouble with ${entry.name} may start earlier: it rests on ${prereq.name}, and ${standingOf(
              prereqState
            )}. ${edge.evidence}`,
            deliver: prereqState ? "practice" : "read",
            itemKind: "explanation",
          });
        } else if (!state && elsewhere) {
          // Not struggling yet — but this chapter is about to lean on a gap.
          claimed.add(prereq.key);
          upcomingGaps.push({
            type: "prerequisite_gap",
            conceptKey: prereq.key,
            conceptName: prereq.name,
            chapter: prereq.chapter,
            label: `Shore up ${prereq.name}${where}`,
            why: `${entry.name} in this chapter builds on it, and ${standingOf(
              prereqState
            )}. Worth closing before you get there.`,
            deliver: prereqState ? "practice" : "read",
            itemKind: "explanation",
          });
        }
      }
    }
    actions.push(...rootCauses.slice(0, 2), ...upcomingGaps.slice(0, 1));
  }

  // 1. Confidently wrong — a recorded misconception outranks everything else (§2.9).
  for (const entry of ordered) {
    const state = stateOf(entry.key);
    if (!state?.misconceptions.length) continue;
    actions.push({
      type: "misconception_contrast",
      conceptKey: entry.key,
      conceptName: entry.name,
      chapter: entry.chapter,
      label: `Clear up ${entry.name}`,
      why: `You said something that doesn't hold: "${state.misconceptions[0]}". Worth settling before it propagates.`,
      deliver: "tutor",
      prompt: `I want to clear up a misconception I have about ${entry.name}. I believe: "${state.misconceptions[0]}". Contrast that belief with what the book actually says, using the book's own example, and then ask me one question to check I've got it.`,
    });
  }

  // 2. Shaky. Thin exposure means explain first; otherwise diagnose.
  for (const entry of ordered) {
    const state = stateOf(entry.key);
    if (!state || state.mastery !== "shaky" || state.misconceptions.length) continue;
    if (state.exposures <= THIN_EXPOSURE) {
      actions.push({
        type: "explain",
        conceptKey: entry.key,
        conceptName: entry.name,
        chapter: entry.chapter,
        label: `Work through ${entry.name}`,
        why: `Marked shaky, and you've only met it once. An explanation will land better than a quiz right now.`,
        deliver: "tutor",
        prompt: `Explain ${entry.name} to me from the ground up, using the book's own example. I've struggled with this one.`,
      });
    } else {
      actions.push({
        type: "diagnostic",
        conceptKey: entry.key,
        conceptName: entry.name,
        chapter: entry.chapter,
        label: `Test yourself on ${entry.name}`,
        why: `Marked shaky after ${state.exposures} encounters. A question will show whether it's actually stuck.`,
        deliver: "practice",
        itemKind: "explanation",
      });
    }
  }

  // 3. Developing — ask them to say it in their own words (§2.9 teach-back).
  for (const entry of ordered) {
    const state = stateOf(entry.key);
    if (!state || state.mastery !== "developing") continue;
    actions.push({
      type: "teach_back",
      conceptKey: entry.key,
      conceptName: entry.name,
      chapter: entry.chapter,
      label: `Explain ${entry.name} in your own words`,
      why: `You're most of the way there. Explaining it unaided is what turns partial into solid.`,
      deliver: "practice",
      itemKind: "explanation",
      emphasis:
        "The student half-knows this. Ask them to articulate the idea in their own words rather than compute anything.",
    });
  }

  // 4. Due for retrieval — driven by the expanding-interval schedule (§2.17).
  const dueHere = reviewQueue(courseId).filter(
    (d) => d.chapter === chapterId && d.mastery !== "shaky" // shaky retests are rule 2's job
  );
  for (const due of dueHere) {
    actions.push({
      type: "retrieval",
      conceptKey: due.key,
      conceptName: due.name,
      chapter: due.chapter,
      label: `Recall ${due.name}`,
      why: due.why,
      deliver: "practice",
      itemKind: due.streak >= 2 ? "application" : "recall",
    });
  }
  const dueKeys = new Set(dueHere.map((d) => d.key));

  // 5. Solid and current — push for transfer (§2.9, §2.14).
  for (const entry of ordered) {
    const state = stateOf(entry.key);
    if (!state || state.mastery !== "solid") continue;
    if (dueKeys.has(entry.key)) continue;
    actions.push({
      type: "transfer",
      conceptKey: entry.key,
      conceptName: entry.name,
      chapter: entry.chapter,
      label: `Stretch ${entry.name}`,
      why: `Solid on the book's own example. The real test is whether it holds up somewhere the book didn't walk you through.`,
      deliver: "practice",
      itemKind: "application",
      emphasis:
        "The student already answered a straightforward question on this correctly. Set the question in a situation the passages do not directly walk through, while keeping it answerable from the same principles.",
    });
  }

  // 6. Unseen — advance in reading order.
  for (const entry of ordered) {
    if (stateOf(entry.key)) continue;
    actions.push({
      type: "advance",
      conceptKey: entry.key,
      conceptName: entry.name,
      chapter: entry.chapter,
      label: `Start on ${entry.name}`,
      why: `Next concept in the chapter you haven't touched yet.`,
      deliver: "tutor",
      prompt: `Introduce ${entry.name} to me — what it is, why the chapter needs it, and the book's example. Then ask me one question to check I followed.`,
    });
    break; // only ever suggest the next one, not the whole backlog
  }

  if (actions.length === 0) {
    actions.push({
      type: "chapter_clear",
      conceptKey: null,
      conceptName: null,
      chapter: chapterId,
      label: "Nothing pressing here",
      why: `Every concept in this chapter is solid and recently practised. Move on, or come back in a few days for retrieval.`,
      deliver: "none",
    });
  }

  return actions.slice(0, limit);
}
