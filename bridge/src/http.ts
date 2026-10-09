// The bridge's loopback HTTP side: the reader (a separate Next.js process)
// posts the learner's requests here, and each one becomes a channel event
// that waits for Claude's answer. Only the reader holds the token.
import http from "http";
import type { AddressInfo } from "net";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { loadItems } from "../../app/src/lib/assessment";
import { loadChapter, loadCourse } from "../../app/src/lib/content";
import { conceptRegistry } from "../../app/src/lib/learner";
import { loadConversation, type Anchor } from "../../app/src/lib/store";
import { LAUNCH_COMMAND, pushEvent } from "./channel";
import type { Outcome, RequestBook } from "./requests";

const ASK_TIMEOUT_MS = 5 * 60_000;
const PRACTICE_TIMEOUT_MS = 8 * 60_000;
const GRADE_TIMEOUT_MS = 5 * 60_000;
const SAFE_ID = /^[a-zA-Z0-9-]+$/;
const MAX_BODY_BYTES = 256 * 1024;

export interface BridgeHttp {
  url: string;
  close: () => void;
}

export function notConnectedDetail(): string {
  return (
    "Claude Code isn't answering this reader. Ask and Practice need a Claude Code session " +
    `started with the curio channel: run \`${LAUNCH_COMMAND}\`, then /curio:study. ` +
    "Reading, the map, and review scheduling work without it, and /curio:practice works " +
    "in any session's terminal."
  );
}

function bad(status: number, error: string): Outcome {
  return { status, body: { error } };
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("request too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");
}

export function startHttp(mcp: Server, book: RequestBook, token: string): Promise<BridgeHttp> {
  const routes: Record<string, (body: any) => Promise<Outcome>> = {
    "/ask": (b) => ask(mcp, book, b),
    "/practice": (b) => practice(mcp, book, b),
    "/grade": (b) => grade(mcp, book, b),
  };

  const server = http.createServer(async (req, res) => {
    const send = (o: Outcome) => {
      res.writeHead(o.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(o.body));
    };
    if (req.headers["x-curio-token"] !== token) return send(bad(403, "forbidden"));
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;

    if (req.method === "GET" && path === "/status") {
      return send({
        status: 200,
        body: book.connected
          ? { connected: true, detail: "Connected to Claude Code." }
          : {
              connected: false,
              detail: book.silent(20_000)
                ? notConnectedDetail()
                : "Checking the connection to Claude Code…",
            },
      });
    }
    const route = routes[path];
    if (req.method !== "POST" || !route) return send(bad(404, "not found"));

    // Fail fast when the session has never answered: waiting minutes for an
    // event Claude Code dropped helps nobody.
    if (book.silent()) return send(bad(503, notConnectedDetail()));
    try {
      send(await route(await readBody(req)));
    } catch (err) {
      send(bad(400, err instanceof Error ? err.message : "bad request"));
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

interface AskBody {
  course: string;
  chapter: string;
  conversationId: string;
  title: string;
  anchor: Anchor | null;
  question: string;
}

async function ask(mcp: Server, book: RequestBook, b: AskBody): Promise<Outcome> {
  if (!SAFE_ID.test(b.course ?? "") || !SAFE_ID.test(b.conversationId ?? "")) {
    return bad(400, "invalid course or conversation id");
  }
  const chapter = loadChapter(b.course, b.chapter);
  if (!loadCourse(b.course) || !chapter) return bad(404, "unknown course or chapter");
  if (!b.question?.trim()) return bad(400, "empty question");

  // The question is saved together with its answer (in the reply tool), so a
  // request that times out leaves no dangling message to duplicate on retry.
  const earlier = loadConversation(b.course, b.conversationId)?.messages.length ?? 0;

  const section = b.anchor?.sectionId
    ? chapter.sections.find((s) => s.id === b.anchor?.sectionId)
    : null;
  const { id, done } = book.open("ask", ASK_TIMEOUT_MS, {
    course: b.course,
    chapter: b.chapter,
    conversationId: b.conversationId,
    ask: { title: (b.title || b.question).slice(0, 80), anchor: b.anchor, question: b.question },
  });
  await pushEvent(
    mcp,
    "ask",
    id,
    `The learner asked a question in the Curio reader.\n` +
      `Course ${b.course}, chapter ${b.chapter} (Chapter ${chapter.number}: ${chapter.title}). ` +
      `Conversation ${b.conversationId}` +
      (earlier ? ` — continues ${earlier} earlier message(s).` : " — a new thread.") +
      (section
        ? `\nReading position: ${section.number ? `§${section.number} ` : ""}${section.title} (${section.id}).`
        : "") +
      `\n\n<learner_question>\n${b.question}\n</learner_question>`,
    {
      course: b.course,
      chapter: b.chapter,
      conversation_id: b.conversationId,
      section_id: section?.id,
    }
  );
  return done;
}

interface PracticeBody {
  course: string;
  chapter: string;
  concept?: string;
  kind?: string;
  emphasis?: string;
}

async function practice(mcp: Server, book: RequestBook, b: PracticeBody): Promise<Outcome> {
  if (!SAFE_ID.test(b.course ?? "")) return bad(400, "invalid course id");
  const chapter = loadChapter(b.course, b.chapter);
  if (!chapter) return bad(404, "unknown course or chapter");
  const concept = b.concept ? conceptRegistry(b.course).get(b.concept) : undefined;
  if (b.concept && !concept) return bad(404, `unknown concept ${b.concept}`);

  const { id, done } = book.open("practice", PRACTICE_TIMEOUT_MS, {
    course: b.course,
    chapter: b.chapter,
  });
  await pushEvent(
    mcp,
    "practice",
    id,
    `The learner wants a practice question in the Curio reader.\n` +
      `Course ${b.course}, chapter ${b.chapter} (Chapter ${chapter.number}: ${chapter.title}).\n` +
      (concept
        ? `Target concept: ${concept.key} — ${concept.name}.`
        : `No concept chosen: take the weakest from practice_targets.`) +
      (b.kind ? `\nQuestion kind: ${b.kind}.` : "") +
      (b.emphasis ? `\nCurio's action engine adds: ${b.emphasis}` : ""),
    { course: b.course, chapter: b.chapter, concept_key: concept?.key, item_kind: b.kind }
  );
  return done;
}

interface GradeBody {
  course: string;
  itemId: string;
  answer: string;
}

async function grade(mcp: Server, book: RequestBook, b: GradeBody): Promise<Outcome> {
  if (!SAFE_ID.test(b.course ?? "")) return bad(400, "invalid course id");
  const item = loadItems(b.course)[b.itemId];
  if (!item) return bad(404, "unknown item");
  if (!b.answer?.trim()) return bad(400, "answer required");

  const { id, done } = book.open("grade", GRADE_TIMEOUT_MS, { course: b.course });
  await pushEvent(
    mcp,
    "grade",
    id,
    `The learner answered practice item ${item.id} (${item.conceptName}, ${item.kind.replace("_", " ")}) ` +
      `in the Curio reader. Grade it.\n\n<learner_answer>\n${b.answer}\n</learner_answer>`,
    { course: b.course, item_id: item.id }
  );
  return done;
}
