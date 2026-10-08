// Course map model (memo §1.1, §2.5, §2.11).
//
// Assembles the knowledge graph, the learner model, and chapter structure into
// a laid-out graph the reader can see and work through. A textbook is inherently
// sequential, so the layout is a chapter-ordered DAG — columns are chapters,
// rows are reading order — rather than a force-directed hairball.
import { loadChapter, loadCourse } from "./content";
import { loadGraph } from "./graph";
import { loadLearner } from "./learner";
import {
  COL_GAP,
  NODE_W,
  PAD_X,
  PAD_Y,
  ROW_GAP,
  type ChapterColumn,
  type CourseMap,
  type MapEdge,
  type MapNode,
  type NodeStanding,
  type TeachingSite,
} from "./map-types";

export * from "./map-types";

const STRENGTH: Record<NodeStanding, number> = {
  unseen: 0,
  exposed: 1,
  shaky: 2,
  developing: 3,
  solid: 4,
};

function conceptSlug(key: string): string {
  return key.slice(key.indexOf(":") + 1);
}

export function buildCourseMap(courseId: string): CourseMap | null {
  const course = loadCourse(courseId);
  if (!course) return null;

  const graph = loadGraph(courseId);
  const learner = loadLearner(courseId);

  // Collect concepts, merging the copies a multi-chapter concept produces.
  // Extraction runs per chapter, so "consumption bundle" exists once per chapter
  // that develops it; on a map those should be one node with several homes.
  const merged = new Map<string, MapNode>();
  const readingOrder = new Map<string, number>();
  let sequence = 0;

  for (const entry of [...course.chapters].sort((a, b) => a.number - b.number)) {
    const chapter = loadChapter(courseId, entry.id);
    if (!chapter) continue;
    const sectionPos = new Map(chapter.sections.map((s, i) => [s.id, i]));

    const concepts = [...chapter.concepts]
      .filter((c) => c.id !== "draft-placeholder")
      .sort((a, b) => {
        const pos = (ids: string[]) => {
          const found = ids.map((id) => sectionPos.get(id)).filter((i) => i !== undefined);
          return found.length ? Math.min(...(found as number[])) : Number.MAX_SAFE_INTEGER;
        };
        return pos(a.section_ids) - pos(b.section_ids);
      });

    for (const concept of concepts) {
      const key = `${chapter.id}:${concept.id}`;
      const state = learner.concepts[key];
      const site: TeachingSite = {
        chapter: chapter.id,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        sectionId: concept.section_ids[0] ?? null,
      };

      const existing = merged.get(concept.id);
      if (existing) {
        existing.keys.push(key);
        existing.sites.push(site);
        existing.exposures += state?.exposures ?? 0;
        if (state) {
          existing.misconceptions.push(...state.misconceptions);
          // Several chapters can carry evidence; the strongest reading wins.
          if (STRENGTH[state.mastery] > STRENGTH[existing.standing]) {
            existing.standing = state.mastery;
          }
        }
        continue;
      }

      merged.set(concept.id, {
        id: concept.id,
        name: concept.name,
        description: concept.description,
        keys: [key],
        sites: [site],
        standing: state?.mastery ?? "unseen",
        misconceptions: [...(state?.misconceptions ?? [])],
        exposures: state?.exposures ?? 0,
        ready: false,
        x: 0,
        y: 0,
      });
      readingOrder.set(concept.id, sequence++);
    }
  }

  // Edges, remapped onto merged node ids.
  const nodeIds = new Set(merged.keys());
  const edges: MapEdge[] = [];
  const seen = new Set<string>();
  for (const edge of graph?.edges ?? []) {
    const source = conceptSlug(edge.source);
    const target = conceptSlug(edge.target);
    if (source === target || !nodeIds.has(source) || !nodeIds.has(target)) continue;
    const signature = `${source}|${target}|${edge.type}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    edges.push({ source, target, type: edge.type, confidence: edge.confidence, evidence: edge.evidence });
  }

  // The frontier: concepts you've *earned* — not yet met, but everything they
  // rest on is solid. Root concepts with no prerequisites are excluded; they're
  // starting points rather than unlocks, and badging them all drowns the signal.
  const prereqs = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.type !== "prerequisite_of") continue;
    prereqs.set(edge.target, [...(prereqs.get(edge.target) ?? []), edge.source]);
  }
  for (const node of merged.values()) {
    if (node.standing !== "unseen") continue;
    const required = prereqs.get(node.id) ?? [];
    node.ready =
      required.length > 0 && required.every((id) => merged.get(id)?.standing === "solid");
  }

  // Layout: one column per chapter, rows follow reading order within it.
  const columns: ChapterColumn[] = [];
  const rowCursor = new Map<string, number>();
  let maxRow = 0;

  const chapterIndex = new Map(
    [...course.chapters].sort((a, b) => a.number - b.number).map((c, i) => [c.id, i])
  );
  for (const entry of [...course.chapters].sort((a, b) => a.number - b.number)) {
    columns.push({
      id: entry.id,
      number: entry.number,
      title: entry.title,
      x: PAD_X + (chapterIndex.get(entry.id) ?? 0) * COL_GAP,
    });
  }

  for (const node of [...merged.values()].sort(
    (a, b) => (readingOrder.get(a.id) ?? 0) - (readingOrder.get(b.id) ?? 0)
  )) {
    // A merged concept lives in the first chapter that teaches it.
    const home = node.sites[0].chapter;
    const row = rowCursor.get(home) ?? 0;
    rowCursor.set(home, row + 1);
    maxRow = Math.max(maxRow, row);
    node.x = PAD_X + (chapterIndex.get(home) ?? 0) * COL_GAP;
    node.y = PAD_Y + row * ROW_GAP;
  }

  return {
    course: courseId,
    courseTitle: course.title,
    nodes: [...merged.values()],
    edges,
    columns,
    width: PAD_X * 2 + (columns.length - 1) * COL_GAP + NODE_W,
    height: PAD_Y + (maxRow + 1) * ROW_GAP + 40,
  };
}
