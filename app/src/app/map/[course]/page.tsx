import { notFound } from "next/navigation";
import CourseMapView from "@/components/CourseMap";
import { buildCourseMap } from "@/lib/map";

export const dynamic = "force-dynamic";

export default async function MapPage({ params }: { params: Promise<{ course: string }> }) {
  const { course } = await params;
  const map = buildCourseMap(course);
  if (!map) notFound();
  return <CourseMapView map={map} />;
}
