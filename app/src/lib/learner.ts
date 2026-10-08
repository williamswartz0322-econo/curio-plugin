// Structured learner model (memo §2.8). Per-concept mastery state with an
// evidence trail, derived from tutoring exchanges.
//
// Design note: conversations are the immutable log; learner.json is DERIVED
// state. The judgment of what an exchange shows is made by Claude in the
// learner's session (skills/study/references/learner-update.md); this module
// validates that judgment and folds it in.
import path from "path";
import { courseDir, loadChapter, loadCourse } from "./content";
import { readJson, writeJsonAtomic } from "./fsutil";

/** Mastery ladder. Rises only on evidence from the LEARNER, never from the tutor explaining. */
export type Mastery = "exposed" | "shaky" | "developing" | "solid";
export type Confidence = "low" | "medium" | "high";

export interface Evidence {
  date: string;
  note: string;
  chapter: string;
}

export interface ConceptState {
  id: string;
  name: string;
  chapter: string;
  mastery: Mastery;
  confidence: Confidence;
  exposures: number;
  evidence: Evidence[];
  misconceptions: string[];
  lastSeen: string;
  /** Consecutive successful graded retrievals — drives the §2.17 review interval. */
  streak?: number;
}

export interface LearnerModel {
  course: string;
  /** Durable prose facts: background, goals, preferred explanation style (§2.7). */
  profile: string;
  /** Keyed by `${chapterId}:${conceptId}` — concept ids are only unique within a chapter. */
  concepts: Record<string, ConceptState>;
  updatedAt: string;
}

export interface RegistryEntry {
  key: string;
  id: string;
  name: string;
  description: string;
  chapter: string;
  chapterTitle: string;
}

const MAX_EVIDENCE_PER_CONCEPT = 6;
const SAFE_ID = /^[a-zA-Z0-9-]+$/;

function learnerPath(courseId: string): string {
  return path.join(courseDir(courseId), "learner.json");
}

export function conceptKey(chapterId: string, conceptId: string): string {
  return `${chapterId}:${conceptId}`;
}

/** Every concept across every ingested chapter of the course. */
export function conceptRegistry(courseId: string): Map<string, RegistryEntry> {
  const registry = new Map<string, RegistryEntry>();
  const course = loadCourse(courseId);
  if (!course) return registry;

  for (const entry of course.chapters) {
    const chapter = loadChapter(courseId, entry.id);
    if (!chapter) continue;
    for (const concept of chapter.concepts) {
      if (concept.id === "draft-placeholder") continue;
      const key = conceptKey(chapter.id, concept.id);
      registry.set(key, {
        key,
        id: concept.id,
        name: concept.name,
        description: concept.description,
        chapter: chapter.id,
        chapterTitle: `Chapter ${chapter.number}: ${chapter.title}`,
      });
    }
  }
  return registry;
}

export function emptyLearner(courseId: string): LearnerModel {
  return {
    course: courseId,
    profile: "(nothing recorded yet)",
    concepts: {},
    updatedAt: new Date().toISOString(),
  };
}

export function loadLearner(courseId: string): LearnerModel {
  return readJson(learnerPath(courseId), emptyLearner(courseId));
}

export function saveLearner(model: LearnerModel): void {
  if (!SAFE_ID.test(model.course)) throw new Error("invalid course id");
  model.updatedAt = new Date().toISOString();
  writeJsonAtomic(learnerPath(model.course), model);
}

/**
 * Compact learner state for the tutor's system prompt: the profile, this
 * chapter's concepts, and anything shaky elsewhere in the course.
 */
export function renderLearnerContext(courseId: string, chapterId: string): string {
  const model = loadLearner(courseId);
  const registry = conceptRegistry(courseId);
  const parts: string[] = [`# Learner profile\n\n${model.profile}`];

  const here: string[] = [];
  const unseen: string[] = [];
  for (const entry of registry.values()) {
    if (entry.chapter !== chapterId) continue;
    const state = model.concepts[entry.key];
    if (!state) {
      unseen.push(entry.name);
      continue;
    }
    const misc = state.misconceptions.length
      ? ` — misconception: ${state.misconceptions.join("; ")}`
      : "";
    const last = state.evidence.at(-1)?.note;
    here.push(
      `- ${entry.name} — **${state.mastery}**${last ? ` (${last})` : ""}${misc} [${state.lastSeen}]`
    );
  }

  parts.push(
    `# This chapter's concepts — your read on this learner\n\n` +
      (here.length ? here.join("\n") : "(no evidence yet in this chapter)") +
      (unseen.length ? `\n\nNot yet encountered: ${unseen.join(", ")}` : "")
  );

  const elsewhere = Object.values(model.concepts)
    .filter((c) => c.chapter !== chapterId && (c.mastery === "shaky" || c.misconceptions.length))
    .map((c) => `- ${c.name} (${c.chapter}) — ${c.mastery}`);
  if (elsewhere.length) {
    parts.push(`# Shaky elsewhere in the course\n\n${elsewhere.join("\n")}`);
  }

  return parts.join("\n\n");
}

export interface UpdateResult {
  concept_updates: {
    concept_id: string;
    mastery: Mastery;
    confidence: Confidence;
    evidence: string;
    misconception: string | null;
  }[];
  profile_note: string | null;
}

/**
 * Fold one tutoring exchange's judged evidence into the learner model. Returns
 * the concept keys that changed. Unknown concept ids are dropped, not errors —
 * the rules in learner-update.md say to use only listed ids.
 */
export function applyLearnerUpdate(
  courseId: string,
  chapterId: string,
  parsed: UpdateResult,
  date = new Date().toISOString().slice(0, 10)
): { touched: string[]; dropped: string[] } {
  const registry = conceptRegistry(courseId);
  const learner = loadLearner(courseId);
  const dropped: string[] = [];

  const touched: string[] = [];
  for (const update of parsed.concept_updates) {
    const key = conceptKey(chapterId, update.concept_id);
    const entry = registry.get(key);
    if (!entry) {
      dropped.push(update.concept_id); // not one of this chapter's concepts
      continue;
    }

    const existing = learner.concepts[key];
    const state: ConceptState = existing ?? {
      id: entry.id,
      name: entry.name,
      chapter: entry.chapter,
      mastery: update.mastery,
      confidence: update.confidence,
      exposures: 0,
      evidence: [],
      misconceptions: [],
      lastSeen: date,
    };

    state.mastery = update.mastery;
    state.confidence = update.confidence;
    state.exposures += 1;
    state.lastSeen = date;
    state.evidence = [...state.evidence, { date, note: update.evidence, chapter: chapterId }].slice(
      -MAX_EVIDENCE_PER_CONCEPT
    );
    if (update.misconception && !state.misconceptions.includes(update.misconception)) {
      state.misconceptions.push(update.misconception);
    }
    // Demonstrating the concept unaided settles it — otherwise a misconception
    // recorded in chat could only ever be cleared by a graded question, and the
    // action engine would recommend the same contrast forever.
    if (update.mastery === "solid") state.misconceptions = [];

    learner.concepts[key] = state;
    touched.push(key);
  }

  if (parsed.profile_note) {
    learner.profile =
      learner.profile === "(nothing recorded yet)"
        ? parsed.profile_note
        : `${learner.profile}\n${parsed.profile_note}`;
  }

  saveLearner(learner);
  return { touched, dropped };
}

/**
 * This chapter's concept ids with the learner's current state — the list an
 * update_learner judgment must draw its concept_ids from.
 */
export function renderConceptIds(courseId: string, chapterId: string): string {
  const learner = loadLearner(courseId);
  const lines = [...conceptRegistry(courseId).values()]
    .filter((e) => e.chapter === chapterId)
    .map((e) => {
      const s = learner.concepts[e.key];
      const state = s ? `${s.mastery} (${s.confidence} confidence)` : "no evidence yet";
      return `- ${e.id} — ${e.name}: ${e.description} [${state}]`;
    });
  return lines.length ? lines.join("\n") : "(this chapter has no concepts — skip update_learner)";
}
