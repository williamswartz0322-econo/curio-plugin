import fs from "fs";
import path from "path";
import { contentDir } from "@/lib/content";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path: segments } = await params;
  if (!segments || segments.some((s) => s.includes("..") || s.includes("/") || s.includes("\\"))) {
    return new Response("bad path", { status: 400 });
  }
  const filePath = path.join(contentDir(), "courses", ...segments);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return new Response("not found", { status: 404 });
  }
  const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()];
  if (!type) return new Response("unsupported type", { status: 415 });

  return new Response(new Uint8Array(fs.readFileSync(filePath)), {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600" },
  });
}
