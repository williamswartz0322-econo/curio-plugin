// The learner-state kernel the Claude Code bridge writes through.
import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { loadItems, proposeItem, recordGrade, settleDraft, type PendingDraft } from "./assessment";
import { loadChapter } from "./content";
import { writeJsonAtomic } from "./fsutil";
import { applyLearnerUpdate, loadLearner } from "./learner";

let library: string;

function writeCourse() {
  const course = path.join(library, "courses", "c");
  fs.mkdirSync(path.join(course, "chapters"), { recursive: true });
  fs.writeFileSync(
    path.join(course, "course.json"),
    JSON.stringify({
      id: "c",
      title: "Course",
      author: "A",
      source_pdf: "b.pdf",
      chapters: [{ id: "ch01", number: 1, title: "One", draft: false, ingested: "2026-01-01" }],
    })
  );
  fs.writeFileSync(
    path.join(course, "chapters", "ch01.json"),
    JSON.stringify({
      id: "ch01",
      number: 1,
      title: "One",
      start_page: 1,
      end_page: 2,
      sections: [
        {
          id: "ch01-s01",
          number: "1.1",
          title: "Means",
          blocks: [
            { id: "ch01-s01-b001", type: "paragraph", md: "The mean is $E(y)$.", page: 1, term: null, label: null, image: null },
          ],
        },
      ],
      concepts: [{ id: "mean", name: "Mean", description: "The average.", section_ids: ["ch01-s01"] }],
    })
  );
}

beforeEach(() => {
  library = fs.mkdtempSync(path.join(os.tmpdir(), "curio-kernel-"));
  process.env.CURIO_LIBRARY = library;
  writeCourse();
});

const draft = {
  course: "c",
  chapter: "ch01",
  conceptKey: "ch01:mean",
  kind: "recall" as const,
  question: "What is the mean?",
  expected: "E(y).",
  commonErrors: [{ wrong: "the median", reveals: "confusing centre measures" }],
  sourceBlockIds: ["ch01-s01-b001"],
};

describe("learner updates", () => {
  it("folds known concepts, drops invented ones, and clears misconceptions once solid", () => {
    const first = applyLearnerUpdate("c", "ch01", {
      concept_updates: [
        { concept_id: "mean", mastery: "shaky", confidence: "medium", evidence: "said median", misconception: "mean is the median" },
        { concept_id: "invented", mastery: "solid", confidence: "high", evidence: "x", misconception: null },
      ],
      profile_note: "studies economics",
    });
    expect(first).toEqual({ touched: ["ch01:mean"], dropped: ["invented"] });
    expect(loadLearner("c").concepts["ch01:mean"].misconceptions).toEqual(["mean is the median"]);
    expect(loadLearner("c").profile).toBe("studies economics");

    applyLearnerUpdate("c", "ch01", {
      concept_updates: [{ concept_id: "mean", mastery: "solid", confidence: "high", evidence: "explained it", misconception: null }],
      profile_note: null,
    });
    const state = loadLearner("c").concepts["ch01:mean"];
    expect(state.mastery).toBe("solid");
    expect(state.misconceptions).toEqual([]);
    expect(state.exposures).toBe(2);
  });
});

/** Stand in for the item-validator agent: write its verdict beside the draft. */
function validate(pending: PendingDraft, approved: boolean, note: string) {
  fs.writeFileSync(pending.verdictFile, JSON.stringify({ approved, note }));
}

describe("practice items", () => {
  it("serves only drafts the validator approved, and discards rejected ones", () => {
    const rejected = proposeItem(draft);
    const file = fs.readFileSync(rejected.validationFile, "utf-8");
    expect(file).toContain(`Write your verdict to: ${rejected.verdictFile}`);
    expect(file).toContain("[ch01-s01-b001] The mean is $E(y)$.");
    validate(rejected, false, "ambiguous");
    expect(settleDraft("c", rejected.id)).toEqual({ item: null, note: "ambiguous" });
    expect(fs.existsSync(rejected.validationFile)).toBe(false);
    expect(loadItems("c")).toEqual({});

    const approved = proposeItem(draft);
    validate(approved, true, "supported");
    const { item } = settleDraft("c", approved.id);
    expect(item?.validated).toBe(true);
    expect(item?.validationNote).toBe("supported");
    expect(loadItems("c")[approved.id].question).toBe(draft.question);
    expect(() => settleDraft("c", approved.id)).toThrow();
  });

  it("refuses to settle a draft the validator never judged", () => {
    const pending = proposeItem(draft);
    expect(() => settleDraft("c", pending.id)).toThrow(/no verdict/);
    expect(loadItems("c")).toEqual({});
  });

  it("refuses citations of blocks outside the concept's passages", () => {
    expect(() => proposeItem({ ...draft, sourceBlockIds: ["ch09-s01-b001"] })).toThrow(/unknown source block/);
    expect(() => proposeItem({ ...draft, conceptKey: "ch01:nope" })).toThrow(/unknown concept/);
  });

  it("records grades as evidence with streaks and an outcome log", () => {
    const pending = proposeItem(draft);
    validate(pending, true, "ok");
    const item = settleDraft("c", pending.id).item!;
    recordGrade(item, { verdict: "correct", feedback: "Right.", misconception: null, mastery: "solid" });
    recordGrade(item, { verdict: "correct", feedback: "Right.", misconception: null, mastery: "solid" });
    expect(loadLearner("c").concepts["ch01:mean"].streak).toBe(2);
    recordGrade(item, { verdict: "incorrect", feedback: "No.", misconception: "x", mastery: "shaky" });
    const state = loadLearner("c").concepts["ch01:mean"];
    expect(state.streak).toBe(0);
    expect(state.misconceptions).toEqual(["x"]);
    const log = fs.readFileSync(path.join(library, "courses", "c", "outcomes.jsonl"), "utf-8").trim().split("\n");
    expect(log).toHaveLength(3);
  });
});

it("refuses ids that could walk out of the library", () => {
  expect(loadChapter("c", "ch01")).not.toBeNull();
  expect(loadChapter("c", "../../c/chapters/ch01")).toBeNull();
  expect(loadChapter("..", "ch01")).toBeNull();
});

it("writes JSON atomically without leaving temp files", () => {
  const file = path.join(library, "x", "state.json");
  writeJsonAtomic(file, { a: 1 });
  writeJsonAtomic(file, { a: 2 });
  expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual({ a: 2 });
  expect(fs.readdirSync(path.dirname(file))).toEqual(["state.json"]);
});
