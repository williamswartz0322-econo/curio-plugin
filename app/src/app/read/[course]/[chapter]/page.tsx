import { notFound } from "next/navigation";
import { loadChapter, loadCourse } from "@/lib/content";
import ReaderShell from "@/components/ReaderShell";

export const dynamic = "force-dynamic";

export default async function ReadPage({
  params,
}: {
  params: Promise<{ course: string; chapter: string }>;
}) {
  const { course: courseId, chapter: chapterId } = await params;
  const course = loadCourse(courseId);
  const chapter = loadChapter(courseId, chapterId);
  if (!course || !chapter) notFound();

  return <ReaderShell course={course} chapter={chapter} />;
}
