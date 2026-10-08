"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Goal, TodayPlan } from "@/lib/plan";

const STATUS_LABEL: Record<TodayPlan["status"], string> = {
  on_track: "on track",
  tight: "tight",
  behind: "behind",
  done: "complete",
  past_due: "past due",
};

export default function GoalPlan({ courseId }: { courseId: string }) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [hours, setHours] = useState("5");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/goal?course=${courseId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setGoal(d.goal);
        setPlan(d.plan);
        if (d.goal) {
          setDate(d.goal.targetDate);
          setHours(String(d.goal.hoursPerWeek));
        }
      })
      .finally(() => setLoaded(true));
  }, [courseId]);

  const save = async () => {
    setError(null);
    const res = await fetch("/api/goal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course: courseId, targetDate: date, hoursPerWeek: Number(hours) }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "could not save the goal");
      return;
    }
    setGoal(d.goal);
    setPlan(d.plan);
    setEditing(false);
  };

  if (!loaded) return null;

  if (!goal || editing) {
    return (
      <div className="goal-box">
        <div className="goal-form-row">
          <label>
            finish by
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            hours/week
            <input
              type="number"
              min={1}
              max={80}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </label>
          <button className="primary-button goal-save" onClick={save} disabled={!date}>
            {goal ? "Update plan" : "Set a goal"}
          </button>
          {editing && (
            <button className="ghost-button" onClick={() => setEditing(false)}>
              cancel
            </button>
          )}
        </div>
        {error && <div className="tutor-error">{error}</div>}
        {!goal && (
          <p className="goal-hint">
            A goal turns Curio from a book into a course: a date and your weekly hours become a
            daily plan that replans itself as you learn.
          </p>
        )}
      </div>
    );
  }

  if (!plan) return null;

  return (
    <div className={`goal-box plan-${plan.status}`}>
      <div className="plan-header">
        <span className={`plan-status status-${plan.status}`}>{STATUS_LABEL[plan.status]}</span>
        <span className="plan-meta">
          {plan.conceptsTotal - plan.conceptsRemaining}/{plan.conceptsTotal} concepts ·{" "}
          {plan.daysLeft > 0 ? `${plan.daysLeft} days left` : "past date"} ·{" "}
          <button className="plan-edit" onClick={() => setEditing(true)}>
            edit goal
          </button>
        </span>
      </div>
      <p className="plan-statusline">{plan.statusLine}</p>
      <ol className="plan-items">
        {plan.items.map((item, i) => (
          <li key={i}>
            <Link href={item.href} className={`plan-item-label item-${item.kind}`}>
              {item.label} →
            </Link>
            <span className="plan-item-why">{item.why}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
