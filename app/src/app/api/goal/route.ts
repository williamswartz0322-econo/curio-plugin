import { rejectForeign } from "@/lib/bridge";
import { clearGoal, loadGoal, planToday, saveGoal } from "@/lib/plan";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const course = url.searchParams.get("course");
  if (!course) return Response.json({ error: "course required" }, { status: 400 });
  return Response.json({ goal: loadGoal(course), plan: planToday(course) });
}

export async function POST(req: Request): Promise<Response> {
  const forbidden = rejectForeign(req);
  if (forbidden) return forbidden;
  const body = (await req.json()) as {
    course: string;
    targetDate?: string;
    hoursPerWeek?: number;
    clear?: boolean;
  };
  if (!body.course) return Response.json({ error: "course required" }, { status: 400 });

  if (body.clear) {
    clearGoal(body.course);
    return Response.json({ goal: null, plan: null });
  }

  if (!body.targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.targetDate)) {
    return Response.json({ error: "targetDate (YYYY-MM-DD) required" }, { status: 400 });
  }
  const hours = Number(body.hoursPerWeek);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 80) {
    return Response.json({ error: "hoursPerWeek must be between 0 and 80" }, { status: 400 });
  }

  saveGoal(body.course, {
    targetDate: body.targetDate,
    hoursPerWeek: hours,
    createdAt: new Date().toISOString(),
  });
  return Response.json({ goal: loadGoal(body.course), plan: planToday(body.course) });
}
