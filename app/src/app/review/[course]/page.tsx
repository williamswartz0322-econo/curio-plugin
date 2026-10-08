import { notFound } from "next/navigation";
import { loadCourse } from "@/lib/content";
import ReviewSession from "@/components/ReviewSession";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ course: string }> }) {
  const { course: courseId } = await params;
  const course = loadCourse(courseId);
  if (!course) notFound();
  return <ReviewSession courseId={courseId} courseTitle={course.title} />;
}
