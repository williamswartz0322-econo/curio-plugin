import { rejectForeign } from "@/lib/bridge";
import { listConversations, loadConversation } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  // Conversations are the learner's own words; only the reader itself may read them.
  const forbidden = rejectForeign(req);
  if (forbidden) return forbidden;
  const url = new URL(req.url);
  const course = url.searchParams.get("course");
  const chapter = url.searchParams.get("chapter");
  const id = url.searchParams.get("id");

  if (!course) return Response.json({ error: "course required" }, { status: 400 });

  if (id) {
    const conv = loadConversation(course, id);
    if (!conv) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(conv);
  }

  if (!chapter) return Response.json({ error: "chapter required" }, { status: 400 });
  return Response.json(listConversations(course, chapter));
}
