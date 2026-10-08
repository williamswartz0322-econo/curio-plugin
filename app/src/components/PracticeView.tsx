"use client";

import { useCallback, useEffect, useState } from "react";
import Markdown from "./Markdown";

export interface PracticeRequest {
  conceptKey: string;
  conceptName: string;
  /** May differ from the chapter being read — prerequisites live upstream (§2.5). */
  chapter: string;
  kind?: string;
  emphasis?: string;
}

interface Item {
  id: string;
  conceptKey: string;
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

const KIND_LABEL: Record<string, string> = {
  recall: "Recall",
  explanation: "Explain",
  application: "Apply",
  prediction: "Predict",
  error_diagnosis: "Find the error",
};

export default function PracticeView({
  courseId,
  chapterId,
  request,
  onRequestConsumed,
  onGraded,
}: {
  courseId: string;
  chapterId: string;
  request: PracticeRequest | null;
  onRequestConsumed: () => void;
  onGraded: () => void;
}) {
  const [item, setItem] = useState<Item | null>(null);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextQuestion = useCallback(
    async (req?: PracticeRequest) => {
      setBusy(true);
      setError(null);
      setGrade(null);
      setAnswer("");
      setItem(null);
      try {
        const res = await fetch("/api/practice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate",
            course: courseId,
            chapter: req?.chapter ?? chapterId,
            concept: req?.conceptKey,
            kind: req?.kind,
            emphasis: req?.emphasis,
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
    },
    [courseId, chapterId]
  );

  // The action engine can hand us a specific concept to drill.
  useEffect(() => {
    if (!request) return;
    onRequestConsumed();
    nextQuestion(request);
  }, [request, onRequestConsumed, nextQuestion]);

  const submit = async () => {
    if (!item || !answer.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grade",
          course: courseId,
          itemId: item.id,
          answer,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "could not grade that");
      setGrade(data);
      onGraded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (!item && !busy) {
    return (
      <div className="practice-body">
        <div className="practice-intro">
          <p>
            Answer in your own words. Curio picks whichever concept in this chapter it has the
            least evidence you&apos;ve got, and grades against the book.
          </p>
          {error && <div className="tutor-error">{error}</div>}
          <button className="primary-button" onClick={() => nextQuestion()}>
            Start practising
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="practice-body">
      {busy && !item && <div className="practice-loading">Claude is writing and checking a question…</div>}

      {item && (
        <>
          <div className="practice-meta">
            <span className="practice-kind">{KIND_LABEL[item.kind] ?? item.kind}</span>
            <span className="practice-concept">{item.conceptName}</span>
          </div>

          <div className="practice-question">
            <Markdown>{item.question}</Markdown>
          </div>

          {!grade && (
            <>
              <textarea
                className="practice-answer"
                value={answer}
                placeholder="Your answer…"
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                }}
                rows={5}
                disabled={busy}
              />
              <button
                className="primary-button"
                onClick={submit}
                disabled={busy || !answer.trim()}
              >
                {busy ? "grading…" : "Submit answer"}
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
              {grade.misconception && (
                <div className="grade-misconception">
                  <strong>Noted:</strong> {grade.misconception}
                </div>
              )}
              <button className="primary-button" onClick={() => nextQuestion()} disabled={busy}>
                Next question
              </button>
            </div>
          )}

          {error && <div className="tutor-error">{error}</div>}
        </>
      )}
    </div>
  );
}
