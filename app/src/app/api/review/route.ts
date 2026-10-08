import { interleave, reviewQueue } from "@/lib/schedule";

export const runtime = "nodejs";

const SESSION_SIZE = 5;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const course = url.searchParams.get("course");
  if (!course) return Response.json({ error: "course required" }, { status: 400 });

  const due = reviewQueue(course);
  return Response.json({
    dueCount: due.length,
    due,
    session: interleave(due, SESSION_SIZE),
  });
}
