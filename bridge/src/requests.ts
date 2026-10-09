// Requests from the reader that wait on Claude. The HTTP handler parks a
// request here and pushes an event; a tool call (reply, settle_item,
// record_grade, fail_request) settles it, or the timeout does.
import crypto from "crypto";
import type { Anchor } from "../../app/src/lib/store";
import type { EventKind } from "./channel";

export interface Outcome {
  status: number;
  body: unknown;
}

/** What a request carries until it is answered (an ask keeps its question until the reply). */
export interface RequestContext {
  course?: string;
  chapter?: string;
  conversationId?: string;
  ask?: { title: string; anchor: Anchor | null; question: string };
}

interface Pending extends RequestContext {
  kind: EventKind;
  resolve: (outcome: Outcome) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RequestBook {
  private pending = new Map<string, Pending>();
  /** Claude has answered something through the channel since the reader opened. */
  connected = false;
  pingSentAt: number | null = null;
  lastTimeout: number | null = null;

  open(
    kind: EventKind,
    timeoutMs: number,
    context: RequestContext = {}
  ): { id: string; done: Promise<Outcome> } {
    const id = `${kind}-${crypto.randomBytes(5).toString("hex")}`;
    const done = new Promise<Outcome>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.lastTimeout = Date.now();
        resolve({ status: 504, body: { error: timeoutMessage(this.connected) } });
      }, timeoutMs);
      this.pending.set(id, { kind, resolve, timer, ...context });
    });
    return { id, done };
  }

  get(id: string): Pending | undefined {
    return this.pending.get(id);
  }

  settle(id: string, outcome: Outcome): boolean {
    const p = this.pending.get(id);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pending.delete(id);
    this.connected = true;
    this.lastTimeout = null;
    p.resolve(outcome);
    return true;
  }

  /** The session has never answered and the ping has had time to arrive. */
  silent(graceMs = 60_000): boolean {
    return !this.connected && this.pingSentAt !== null && Date.now() - this.pingSentAt > graceMs;
  }
}

function timeoutMessage(connected: boolean): string {
  return connected
    ? "Claude didn't answer in time — it may be busy with something else in the session. Try again."
    : "Claude Code didn't answer. Is the session running with the curio channel? See the reader's connection note.";
}
