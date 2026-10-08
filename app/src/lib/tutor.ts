// Tutor context assembly. The tutor itself is Claude in the learner's Claude
// Code session; its persona and rules live in skills/study/references/tutor.md.
// This builds what that session reads before answering: the chapter, the
// learner model, the reading position, and the conversation so far.
import type { Chapter, Course } from "./content";
import { chapterToText } from "./content";
import { renderConceptIds, renderLearnerContext } from "./learner";
import type { Conversation } from "./store";

export function buildContext(
  course: Course,
  chapter: Chapter,
  opts: { sectionId?: string | null; conversation?: Conversation | null } = {}
): string {
  const parts = [
    `# The book\n${course.title} — ${course.author}`,
    `# Current chapter: Chapter ${chapter.number}, "${chapter.title}" (${chapter.id})\n` +
      chapterToText(chapter),
    renderLearnerContext(course.id, chapter.id),
    `# Concept ids for update_learner\n\n${renderConceptIds(course.id, chapter.id)}`,
  ];

  if (opts.sectionId) {
    const section = chapter.sections.find((s) => s.id === opts.sectionId);
    if (section) {
      parts.push(
        `# Reading position\nThe student is currently in ${
          section.number ? `§${section.number} ` : ""
        }${section.title}.`
      );
    }
  }

  const prior = opts.conversation?.messages ?? [];
  if (prior.length) {
    parts.push(
      `# This conversation so far\n\n` +
        prior.map((m) => `**${m.role === "user" ? "Student" : "Tutor"}:** ${m.content}`).join("\n\n")
    );
  }
  return parts.join("\n\n");
}
