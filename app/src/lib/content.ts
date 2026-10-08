// Filesystem content loading. Types mirror pipeline/src/curio_pipeline/schema.py — keep in sync.
import fs from "fs";
import os from "os";
import path from "path";

export type BlockType =
  | "paragraph"
  | "definition"
  | "principle"
  | "example"
  | "worked_example"
  | "equation"
  | "figure"
  | "table"
  | "exercise"
  | "aside";

export interface Block {
  id: string;
  type: BlockType;
  md: string;
  page: number;
  term: string | null;
  label: string | null;
  image: string | null;
}

export interface Section {
  id: string;
  number: string;
  title: string;
  blocks: Block[];
}

export interface Concept {
  id: string;
  name: string;
  description: string;
  section_ids: string[];
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  start_page: number;
  end_page: number;
  sections: Section[];
  concepts: Concept[];
}

export interface CourseChapterEntry {
  id: string;
  number: number;
  title: string;
  draft: boolean;
  ingested: string;
}

export interface Course {
  id: string;
  title: string;
  author: string;
  source_pdf: string;
  chapters: CourseChapterEntry[];
}

/** The learner's library: $CURIO_LIBRARY, else ~/Curio. Never inside the plugin. */
export function contentDir(): string {
  const raw = process.env.CURIO_LIBRARY || "~/Curio";
  return path.resolve(raw.replace(/^~(?=$|\/)/, os.homedir()));
}

export function courseDir(courseId: string): string {
  return path.join(contentDir(), "courses", courseId);
}

export function listCourses(): Course[] {
  const root = path.join(contentDir(), "courses");
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter((d) => fs.existsSync(path.join(root, d, "course.json")))
    .map((d) => JSON.parse(fs.readFileSync(path.join(root, d, "course.json"), "utf-8")));
}

export function loadCourse(courseId: string): Course | null {
  const p = path.join(courseDir(courseId), "course.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function loadChapter(courseId: string, chapterId: string): Chapter | null {
  const p = path.join(courseDir(courseId), "chapters", `${chapterId}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

/** Render a chapter to plain text for the tutor's context window. */
export function chapterToText(chapter: Chapter): string {
  const parts: string[] = [];
  for (const section of chapter.sections) {
    const heading = section.number ? `${section.number} ${section.title}` : section.title;
    parts.push(`\n## ${heading}\n`);
    for (const block of section.blocks) {
      if (block.type === "figure") {
        parts.push(`[${block.label ?? "Figure"}, p.${block.page}] ${block.md}`);
      } else if (block.type === "definition" && block.term) {
        parts.push(`[Definition: ${block.term}, p.${block.page}] ${block.md}`);
      } else if (block.type === "exercise") {
        parts.push(`[Review question ${block.label ?? ""}] ${block.md}`);
      } else {
        parts.push(`[p.${block.page}] ${block.md}`);
      }
    }
  }
  if (chapter.concepts.length > 0) {
    parts.push("\n## Key concepts (index)\n");
    for (const c of chapter.concepts) {
      parts.push(`- ${c.name}: ${c.description}`);
    }
  }
  return parts.join("\n");
}
