import Link from "next/link";
import GoalPlan from "@/components/GoalPlan";
import { listCourses } from "@/lib/content";
import { reviewQueue } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default function Home() {
  const courses = listCourses();
  return (
    <main className="home">
      <h1>Curio</h1>
      <p className="tagline">Your textbook, with a tutor inside.</p>
      <Link href="/web" className="web-link">
        Your knowledge web →
      </Link>
      {courses.length === 0 && (
        <p className="empty">
          No books yet. In Claude Code, type <code>/curio:ingest</code> and drag your textbook PDF
          into the window.
        </p>
      )}
      {courses.map((course) => {
        const due = reviewQueue(course.id);
        return (
          <section key={course.id} className="course-card">
            <h2>{course.title}</h2>
            <p className="author">{course.author}</p>
            <div className="course-actions">
              <Link href={`/map/${course.id}`} className="map-link">
                Course map →
              </Link>
              {due.length > 0 ? (
                <Link href={`/review/${course.id}`} className="review-link">
                  Review {due.length} due →
                </Link>
              ) : (
                <span className="review-clear">Nothing due for review</span>
              )}
            </div>
            <GoalPlan courseId={course.id} />
            <ul>
              {course.chapters.map((ch) => (
                <li key={ch.id}>
                  <Link href={`/read/${course.id}/${ch.id}`}>
                    Chapter {ch.number}: {ch.title}
                  </Link>
                  {ch.draft && <span className="draft-badge">draft extraction</span>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <footer className="home-footer">
        Curio is free software under the AGPL-3.0.{" "}
        <a href="https://github.com/williamswartz0322-econo/curio-plugin">Source code</a>
      </footer>
    </main>
  );
}
