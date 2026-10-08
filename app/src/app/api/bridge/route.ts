import { bridgeStatus } from "@/lib/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(await bridgeStatus());
}
