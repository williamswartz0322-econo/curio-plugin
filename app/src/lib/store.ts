// Conversation + learner-memory persistence. Plain files under content/ — diffable, no DB.
import fs from "fs";
import path from "path";
import { courseDir } from "./content";
import { readJson, writeJsonAtomic } from "./fsutil";

export interface Anchor {
  sectionId: string | null;
  blockId: string | null;
  quote: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Conversation {
  id: string;
  course: string;
  chapter: string;
  title: string;
  anchor: Anchor | null;
  model?: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

const SAFE_ID = /^[a-zA-Z0-9-]+$/;

function conversationsDir(course: string): string {
  return path.join(courseDir(course), "conversations");
}

export function saveConversation(conv: Conversation): void {
  if (!SAFE_ID.test(conv.id) || !SAFE_ID.test(conv.course)) {
    throw new Error("invalid conversation or course id");
  }
  writeJsonAtomic(path.join(conversationsDir(conv.course), `${conv.id}.json`), conv);
}

/** Append one message, creating the conversation on its first question. */
export function appendMessage(
  head: Omit<Conversation, "messages" | "createdAt" | "updatedAt">,
  message: ChatMessage
): Conversation {
  const now = new Date().toISOString();
  const conv: Conversation = loadConversation(head.course, head.id) ?? {
    ...head,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  conv.messages.push(message);
  conv.updatedAt = now;
  saveConversation(conv);
  return conv;
}

export function loadConversation(course: string, id: string): Conversation | null {
  if (!SAFE_ID.test(id) || !SAFE_ID.test(course)) return null;
  return readJson<Conversation | null>(path.join(conversationsDir(course), `${id}.json`), null);
}

export function listConversations(
  course: string,
  chapter: string
): Pick<Conversation, "id" | "title" | "updatedAt" | "anchor">[] {
  if (!SAFE_ID.test(course)) return [];
  const dir = conversationsDir(course);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const conv: Conversation = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      if (conv.chapter !== chapter) continue;
      out.push({ id: conv.id, title: conv.title, updatedAt: conv.updatedAt, anchor: conv.anchor });
    } catch {
      // skip unreadable files
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

