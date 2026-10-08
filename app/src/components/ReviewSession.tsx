"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DueConcept } from "@/lib/schedule";
import Markdown from "./Markdown";

interface Item {
  id: string;
  conceptName: string;
  kind: string;
  question: string;
}

interface Grade {
  verdict: "correct" | "partial" | "incorrect";
  feedback: string;
  misconception: string | null;
  mastery: string;
}

interface Result {
  concept: string;
  verdict: Grade["verdict"];
}

/** Retrieval depth follows the streak: first reviews recall, seasoned ones apply. */
function kindFor(concept: DueConcept): string {
  if (concept.mastery === "shaky") return "explanation";
  return concept.streak >= 2 ? "application" : "recall";
}

export default function ReviewSession({
  courseId,
  courseTitle,
}: {
  courseId: string;
  courseTitle: string;
}) {
  const [queue, setQueue] = useState<DueConcept[] | null>(null);
  const [index, setIndex] = useState(0);
  const [item, setItem] = useState<Item | null>(null);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/review?course=${courseId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setQueue(data.session ?? []))
      .catch(() => setError("could not load the review queue"));
  }, [courseId]);

  const loadItem = async (concept: DueConcept) => {
    setBusy(true);
    setError(null);
    setItem(null);
    setGrade(null);
    setAnswer("");
    try {
      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          course: courseId,
          chapter: concept.chapter,
          concept: concept.key,
          kind: kindFor(concept),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "could not generate a question");
      setItem(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (queue && queue.length > 0 && index < queue.length) loadItem(queue[index]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, index]);

  const submit = async () => {
    if (!item || !answer.trim() || busy || !queue) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grade", course: courseId, itemId: item.id, answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "could not grade that");
      setGrade(data);
      setResults((r) => [...r, { concept: queue[index].name, verdict: data.verdict }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (error && !item) {
    return (
      <main className="review-shell">
        <div className="tutor-error">{error}</div>
        <Link href="/">← back</Link>
      </main>
    );
  }

  if (!queue) {
    return (
      <main className="review-shell">
        <p className="practice-loading">reading your schedule…</p>
      </main>
    );
  }

  if (queue.length === 0) {
    return (
      <main className="review-shell">
        <h1>Review</h1>
        <p className="review-empty">
          Nothing due. Forgetting curves say come back later — that&apos;s the system working.
        </p>
        <Link href="/">← back</Link>
      </main>
    );
  }

  const finished = index >= queue.length;
  if (finished) {
    const correct = results.filter((r) => r.verdict === "correct").length;
    return (
      <main className="review-shell">
        <h1>Session done</h1>
        <p className="review-summary-line">
          {correct} of {results.length} retrieved cleanly. Intervals updated — each success
          pushes the next review further out.
        </p>
        <ul className="review-results">
          {results.map((r, i) => (
            <li key={i} className={`verdict-${r.verdict}`}>
              <span>{r.concept}</span>
              <span>{r.verdict}</span>
            </li>
          ))}
        </ul>
        <Link href="/" className="primary-button review-done-link">
          Done
        </Link>
      </main>
    );
  }

  const current = queue[index];
  return (
    <main className="review-shell">
      <header className="review-header">
        <Link href="/" className="home-link">
          ← {courseTitle}
        </Link>
        <span className="review-progress">
          {index + 1} / {queue.length}
        </span>
      </header>

      <div className="review-context">
        <span className="practice-concept">
          {current.name} · {current.chapterTitle}
        </span>
        <span className="review-why">{current.why}</span>
      </div>

      {busy && !item && <p className="practice-loading">Claude is writing and checking a question…</p>}

      {item && (
        <>
          <div className="practice-question">
            <Markdown>{item.question}</Markdown>
          </div>

          {!grade && (
            <>
              <textarea
                className="practice-answer"
                value={answer}
                placeholder="From memory…"
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                }}
                rows={5}
                disabled={busy}
              />
              <button className="primary-button" onClick={submit} disabled={busy || !answer.trim()}>
                {busy ? "grading…" : "Submit"}
              </button>
            </>
          )}

          {grade && (
            <div className={`practice-grade grade-${grade.verdict}`}>
              <div className="grade-header">
                <span className="grade-verdict">{grade.verdict}</span>
                <span className="grade-mastery">now: {grade.mastery}</span>
              </div>
              <Markdown>{grade.feedback}</Markdown>
              <button className="primary-button" onClick={() => setIndex((i) => i + 1)}>
                {index + 1 < queue.length ? "Next" : "Finish"}
              </button>
            </div>
          )}

          {error && <div className="tutor-error">{error}</div>}
        </>
      )}
    </main>
  );
}
