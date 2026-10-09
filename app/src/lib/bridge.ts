// The reader's line to the Claude Code session that opened it. That session's
// curio MCP server spawned this reader with the bridge's address and a
// per-launch token; every AI request is forwarded there and answered by Claude.
// Server-only: the token never reaches the browser.

export interface BridgeStatus {
  configured: boolean;
  connected: boolean;
  detail: string;
}

function bridge(): { url: string; token: string } | null {
  const url = process.env.CURIO_BRIDGE_URL;
  const token = process.env.CURIO_BRIDGE_TOKEN;
  return url && token ? { url, token } : null;
}

/**
 * Refuse cross-site requests. A page on another site (or one that rebinds its
 * DNS to 127.0.0.1) must not be able to put text in front of the learner's
 * Claude session, so the Host has to be loopback and any Origin has to match it.
 */
export function rejectForeign(req: Request): Response | null {
  const host = req.headers.get("host") ?? "";
  const origin = req.headers.get("origin");
  const loopback = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host);
  let sameOrigin = true;
  if (origin) {
    try {
      sameOrigin = new URL(origin).host === host;
    } catch {
      sameOrigin = false; // "null" and other opaque origins
    }
  }
  if (!loopback || !sameOrigin) return Response.json({ error: "forbidden" }, { status: 403 });
  return null;
}

const NOT_OPENED =
  "This reader wasn't opened from Claude Code, so Ask and Practice are off. " +
  "Run /curio:study in Claude Code to open a connected reader.";

/** Forward a request to the session and wait for Claude's answer. */
export async function callBridge(path: string, body: unknown): Promise<Response> {
  const b = bridge();
  if (!b) return Response.json({ error: NOT_OPENED }, { status: 503 });
  try {
    const res = await fetch(`${b.url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-curio-token": b.token },
      body: JSON.stringify(body),
      // Claude may take a minute or two (a practice item is written, then
      // independently validated); the bridge enforces its own timeout.
      signal: AbortSignal.timeout(10 * 60_000),
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json(
      { error: "Lost the Claude Code session that opened this reader. Run /curio:study again." },
      { status: 502 }
    );
  }
}

export async function bridgeStatus(): Promise<BridgeStatus> {
  const b = bridge();
  if (!b) return { configured: false, connected: false, detail: NOT_OPENED };
  try {
    const res = await fetch(`${b.url}/status`, {
      headers: { "x-curio-token": b.token },
      signal: AbortSignal.timeout(3_000),
    });
    const data = await res.json();
    return { configured: true, connected: !!data.connected, detail: data.detail ?? "" };
  } catch {
    return {
      configured: true,
      connected: false,
      detail: "The Claude Code session that opened this reader has ended.",
    };
  }
}
