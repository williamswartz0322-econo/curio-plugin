// The knowledge web (roadmap phase L): everything the learner has EARNED,
// across every course. A concept enters when demonstrated, not when published —
// the course map shows the curriculum; the web shows the person.
import fs from "fs";
import path from "path";
import { contentDir, listCourses } from "./content";
import { loadGraph } from "./graph";
import { loadLearner, type Mastery } from "./learner";

export interface WebNode {
  /** `course/chapter:concept` */
  id: string;
  name: string;
  course: string;
  courseTitle: string;
  chapter: string;
  mastery: Mastery;
  /** Demonstrated (developing/solid) nodes are full members; others are faint. */
  earned: boolean;
}

export interface WebEdge {
  source: string;
  target: string;
  kind: "course" | "bridge";
  type: string;
  evidence: string;
}

export interface KnowledgeWeb {
  nodes: WebNode[];
  edges: WebEdge[];
  earnedCount: number;
  encounteredCount: number;
  courses: { id: string; title: string }[];
}

interface StoredWeave {
  generated_at: string;
  edges: { source: string; target: string; type: string; confidence: string; evidence: string }[];
}

function loadWeave(): StoredWeave | null {
  const p = path.join(contentDir(), "web.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export function buildKnowledgeWeb(): KnowledgeWeb {
  const courses = listCourses();
  const nodes = new Map<string, WebNode>();

  // Nodes: every concept with evidence, from every course's learner model.
  for (const course of courses) {
    const learner = loadLearner(course.id);
    for (const [key, state] of Object.entries(learner.concepts)) {
      const id = `${course.id}/${key}`;
      nodes.set(id, {
        id,
        name: state.name,
        course: course.id,
        courseTitle: course.title,
        chapter: state.chapter,
        mastery: state.mastery,
        earned: state.mastery === "developing" || state.mastery === "solid",
      });
    }
  }

  const edges: WebEdge[] = [];

  // Within-course structure, restricted to encountered concepts.
  for (const course of courses) {
    const graph = loadGraph(course.id);
    if (!graph) continue;
    for (const edge of graph.edges) {
      const source = `${course.id}/${edge.source}`;
      const target = `${course.id}/${edge.target}`;
      if (!nodes.has(source) || !nodes.has(target)) continue;
      edges.push({ source, target, kind: "course", type: edge.type, evidence: edge.evidence });
    }
  }

  // Cross-course bridges from the weave.
  const weave = loadWeave();
  for (const edge of weave?.edges ?? []) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    edges.push({
      source: edge.source,
      target: edge.target,
      kind: "bridge",
      type: edge.type,
      evidence: edge.evidence,
    });
  }

  const all = [...nodes.values()];
  return {
    nodes: all,
    edges,
    earnedCount: all.filter((n) => n.earned).length,
    encounteredCount: all.length,
    courses: courses.map((c) => ({ id: c.id, title: c.title })),
  };
}
