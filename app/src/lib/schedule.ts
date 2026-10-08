// Retention scheduling (memo §2.17; Cepeda et al. on distributed practice).
//
// Expanding intervals per concept, driven by the retrieval streak — each
// successful delayed retrieval earns a longer gap, a failure resets it. Kept
// deliberately interpretable, like everything else in the learner model.
import { conceptRegistry, loadLearner, type ConceptState } from "./learner";

/** Review gap in days, indexed by consecutive successful retrievals. */
export const INTERVALS = [1, 3, 7, 14, 30];

export interface DueConcept {
  key: string;
  name: string;
  chapter: string;
  chapterTitle: string;
  mastery: ConceptState["mastery"];
  streak: number;
  daysSinceSeen: number;
  daysOverdue: number;
  why: string;
}

export function intervalFor(state: ConceptState): number {
  if (state.mastery === "shaky") return 1; // retest tomorrow, not in a fortnight
  const streak = state.streak ?? 0;
  return INTERVALS[Math.min(streak, INTERVALS.length - 1)];
}

function daysSince(iso: string): number {
  const then = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/**
 * Concepts due for retrieval, most overdue first. Only concepts with something
 * to retain qualify: demonstrated ones (developing/solid), plus shaky ones
 * worth a retest. `exposed` isn't retention — it's the action engine's job.
 */
export function reviewQueue(courseId: string): DueConcept[] {
  const learner = loadLearner(courseId);
  const registry = conceptRegistry(courseId);
  const due: DueConcept[] = [];

  for (const [key, state] of Object.entries(learner.concepts)) {
    if (state.mastery === "exposed") continue;
    const entry = registry.get(key);
    if (!entry) continue;

    const gap = intervalFor(state);
    const since = daysSince(state.lastSeen);
    const overdue = since - gap;
    if (overdue < 0) continue;

    const streak = state.streak ?? 0;
    due.push({
      key,
      name: entry.name,
      chapter: entry.chapter,
      chapterTitle: entry.chapterTitle,
      mastery: state.mastery,
      streak,
      daysSinceSeen: since,
      daysOverdue: overdue,
      why:
        state.mastery === "shaky"
          ? `Shaky ${since} day${since === 1 ? "" : "s"} ago — a retest shows whether it stuck.`
          : `Last retrieved ${since} day${since === 1 ? "" : "s"} ago; its ${gap}-day interval is up. Retrieving now is what makes it stick.`,
    });
  }

  return due.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/**
 * Order a review session: interleaved round-robin across chapters (Rohrer &
 * Taylor — mixed practice beats blocked) rather than draining one chapter.
 */
export function interleave(due: DueConcept[], limit: number): DueConcept[] {
  const byChapter = new Map<string, DueConcept[]>();
  for (const concept of due) {
    byChapter.set(concept.chapter, [...(byChapter.get(concept.chapter) ?? []), concept]);
  }
  const lanes = [...byChapter.values()];
  const out: DueConcept[] = [];
  let i = 0;
  while (out.length < limit && lanes.some((lane) => lane.length > 0)) {
    const lane = lanes[i % lanes.length];
    const next = lane.shift();
    if (next) out.push(next);
    i++;
  }
  return out;
}
