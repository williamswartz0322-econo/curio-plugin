// Goals and the lesson plan (memo §2.7; roadmap phase G).
//
// The planner is STATELESS: today's plan is derived fresh from the goal, the
// chapters, the learner model, and the review queue every time it's asked.
// There is no stored plan to drift out of date — evidence arrives, the next
// derivation shifts. That IS the replanning.
import fs from "fs";
import path from "path";
import { courseDir, loadCourse } from "./content";
import { conceptRegistry, loadLearner } from "./learner";
import { interleave, reviewQueue } from "./schedule";

export interface Goal {
  targetDate: string; // ISO date
  hoursPerWeek: number;
  note?: string;
  createdAt: string;
}

export interface PlanItem {
  kind: "review" | "learn" | "stretch";
  label: string;
  why: string;
  href: string;
}

export interface TodayPlan {
  goal: Goal;
  daysLeft: number;
  conceptsRemaining: number;
  conceptsTotal: number;
  /** Concepts/day required to hit the date vs what the hours support. */
  paceNeeded: number;
  paceFeasible: number;
  status: "on_track" | "tight" | "behind" | "done" | "past_due";
  statusLine: string;
  items: PlanItem[];
}

const SAFE_ID = /^[a-zA-Z0-9-]+$/;
/** Working estimate: one new concept ≈ 20 minutes of reading + practice. */
const MINUTES_PER_CONCEPT = 20;
const MAX_REVIEWS_TODAY = 5;
const MAX_NEW_TODAY = 6;

function goalPath(courseId: string): string {
  return path.join(courseDir(courseId), "goal.json");
}

export function loadGoal(courseId: string): Goal | null {
  const p = goalPath(courseId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export function saveGoal(courseId: string, goal: Goal): void {
  if (!SAFE_ID.test(courseId)) throw new Error("invalid course id");
  fs.writeFileSync(goalPath(courseId), JSON.stringify(goal, null, 2));
}

export function clearGoal(courseId: string): void {
  if (!SAFE_ID.test(courseId)) throw new Error("invalid course id");
  fs.rmSync(goalPath(courseId), { force: true });
}

export function planToday(courseId: string): TodayPlan | null {
  const goal = loadGoal(courseId);
  const course = loadCourse(courseId);
  if (!goal || !course) return null;

  const registry = conceptRegistry(courseId);
  const learner = loadLearner(courseId);

  const total = registry.size;
  const known = [...registry.keys()].filter((key) => {
    const state = learner.concepts[key];
    return state && (state.mastery === "developing" || state.mastery === "solid");
  }).length;
  const remaining = total - known;

  const daysLeft = Math.ceil(
    (new Date(`${goal.targetDate}T23:59:59Z`).getTime() - Date.now()) / 86_400_000
  );

  const paceNeeded = daysLeft > 0 ? remaining / daysLeft : Infinity;
  const paceFeasible = (goal.hoursPerWeek * 60) / 7 / MINUTES_PER_CONCEPT;

  let status: TodayPlan["status"];
  let statusLine: string;
  if (remaining === 0) {
    status = "done";
    statusLine = "Every concept in the course is demonstrated. Reviews will keep them alive.";
  } else if (daysLeft <= 0) {
    status = "past_due";
    statusLine = `Target date has passed with ${remaining} concepts still to demonstrate — pick a new date.`;
  } else if (paceNeeded > paceFeasible * 1.15) {
    status = "behind";
    statusLine = `Needs ${paceNeeded.toFixed(1)} concepts/day; ${goal.hoursPerWeek}h/week supports ~${paceFeasible.toFixed(1)}. Add hours, extend the date, or accept triage.`;
  } else if (paceNeeded > paceFeasible * 0.85) {
    status = "tight";
    statusLine = `Needs ${paceNeeded.toFixed(1)} concepts/day against a feasible ~${paceFeasible.toFixed(1)} — doable, no slack.`;
  } else {
    status = "on_track";
    statusLine = `${remaining} concepts in ${daysLeft} days at ~${paceNeeded.toFixed(1)}/day — comfortably inside your ${goal.hoursPerWeek}h/week.`;
  }

  const items: PlanItem[] = [];

  // 1. Reviews first — retention debt compounds; new material can wait a day.
  const due = interleave(reviewQueue(courseId), MAX_REVIEWS_TODAY);
  if (due.length > 0) {
    items.push({
      kind: "review",
      label: `Review session — ${due.length} due (${due.map((d) => d.name).slice(0, 3).join(", ")}${due.length > 3 ? "…" : ""})`,
      why: "Reviews first: each one lands just as its interval expires, which is when retrieving does the most.",
      href: `/review/${courseId}`,
    });
  }

  // 2. New material at the pace the goal demands, in reading order.
  const newToday = Math.max(1, Math.min(MAX_NEW_TODAY, Math.ceil(paceNeeded)));
  const chapters = new Map(course.chapters.map((c) => [c.id, c]));
  let queued = 0;
  for (const entry of registry.values()) {
    if (queued >= newToday || remaining === 0) break;
    const state = learner.concepts[entry.key];
    if (state && (state.mastery === "developing" || state.mastery === "solid")) continue;
    const chapter = chapters.get(entry.chapter);
    const struggling = state && (state.mastery === "shaky" || state.misconceptions.length > 0);
    items.push({
      kind: "learn",
      label: struggling ? `Repair ${entry.name}` : `Learn ${entry.name}`,
      why: struggling
        ? `Marked ${state?.mastery} — the plan won't count it until it's demonstrated.`
        : `Next undemonstrated concept in reading order (Chapter ${chapter?.number ?? "?"}).`,
      href: `/read/${courseId}/${entry.chapter}`,
    });
    queued++;
  }

  return {
    goal,
    daysLeft,
    conceptsRemaining: remaining,
    conceptsTotal: total,
    paceNeeded: Number.isFinite(paceNeeded) ? Math.round(paceNeeded * 10) / 10 : -1,
    paceFeasible: Math.round(paceFeasible * 10) / 10,
    status,
    statusLine,
    items,
  };
}
