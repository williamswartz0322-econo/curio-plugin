// The bridge's own guarantees: requests always end (answer or timeout), and
// only the reader that holds the per-launch token can reach the session.
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startHttp, type BridgeHttp } from "../src/http";
import { RequestBook } from "../src/requests";

describe("RequestBook", () => {
  afterEach(() => vi.useRealTimers());

  it("settles once and marks the session connected", async () => {
    const book = new RequestBook();
    const { id, done } = book.open("ask", 60_000);
    expect(book.settle(id, { status: 200, body: { reply: "hi" } })).toBe(true);
    expect(book.settle(id, { status: 200, body: {} })).toBe(false);
    expect(await done).toEqual({ status: 200, body: { reply: "hi" } });
    expect(book.connected).toBe(true);
  });

  it("times out with an explanation instead of hanging", async () => {
    vi.useFakeTimers();
    const book = new RequestBook();
    const { done } = book.open("practice", 1_000);
    vi.advanceTimersByTime(1_001);
    const outcome = await done;
    expect(outcome.status).toBe(504);
    expect(JSON.stringify(outcome.body)).toMatch(/curio channel/);
  });

  it("calls a session silent only after the ping has had time to arrive", () => {
    const book = new RequestBook();
    expect(book.silent()).toBe(false);
    book.pingSentAt = Date.now() - 61_000;
    expect(book.silent()).toBe(true);
    book.connected = true;
    expect(book.silent()).toBe(false);
  });
});

describe("HTTP gating", () => {
  let http: BridgeHttp | null = null;
  afterEach(() => http?.close());

  it("refuses requests without the launch token and validates the rest", async () => {
    process.env.CURIO_LIBRARY = fs.mkdtempSync(path.join(os.tmpdir(), "curio-bridge-"));
    const sent: unknown[] = [];
    const mcp = { notification: async (n: unknown) => void sent.push(n) } as unknown as Server;
    http = await startHttp(mcp, new RequestBook(), "secret");

    expect((await fetch(`${http.url}/status`)).status).toBe(403);
    const status = await fetch(`${http.url}/status`, { headers: { "x-curio-token": "secret" } });
    expect(await status.json()).toMatchObject({ connected: false });

    const ask = await fetch(`${http.url}/ask`, {
      method: "POST",
      headers: { "x-curio-token": "secret" },
      body: JSON.stringify({ course: "nope", chapter: "ch01", conversationId: "x", question: "hi" }),
    });
    expect(ask.status).toBe(404);
    const traversal = await fetch(`${http.url}/ask`, {
      method: "POST",
      headers: { "x-curio-token": "secret" },
      body: JSON.stringify({ course: "../etc", chapter: "ch01", conversationId: "x", question: "hi" }),
    });
    expect(traversal.status).toBe(400);
    expect(sent).toHaveLength(0);
  });
});

describe("app window", () => {
  const url = "http://127.0.0.1:5000/";

  it("uses the first installed Chromium browser on macOS, including ~/Applications", async () => {
    const { appWindowCommand } = await import("../src/reader");
    const edge = "/Users/me/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
    const cmd = appWindowCommand(url, "darwin", (p) => p === edge, { HOME: "/Users/me" });
    expect(cmd).toEqual([edge, [`--app=${url}`, "--window-size=1440,920"]]);
  });

  it("searches PATH on Linux and falls back to null when nothing is installed", async () => {
    const { appWindowCommand } = await import("../src/reader");
    const found = appWindowCommand(url, "linux", (p) => p === "/usr/bin/chromium", { PATH: "/bin:/usr/bin" });
    expect(found?.[0]).toBe("/usr/bin/chromium");
    expect(appWindowCommand(url, "darwin", () => false, { HOME: "/Users/me" })).toBeNull();
    expect(appWindowCommand(url, "win32", () => true, {})).toBeNull();
  });
});
