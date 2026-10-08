// Knowledge graph reader (memo §2.5). Built by `curio link`; see
// pipeline/src/curio_pipeline/graph.py.
import fs from "fs";
import path from "path";
import { courseDir } from "./content";

export type EdgeType =
  | "prerequisite_of"
  | "builds_on"
  | "contrasts_with"
  | "commonly_confused_with";

export interface Edge {
  source: string;
  target: string;
  type: EdgeType;
  confidence: "low" | "medium" | "high";
  evidence: string;
}

export interface Graph {
  course: string;
  generated_at: string;
  edges: Edge[];
}

/** `ch03:consumption-bundle` → `consumption-bundle` */
function conceptId(key: string): string {
  return key.slice(key.indexOf(":") + 1);
}

export function loadGraph(courseId: string): Graph | null {
  const p = path.join(courseDir(courseId), "graph.json");
  if (!fs.existsSync(p)) return null;
  try {
    const graph: Graph = JSON.parse(fs.readFileSync(p, "utf-8"));
    // Chapters each carry their own concept list, so a concept the book develops
    // across several chapters appears more than once. Edges between those copies
    // are an artifact of that duplication, not a real dependency.
    graph.edges = graph.edges.filter((e) => conceptId(e.source) !== conceptId(e.target));
    return graph;
  } catch {
    return null;
  }
}

/** Concepts that must be understood before `conceptKey`. */
export function prerequisitesOf(graph: Graph, conceptKey: string): Edge[] {
  return graph.edges.filter(
    (e) => e.target === conceptKey && (e.type === "prerequisite_of" || e.type === "builds_on")
  );
}

/** Concepts that depend on `conceptKey` — what breaks downstream if this is shaky. */
export function dependentsOf(graph: Graph, conceptKey: string): Edge[] {
  return graph.edges.filter(
    (e) => e.source === conceptKey && (e.type === "prerequisite_of" || e.type === "builds_on")
  );
}

/** Concepts the book sets against this one, or that learners routinely conflate with it. */
export function confusableWith(graph: Graph, conceptKey: string): Edge[] {
  return graph.edges.filter(
    (e) =>
      (e.type === "contrasts_with" || e.type === "commonly_confused_with") &&
      (e.source === conceptKey || e.target === conceptKey)
  );
}
