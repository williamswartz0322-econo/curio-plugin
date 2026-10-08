// Shapes and layout constants for the course map. Kept free of node builtins so
// the client renderer can import them without dragging `fs` into the bundle.
import type { EdgeType } from "./graph";
import type { Mastery } from "./learner";

export type NodeStanding = Mastery | "unseen";

export interface TeachingSite {
  chapter: string;
  chapterNumber: number;
  chapterTitle: string;
  sectionId: string | null;
}

export interface MapNode {
  /** Concept slug, merged across chapters. */
  id: string;
  name: string;
  description: string;
  /** Learner-model keys (`chapter:concept`) that feed this node. */
  keys: string[];
  sites: TeachingSite[];
  standing: NodeStanding;
  misconceptions: string[];
  exposures: number;
  /** All prerequisites solid but not yet learned — the natural next thing to study. */
  ready: boolean;
  x: number;
  y: number;
}

export interface MapEdge {
  source: string;
  target: string;
  type: EdgeType;
  confidence: "low" | "medium" | "high";
  evidence: string;
}

export interface ChapterColumn {
  id: string;
  number: number;
  title: string;
  x: number;
}

export interface CourseMap {
  course: string;
  courseTitle: string;
  nodes: MapNode[];
  edges: MapEdge[];
  columns: ChapterColumn[];
  width: number;
  height: number;
}

export const NODE_W = 186;
export const NODE_H = 34;
export const COL_GAP = 300;
export const ROW_GAP = 50;
export const PAD_X = 40;
export const PAD_Y = 76;
