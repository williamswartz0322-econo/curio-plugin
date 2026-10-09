// The curio tools: how Claude reads the course and writes learner evidence.
// Every write goes through the kernel in app/src/lib, which validates it, so
// Claude never edits learner files directly.
import crypto from "crypto";
import * as z from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  conceptSource,
  loadItems,
  practiceCandidates,
  proposeItem,
  recordGrade,
  settleDraft,
  type PracticeItem,
} from "../../app/src/lib/assessment";
import { nextActions } from "../../app/src/lib/actions";
import { contentDir, listCourses, loadChapter, loadCourse } from "../../app/src/lib/content";
import { applyLearnerUpdate, conceptRegistry, loadLearner } from "../../app/src/lib/learner";
import { planToday } from "../../app/src/lib/plan";
import { interleave, reviewQueue } from "../../app/src/lib/schedule";
import { appendMessage, loadConversation } from "../../app/src/lib/store";
import { buildContext } from "../../app/src/lib/tutor";
import { pushEvent } from "./channel";
import { notConnectedDetail, startHttp, type BridgeHttp } from "./http";
import { openBrowser, startReader, type Reader } from "./reader";
import { RequestBook } from "./requests";

const MASTERY = z.enum(["exposed", "shaky", "developing", "solid"]);
const KIND = z.enum(["recall", "explanation", "application", "prediction", "error_diagnosis"]);
const PING_TIMEOUT_MS = 30 * 60_000;

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

function error(t: string) {
  return { content: [{ type: "text" as const, text: t }], isError: true };
}

function json(value: unknown) {
  return text(JSON.stringify(value, null, 2));
}

/** What the learner may see of an item: never `expected` or `commonErrors`. */
function publicItem(item: PracticeItem) {
  return {
    id: item.id,
    conceptKey: item.conceptKey,
    conceptName: item.conceptName,
    kind: item.kind,
    question: item.question,
    chapter: item.chapter,
  };
}

export interface BridgeState {
  book: RequestBook;
  http: BridgeHttp | null;
  token: string;
  reader: Reader | null;
}

export function registerTools(mcp: McpServer, state: BridgeState): void {
  const { book } = state;

  mcp.registerTool(
    "open_reader",
    {
      description:
        "Open the Curio reader in the learner's browser, connected to this session. Opens the given chapter, the course map for a course, or the library.",
      inputSchema: { course: z.string().optional(), chapter: z.string().optional() },
    },
    async ({ course, chapter }) => {
      try {
        if (!state.http) {
          state.token = crypto.randomBytes(24).toString("hex");
          state.http = await startHttp(mcp.server, book, state.token);
        }
        // Start the reader, or restart it if it has exited since.
        if (!state.reader?.alive()) {
          state.reader = await startReader({
            CURIO_BRIDGE_URL: state.http.url,
            CURIO_BRIDGE_TOKEN: state.token,
            CURIO_LIBRARY: contentDir(),
          });
        }
      } catch (err) {
        return error(`Could not start the reader: ${err instanceof Error ? err.message : err}`);
      }
      const page =
        course && chapter ? `/read/${course}/${chapter}` : course ? `/map/${course}` : "/";
      const url = `${state.reader!.url}${page}`;
      openBrowser(url);

      if (!book.connected) {
        const { id } = book.open("ping", PING_TIMEOUT_MS);
        book.pingSentAt = Date.now();
        await pushEvent(
          mcp.server,
          "ping",
          id,
          "Connection check from the Curio reader. Call reply with this request_id and the text \"connected\"."
        );
      }
      return text(
        `The reader is open at ${url}.\n\n` +
          (book.connected
            ? "It is connected to this session."
            : "A connection-check event (kind=\"ping\") should arrive next; answer it with reply. " +
              "If this session was started without the curio channel, no event will arrive and the " +
              `reader will say so. Tell the learner: ${notConnectedDetail()}`)
      );
    }
  );

  mcp.registerTool(
    "context",
    {
      description:
        "Everything the tutor needs before answering in a chapter: the chapter's full text, the learner model, the reading position, concept ids for update_learner, and the conversation so far. Call it for the first question in a chapter, for a conversation you haven't seen this session, and after context compaction.",
      inputSchema: {
        course: z.string(),
        chapter: z.string(),
        section_id: z.string().optional(),
        conversation_id: z.string().optional(),
      },
    },
    async ({ course, chapter, section_id, conversation_id }) => {
      const c = loadCourse(course);
      const ch = loadChapter(course, chapter);
      if (!c || !ch) return error(`unknown course/chapter ${course}/${chapter}`);
      const conversation = conversation_id ? loadConversation(course, conversation_id) : null;
      return text(buildContext(c, ch, { sectionId: section_id, conversation }));
    }
  );

  mcp.registerTool(
    "reply",
    {
      description:
        "Answer a kind=\"ask\" or kind=\"ping\" event from the reader. The text is shown to the learner as Markdown with KaTeX math.",
      inputSchema: { request_id: z.string(), text: z.string() },
    },
    async ({ request_id, text: answer }) => {
      const pending = book.get(request_id);
      if (!pending) return error(`no open request ${request_id} — it may have timed out`);
      if (pending.kind === "ping") {
        book.settle(request_id, { status: 200, body: { ok: true } });
        return text("Connected. The learner can now ask and practise from the reader.");
      }
      if (pending.kind !== "ask") {
        return error(`request ${request_id} is a ${pending.kind} request — use settle_item or record_grade`);
      }
      const head = {
        id: pending.conversationId!,
        course: pending.course!,
        chapter: pending.chapter!,
        title: pending.ask!.title,
        anchor: pending.ask!.anchor,
        model: "claude-code",
      };
      appendMessage(head, { role: "user", content: pending.ask!.question });
      appendMessage(head, { role: "assistant", content: answer });
      book.settle(request_id, { status: 200, body: { reply: answer } });
      return text("Sent. Now record what the exchange showed with update_learner.");
    }
  );

  mcp.registerTool(
    "update_learner",
    {
      description:
        "Fold one tutoring exchange into the learner model, following the rules in the curio:study skill (references/learner-update.md). Use only concept ids from the chapter's list in context. Pass an empty concept_updates list when the exchange showed nothing.",
      inputSchema: {
        course: z.string(),
        chapter: z.string(),
        concept_updates: z.array(
          z.object({
            concept_id: z.string(),
            mastery: MASTERY,
            confidence: z.enum(["low", "medium", "high"]),
            evidence: z.string(),
            misconception: z.string().nullable(),
          })
        ),
        profile_note: z.string().nullable(),
      },
    },
    async ({ course, chapter, concept_updates, profile_note }) => {
      if (!loadChapter(course, chapter)) return error(`unknown course/chapter ${course}/${chapter}`);
      const result = applyLearnerUpdate(course, chapter, { concept_updates, profile_note });
      return json(result);
    }
  );

  mcp.registerTool(
    "practice_targets",
    {
      description: "This chapter's concepts in practice order, weakest first, with the learner's mastery.",
      inputSchema: { course: z.string(), chapter: z.string() },
    },
    async ({ course, chapter }) => {
      const registry = conceptRegistry(course);
      const learner = loadLearner(course);
      return json(
        practiceCandidates(course, chapter)
          .slice(0, 6)
          .map((key) => ({
            concept_key: key,
            name: registry.get(key)?.name,
            mastery: learner.concepts[key]?.mastery ?? "unseen",
          }))
      );
    }
  );

  mcp.registerTool(
    "concept_passages",
    {
      description:
        "The exact textbook passages that teach a concept, with block ids — the only material a practice question may rest on.",
      inputSchema: { course: z.string(), concept_key: z.string() },
    },
    async ({ course, concept_key }) => {
      const entry = conceptRegistry(course).get(concept_key);
      const chapter = entry ? loadChapter(course, entry.chapter) : null;
      if (!entry || !chapter) return error(`unknown concept ${concept_key}`);
      const { text: passages } = conceptSource(chapter, entry.id);
      return text(
        `Concept to target: ${entry.name} — ${entry.description}\n` +
          `Chapter: ${entry.chapterTitle} (${entry.chapter})\n\n<passages>\n${passages}\n</passages>`
      );
    }
  );

  mcp.registerTool(
    "propose_item",
    {
      description:
        "Submit a drafted practice item for independent validation. Returns a draft id and a validation file: run the curio:item-validator agent on that file (it writes its verdict beside it), then call settle_item. Never show the question to the learner before it is approved.",
      inputSchema: {
        course: z.string(),
        concept_key: z.string(),
        kind: KIND,
        question: z.string(),
        expected: z.string().describe("The reasoning path plus the correct answer, for the grader"),
        common_errors: z.array(z.object({ wrong: z.string(), reveals: z.string() })),
        source_block_ids: z.array(z.string()),
      },
    },
    async (args) => {
      const entry = conceptRegistry(args.course).get(args.concept_key);
      if (!entry) return error(`unknown concept ${args.concept_key}`);
      try {
        const draft = proposeItem({
          course: args.course,
          chapter: entry.chapter,
          conceptKey: args.concept_key,
          kind: args.kind,
          question: args.question,
          expected: args.expected,
          commonErrors: args.common_errors,
          sourceBlockIds: args.source_block_ids,
        });
        return json({ draft_id: draft.id, validation_file: draft.validationFile });
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    }
  );

  mcp.registerTool(
    "settle_item",
    {
      description:
        "After the curio:item-validator agent has written its verdict for a draft, settle it. Approved: the item is saved and, with a request_id, served to the reader. Rejected: it is discarded — draft another (next-weakest concept), up to three attempts, then fail_request. Refuses if the validator hasn't written a verdict.",
      inputSchema: {
        course: z.string(),
        draft_id: z.string(),
        request_id: z.string().optional(),
      },
    },
    async ({ course, draft_id, request_id }) => {
      let settled: ReturnType<typeof settleDraft>;
      try {
        settled = settleDraft(course, draft_id);
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
      const { item, note } = settled;
      if (!item) {
        return text(`Rejected (${note}) and discarded. Draft another item, or fail_request after three tries.`);
      }
      if (request_id && !book.settle(request_id, { status: 200, body: publicItem(item) })) {
        return text(`Saved item ${item.id}, but request ${request_id} had already closed.`);
      }
      return json({ served: !!request_id, item: publicItem(item) });
    }
  );

  mcp.registerTool(
    "get_item",
    {
      description:
        "A practice item with its answer key (expected answer, common errors) for grading. Never reveal the key before the learner has answered.",
      inputSchema: { course: z.string(), item_id: z.string() },
    },
    async ({ course, item_id }) => {
      const item = loadItems(course)[item_id];
      return item ? json(item) : error(`unknown item ${item_id}`);
    }
  );

  mcp.registerTool(
    "record_grade",
    {
      description:
        "Record a graded answer as observed evidence in the learner model and, with a request_id, show the grade in the reader.",
      inputSchema: {
        course: z.string(),
        item_id: z.string(),
        verdict: z.enum(["correct", "partial", "incorrect"]),
        feedback: z.string(),
        misconception: z.string().nullable(),
        mastery: MASTERY,
        request_id: z.string().optional(),
      },
    },
    async ({ course, item_id, request_id, ...grade }) => {
      const item = loadItems(course)[item_id];
      if (!item) return error(`unknown item ${item_id}`);
      const recorded = recordGrade(item, grade);
      if (request_id) book.settle(request_id, { status: 200, body: recorded });
      return text(`Recorded: ${grade.verdict}; ${item.conceptName} is now ${grade.mastery}.`);
    }
  );

  mcp.registerTool(
    "fail_request",
    {
      description:
        "Tell the reader a request could not be completed (e.g. no validated question after three tries). The message is shown to the learner.",
      inputSchema: { request_id: z.string(), message: z.string() },
    },
    async ({ request_id, message }) =>
      book.settle(request_id, { status: 503, body: { error: message } })
        ? text("The learner has been told.")
        : error(`no open request ${request_id}`)
  );

  mcp.registerTool(
    "status",
    {
      description:
        "The library, or for one course: today's plan, the review queue, and the action engine's next steps with their reasons.",
      inputSchema: { course: z.string().optional(), chapter: z.string().optional() },
    },
    async ({ course, chapter }) => {
      if (!course) {
        return json({
          library: contentDir(),
          courses: listCourses().map((c) => ({
            id: c.id,
            title: c.title,
            chapters: c.chapters.map((ch) => `${ch.id}${ch.draft ? " (draft)" : ""}: ${ch.title}`),
          })),
        });
      }
      const c = loadCourse(course);
      if (!c) return error(`unknown course ${course}`);
      const target = chapter ?? recentChapter(course) ?? c.chapters[0]?.id;
      return json({
        course: c.title,
        today: planToday(course),
        review_due: interleave(reviewQueue(course), 8),
        next_actions: target ? nextActions(course, target) : [],
        chapter: target,
      });
    }
  );
}

/** The chapter the learner most recently produced evidence in. */
function recentChapter(course: string): string | undefined {
  const concepts = Object.values(loadLearner(course).concepts);
  concepts.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  return concepts[0]?.chapter;
}
