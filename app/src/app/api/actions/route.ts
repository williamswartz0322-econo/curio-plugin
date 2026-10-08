import { nextActions } from "@/lib/actions";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const course = url.searchParams.get("course");
  const chapter = url.searchParams.get("chapter");
  if (!course || !chapter) {
    return Response.json({ error: "course and chapter required" }, { status: 400 });
  }
  return Response.json(nextActions(course, chapter));
}
