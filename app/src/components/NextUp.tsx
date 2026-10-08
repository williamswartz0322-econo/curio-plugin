"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Action } from "@/lib/actions";

const TYPE_LABEL: Record<string, string> = {
  prerequisite_review: "Root cause",
  prerequisite_gap: "Shore up",
  misconception_contrast: "Fix",
  explain: "Learn",
  diagnostic: "Check",
  teach_back: "Teach back",
  retrieval: "Recall",
  transfer: "Stretch",
  advance: "Next",
  chapter_clear: "Clear",
};

export default function NextUp({
  courseId,
  chapterId,
  onRun,
  reloadKey,
}: {
  courseId: string;
  chapterId: string;
  onRun: (action: Action) => void;
  reloadKey: number;
}) {
  const [actions, setActions] = useState<Action[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/actions?course=${courseId}&chapter=${chapterId}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "could not load recommendations");
      setActions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    }
  }, [courseId, chapterId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  return (
    <div className="nextup-body">
      <p className="nextup-intro">
        What Curio thinks is worth doing next in this chapter, and why.
      </p>

      {error && <div className="tutor-error">{error}</div>}
      {!actions && !error && <div className="practice-loading">reading your progress…</div>}

      {actions?.map((action, i) => (
        <div key={`${action.type}-${action.conceptKey ?? i}`} className="action-card">
          <div className="action-head">
            <span className={`action-type action-${action.type}`}>
              {TYPE_LABEL[action.type] ?? action.type}
            </span>
            {i === 0 && action.deliver !== "none" && (
              <span className="action-top">recommended</span>
            )}
          </div>
          <div className="action-label">{action.label}</div>
          <div className="action-why">{action.why}</div>
          {action.deliver === "read" ? (
            <Link className="action-run" href={`/read/${courseId}/${action.chapter}`}>
              Read it →
            </Link>
          ) : (
            action.deliver !== "none" && (
              <button className="action-run" onClick={() => onRun(action)}>
                {action.deliver === "practice" ? "Practise this →" : "Go →"}
              </button>
            )
          )}
        </div>
      ))}
    </div>
  );
}
