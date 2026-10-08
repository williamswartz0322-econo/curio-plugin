import { callBridge, rejectForeign } from "@/lib/bridge";
import { loadChapter, loadCourse } from "@/lib/content";
import type { Anchor } from "@/lib/store";

export const runtime = "nodejs";

interface TutorRequest {
  course: string;
  chapter: string;
  conversationId: string;
  title: string;
  anchor: Anchor | null;
  question: string;
}

/** Forward one learner question to Claude in the learner's Claude Code session. */
export async function POST(req: Request): Promise<Response> {
  const forbidden = rejectForeign(req);
  if (forbidden) return forbidden;
  const body = (await req.json()) as TutorRequest;
  if (!loadCourse(body.course) || !loadChapter(body.course, body.chapter) || !body.question?.trim()) {
    return Response.json({ error: "unknown course/chapter or empty question" }, { status: 400 });
  }
  return callBridge("/ask", body);
}
