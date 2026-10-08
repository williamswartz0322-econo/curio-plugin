"use client";

import { useEffect, useState } from "react";

export interface BridgeState {
  configured: boolean;
  connected: boolean;
  detail: string;
}

/** Whether Ask and Practice can reach Claude — polled, since a session can end at any time. */
export function useBridgeStatus(): BridgeState | null {
  const [status, setStatus] = useState<BridgeState | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch("/api/bridge", { cache: "no-store" });
        const next: BridgeState = await res.json();
        if (!alive) return;
        setStatus(next);
        timer = setTimeout(poll, next.connected ? 30_000 : 4_000);
      } catch {
        if (alive) timer = setTimeout(poll, 4_000);
      }
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return status;
}

export function BridgeBadge({ status }: { status: BridgeState | null }) {
  if (!status) return null;
  return (
    <span
      className={`bridge-status ${status.connected ? "bridge-on" : "bridge-off"}`}
      title={status.connected ? "Answers come from your Claude Code session" : status.detail}
    >
      {status.connected ? "● Claude Code" : "○ not connected"}
    </span>
  );
}

/** Why Ask and Practice are unavailable, shown in place of a silent failure. */
export function BridgeNote({ status }: { status: BridgeState | null }) {
  if (!status || status.connected) return null;
  return <div className="bridge-note">{status.detail}</div>;
}
