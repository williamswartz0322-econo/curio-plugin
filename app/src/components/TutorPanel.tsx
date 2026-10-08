"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Anchor, ChatMessage } from "@/lib/store";
import { BridgeBadge, BridgeNote, useBridgeStatus } from "./BridgeStatus";
import Markdown from "./Markdown";
import NextUp from "./NextUp";
import PracticeView, { type PracticeRequest } from "./PracticeView";
import type { Action } from "@/lib/actions";

export interface PendingQuote {
  quote: string;
  blockId: string | null;
  sectionId: string | null;
  sectionLabel: string | null;
}

interface ConversationMeta {
  id: string;
  title: string;
  updatedAt: string;
}

const QUICK_ACTIONS = [
  "Explain this",
  "Give me an example",
  "Why does this matter?",
  "Quiz me on this",
];

export default function TutorPanel({
  courseId,
  chapterId,
  pendingQuote,
  clearPendingQuote,
}: {
  courseId: string;
  chapterId: string;
  pendingQuote: PendingQuote | null;
  clearPendingQuote: () => void;
  anchor: Anchor | null;
}) {
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());
  const [tab, setTab] = useState<"next" | "ask" | "practice">("next");
  const [practiceRequest, setPracticeRequest] = useState<PracticeRequest | null>(null);
  const [progressKey, setProgressKey] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [convAnchor, setConvAnchor] = useState<Anchor | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ConversationMeta[]>([]);
  const bridge = useBridgeStatus();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/conversations?course=${courseId}&chapter=${chapterId}`,
        { cache: "no-store" }
      );
      if (res.ok) setHistory(await res.json());
    } catch {
      // non-fatal
    }
  }, [courseId, chapterId]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (pendingQuote) inputRef.current?.focus();
  }, [pendingQuote]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  /** `fresh` starts a new thread in the same call — state updates wouldn't land in time otherwise. */
  const send = async (question: string, fresh = false) => {
    const q = question.trim();
    if (!q || streaming) return;

    const baseMessages = fresh ? [] : messages;
    const convId = fresh ? crypto.randomUUID() : conversationId;
    if (fresh) {
      setConversationId(convId);
      setConvAnchor(null);
    }

    let userContent = q;
    let anchor = fresh ? null : convAnchor;
    if (pendingQuote) {
      const where = pendingQuote.sectionLabel ? ` (${pendingQuote.sectionLabel})` : "";
      // escape $ so currency in the selected text doesn't re-trigger math rendering
      const safeQuote = pendingQuote.quote.replace(/\$/g, "\\$").replace(/\n/g, "\n> ");
      userContent = `**Highlighted**${where}:\n> ${safeQuote}\n\n${q}`;
      anchor = {
        sectionId: pendingQuote.sectionId,
        blockId: pendingQuote.blockId,
        quote: pendingQuote.quote,
      };
      if (!convAnchor) setConvAnchor(anchor);
      clearPendingQuote();
    }

    const newMessages: ChatMessage[] = [...baseMessages, { role: "user", content: userContent }];
    const title =
      baseMessages.length === 0
        ? q.slice(0, 80)
        : history.find((h) => h.id === convId)?.title ?? q.slice(0, 80);
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    setError(null);

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course: courseId,
          chapter: chapterId,
          conversationId: convId,
          title,
          anchor,
          question: userContent,
        }),
      });
      // The answer comes from Claude in the learner's Claude Code session, so
      // it arrives whole rather than streamed.
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `tutor request failed (${res.status})`);
      setMessages([...newMessages, { role: "assistant", content: data.reply }]);
      refreshHistory();
      // The learner model moves on every exchange; let the plan re-read it.
      setProgressKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
      setMessages(newMessages);
    } finally {
      setStreaming(false);
    }
  };

  const runAction = (action: Action) => {
    if (action.deliver === "practice" && action.conceptKey) {
      setPracticeRequest({
        conceptKey: action.conceptKey,
        conceptName: action.conceptName ?? "",
        chapter: action.chapter,
        kind: action.itemKind,
        emphasis: action.emphasis,
      });
      setTab("practice");
    } else if (action.deliver === "tutor" && action.prompt) {
      setTab("ask");
      send(action.prompt, true);
    }
  };

  const loadConversation = async (id: string) => {
    if (streaming) return;
    const res = await fetch(`/api/conversations?course=${courseId}&id=${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const conv = await res.json();
    setConversationId(conv.id);
    setMessages(conv.messages);
    setConvAnchor(conv.anchor);
  };

  const newConversation = () => {
    if (streaming) return;
    setConversationId(crypto.randomUUID());
    setMessages([]);
    setConvAnchor(null);
    setError(null);
  };

  return (
    <aside className="tutor-panel">
      <div className="tutor-header">
        <span className="tutor-name">Curio</span>
        <div className="tutor-header-controls">
          <BridgeBadge status={bridge} />
          {tab === "ask" && (
            <button className="ghost-button" onClick={newConversation}>
              New thread
            </button>
          )}
        </div>
      </div>

      <div className="tutor-tabs">
        <button className={tab === "next" ? "active" : ""} onClick={() => setTab("next")}>
          Next up
        </button>
        <button className={tab === "ask" ? "active" : ""} onClick={() => setTab("ask")}>
          Ask
        </button>
        <button className={tab === "practice" ? "active" : ""} onClick={() => setTab("practice")}>
          Practice
        </button>
      </div>

      {tab !== "next" && <BridgeNote status={bridge} />}

      {tab === "next" ? (
        <NextUp
          courseId={courseId}
          chapterId={chapterId}
          onRun={runAction}
          reloadKey={progressKey}
        />
      ) : tab === "practice" ? (
        <PracticeView
          courseId={courseId}
          chapterId={chapterId}
          request={practiceRequest}
          onRequestConsumed={() => setPracticeRequest(null)}
          onGraded={() => setProgressKey((k) => k + 1)}
        />
      ) : (
      <>
      <div className="tutor-scroll" ref={scrollRef}>
        {messages.length === 0 && !pendingQuote && (
          <div className="tutor-empty">
            <p>
              Highlight anything in the text and ask about it — or just ask a question about the
              chapter.
            </p>
            {history.length > 0 && (
              <div className="history">
                <h3>Earlier threads</h3>
                <ul>
                  {history.map((h) => (
                    <li key={h.id}>
                      <button onClick={() => loadConversation(h.id)}>{h.title}</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.role === "assistant" && m.content === "" && streaming ? (
              <span className="thinking-dots">thinking…</span>
            ) : (
              <Markdown>{m.content}</Markdown>
            )}
          </div>
        ))}
        {error && <div className="tutor-error">{error}</div>}
      </div>

      {pendingQuote && (
        <div className="pending-quote">
          <div className="pending-quote-text">
            “{pendingQuote.quote.slice(0, 160)}
            {pendingQuote.quote.length > 160 ? "…" : ""}”
          </div>
          <div className="quick-actions">
            {QUICK_ACTIONS.map((a) => (
              <button key={a} onClick={() => send(a)} disabled={streaming}>
                {a}
              </button>
            ))}
          </div>
          <button className="ghost-button dismiss" onClick={clearPendingQuote}>
            dismiss
          </button>
        </div>
      )}

      <form
        className="tutor-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          placeholder={pendingQuote ? "Ask about the highlight…" : "Ask anything…"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          disabled={streaming}
        />
        <button type="submit" disabled={streaming || !input.trim()}>
          Ask
        </button>
      </form>
      </>
      )}
    </aside>
  );
}
