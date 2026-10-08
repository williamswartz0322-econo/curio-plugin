import { callBridge, rejectForeign } from "@/lib/bridge";

export const runtime = "nodejs";

interface GenerateBody {
  action: "generate";
  course: string;
  chapter: string;
  concept?: string;
  kind?: string;
  emphasis?: string;
}

interface GradeBody {
  action: "grade";
  course: string;
  itemId: string;
  answer: string;
}

/**
 * Practice runs in the learner's Claude Code session: Claude writes an item,
 * an independent validator checks it (§2.19), and Claude grades answers. The
 * bridge returns only the public item — never `expected` or `commonErrors`,
 * which would hand over the answer key.
 */
export async function POST(req: Request): Promise<Response> {
  const forbidden = rejectForeign(req);
  if (forbidden) return forbidden;
  const body = (await req.json()) as GenerateBody | GradeBody;

  if (body.action === "generate") return callBridge("/practice", body);
  if (body.action === "grade") {
    if (!body.answer?.trim()) return Response.json({ error: "answer required" }, { status: 400 });
    return callBridge("/grade", body);
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
