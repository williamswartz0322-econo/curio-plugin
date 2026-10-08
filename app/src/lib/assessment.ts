// Assessment engine (memo §2.14). Claude, in the learner's session, writes
// concept-targeted diagnostic items grounded in the book, an independent
// validator checks each one (§2.19) before it is served, and Claude grades
// free-text answers. This module holds the state those steps read and write:
// drafts awaiting validation, served items, and graded evidence.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { courseDir, loadChapter, type Chapter } from "./content";
import { readJson, writeJsonAtomic } from "./fsutil";
import {
  conceptKey,
  conceptRegistry,
  loadLearner,
  saveLearner,
  type ConceptState,
  type Mastery,
} from "./learner";

/** §2.14 assessment types, trimmed to the ones that work as free-text prompts. */
export type ItemKind = "recall" | "explanation" | "application" | "prediction" | "error_diagnosis";

export interface CommonError {
  wrong: string;
  reveals: string;
}

export interface PracticeItem {
  id: string;
  course: string;
  chapter: string;
  conceptKey: string;
  conceptName: string;
  kind: ItemKind;
  question: string;
  expected: string;
  commonErrors: CommonError[];
  sourceBlockIds: string[];
  validated: boolean;
  validationNote: string;
  createdAt: string;
}

export type Verdict = "correct" | "partial" | "incorrect";

export interface Grade {
  verdict: Verdict;
  feedback: string;
  misconception: string | null;
  mastery: Mastery;
}

const SAFE_ID = /^[a-zA-Z0-9-]+$/;

function itemsPath(courseId: string): string {
  return path.join(courseDir(courseId), "practice.json");
}

export function loadItems(courseId: string): Record<string, PracticeItem> {
  return readJson(itemsPath(courseId), {});
}

export function saveItem(item: PracticeItem): void {
  if (!SAFE_ID.test(item.course)) throw new Error("invalid course id");
  const items = loadItems(item.course);
  items[item.id] = item;
  writeJsonAtomic(itemsPath(item.course), items);
}

/** Blocks that teach a concept, used as the grounding excerpt. */
export function conceptSource(chapter: Chapter, conceptId: string): { text: string; blockIds: string[] } {
  const concept = chapter.concepts.find((c) => c.id === conceptId);
  const sectionIds = new Set(concept?.section_ids ?? []);
  const lines: string[] = [];
  const blockIds: string[] = [];

  for (const section of chapter.sections) {
    if (sectionIds.size > 0 && !sectionIds.has(section.id)) continue;
    const heading = section.number ? `§${section.number} ${section.title}` : section.title;
    lines.push(`\n## ${heading}`);
    for (const block of section.blocks) {
      if (block.type === "figure") continue;
      lines.push(`[${block.id}] ${block.md}`);
      blockIds.push(block.id);
    }
  }
  // Fall back to the whole chapter if the concept carried no section pointers.
  if (blockIds.length === 0) {
    for (const section of chapter.sections) {
      for (const block of section.blocks) {
        if (block.type === "figure") continue;
        lines.push(`[${block.id}] ${block.md}`);
        blockIds.push(block.id);
      }
    }
  }
  return { text: lines.join("\n"), blockIds };
}

export interface ItemDraft {
  course: string;
  chapter: string;
  conceptKey: string;
  kind: ItemKind;
  question: string;
  expected: string;
  commonErrors: CommonError[];
  sourceBlockIds: string[];
}

export interface PendingDraft extends ItemDraft {
  id: string;
  conceptName: string;
  validationFile: string;
  createdAt: string;
}

function draftsDir(courseId: string): string {
  return path.join(courseDir(courseId), "work", "validate");
}

/**
 * Record a generated item and write the file the independent validator reads:
 * the question, the intended answer, and exactly the passages the concept is
 * taught in — the same grounding the generator saw.
 */
export function proposeItem(draft: ItemDraft): PendingDraft {
  if (!SAFE_ID.test(draft.course)) throw new Error("invalid course id");
  const chapter = loadChapter(draft.course, draft.chapter);
  const entry = conceptRegistry(draft.course).get(draft.conceptKey);
  if (!chapter || !entry) throw new Error(`unknown concept ${draft.conceptKey}`);
  if (!draft.question.trim() || !draft.expected.trim()) {
    throw new Error("question and expected answer are required");
  }

  const { text: source, blockIds } = conceptSource(chapter, entry.id);
  const known = new Set(blockIds);
  const unknown = draft.sourceBlockIds.filter((b) => !known.has(b));
  if (unknown.length) throw new Error(`unknown source block ids: ${unknown.join(", ")}`);

  const id = crypto.randomUUID();
  const dir = draftsDir(draft.course);
  const validationFile = path.join(dir, `${id}.md`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    validationFile,
    `<question>${draft.question}</question>\n\n` +
      `<intended_answer>${draft.expected}</intended_answer>\n\n` +
      `<passages>\n${source}\n</passages>\n`
  );
  const pending: PendingDraft = {
    ...draft,
    id,
    conceptName: entry.name,
    validationFile,
    createdAt: new Date().toISOString(),
  };
  writeJsonAtomic(path.join(dir, `${id}.json`), pending);
  return pending;
}

/**
 * Serve a draft only on the validator's approval (§2.19). A rejected draft is
 * discarded; the caller tries another concept rather than serving it.
 */
export function settleDraft(
  courseId: string,
  draftId: string,
  verdict: { approved: boolean; note: string }
): PracticeItem | null {
  if (!SAFE_ID.test(courseId) || !SAFE_ID.test(draftId)) throw new Error("invalid id");
  const dir = draftsDir(courseId);
  const pending = readJson<PendingDraft | null>(path.join(dir, `${draftId}.json`), null);
  if (!pending) throw new Error(`no pending draft ${draftId}`);
  fs.rmSync(path.join(dir, `${draftId}.json`), { force: true });
  fs.rmSync(pending.validationFile, { force: true });
  if (!verdict.approved) return null;

  const item: PracticeItem = {
    id: pending.id,
    course: pending.course,
    chapter: pending.chapter,
    conceptKey: pending.conceptKey,
    conceptName: pending.conceptName,
    kind: pending.kind,
    question: pending.question,
    expected: pending.expected,
    commonErrors: pending.commonErrors,
    sourceBlockIds: pending.sourceBlockIds,
    validated: true,
    validationNote: verdict.note,
    createdAt: new Date().toISOString(),
  };
  saveItem(item);
  return item;
}

/** Fold a grade into the learner model as observed evidence and return it. */
export function recordGrade(item: PracticeItem, grade: Grade): Grade {
  applyGrade(item, grade);
  return grade;
}

/**
 * Append one line to the course's delayed-retrieval log — the dataset behind
 * H1's exit test (MISSION.md): do practised concepts survive a delay better?
 */
function logOutcome(item: PracticeItem, grade: Grade, before?: ConceptState): void {
  const line = JSON.stringify({
    date: new Date().toISOString(),
    conceptKey: item.conceptKey,
    kind: item.kind,
    verdict: grade.verdict,
    masteryBefore: before?.mastery ?? "unseen",
    masteryAfter: grade.mastery,
    streakBefore: before?.streak ?? 0,
    daysSinceLastSeen: before
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(`${before.lastSeen}T00:00:00Z`).getTime()) / 86_400_000
          )
        )
      : null,
  });
  fs.appendFileSync(path.join(courseDir(item.course), "outcomes.jsonl"), line + "\n");
}

/** Observed mastery — the only path to `developing` or `solid` (§2.8). */
function applyGrade(item: PracticeItem, grade: Grade): void {
  const learner = loadLearner(item.course);
  const registry = conceptRegistry(item.course);
  const entry = registry.get(item.conceptKey);
  if (!entry) return;

  const date = new Date().toISOString().slice(0, 10);
  const key = conceptKey(item.chapter, entry.id);
  const existing = learner.concepts[key];
  logOutcome(item, grade, existing);
  const state = existing ?? {
    id: entry.id,
    name: entry.name,
    chapter: entry.chapter,
    mastery: grade.mastery,
    confidence: "high" as const,
    exposures: 0,
    evidence: [],
    misconceptions: [],
    lastSeen: date,
  };

  state.mastery = grade.mastery;
  // A graded answer is direct evidence, so confidence is high regardless of verdict.
  state.confidence = "high";
  state.exposures += 1;
  state.lastSeen = date;
  // Expanding-interval bookkeeping (§2.17): success extends the gap, failure resets it.
  if (grade.verdict === "correct") state.streak = (state.streak ?? 0) + 1;
  else if (grade.verdict === "incorrect") state.streak = 0;
  const kindLabel = item.kind.replace("_", " ");
  state.evidence = [
    ...state.evidence,
    { date, note: `${grade.verdict} on a ${kindLabel} question`, chapter: item.chapter },
  ].slice(-6);
  if (grade.misconception && !state.misconceptions.includes(grade.misconception)) {
    state.misconceptions.push(grade.misconception);
  }
  // Clear recorded misconceptions once the concept is demonstrably solid.
  if (grade.mastery === "solid") state.misconceptions = [];

  learner.concepts[key] = state;
  saveLearner(learner);
}

/** Concepts worth practising, weakest first (a stand-in until §2.9 lands). */
export function practiceCandidates(courseId: string, chapterId: string): string[] {
  const registry = conceptRegistry(courseId);
  const learner = loadLearner(courseId);
  const rank: Record<Mastery | "unseen", number> = {
    shaky: 0,
    exposed: 1,
    developing: 2,
    unseen: 3,
    solid: 4,
  };
  return [...registry.values()]
    .filter((e) => e.chapter === chapterId)
    .map((e) => ({ key: e.key, m: learner.concepts[e.key]?.mastery ?? ("unseen" as const) }))
    .sort((a, b) => rank[a.m] - rank[b.m])
    .map((c) => c.key);
}
