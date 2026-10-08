"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import type { Chapter, Course, Section } from "@/lib/content";
import type { Anchor } from "@/lib/store";
import BlockView from "./BlockView";
import TutorPanel, { type PendingQuote } from "./TutorPanel";

interface SelectionPopover {
  x: number;
  y: number;
  quote: string;
  blockId: string | null;
  sectionId: string | null;
}

export default function ReaderShell({ course, chapter }: { course: Course; chapter: Chapter }) {
  const [popover, setPopover] = useState<SelectionPopover | null>(null);
  const [pendingQuote, setPendingQuote] = useState<PendingQuote | null>(null);
  const articleRef = useRef<HTMLDivElement>(null);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setPopover(null);
      return;
    }
    const quote = selection.toString().trim();
    if (quote.length < 3 || quote.length > 2000) {
      setPopover(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const container = articleRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setPopover(null);
      return;
    }

    // walk up from the selection start: commonAncestorContainer can sit above
    // the block div when a selection (e.g. triple-click) spans block boundaries
    let node: Node | null = range.startContainer;
    let blockId: string | null = null;
    while (node && node !== container) {
      if (node instanceof HTMLElement && node.dataset.blockId) {
        blockId = node.dataset.blockId;
        break;
      }
      node = node.parentNode;
    }
    const sectionId = blockId
      ? chapter.sections.find((s) => s.blocks.some((b) => b.id === blockId))?.id ?? null
      : null;

    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setPopover({
      x: rect.left - containerRect.left + container.scrollLeft + rect.width / 2,
      y: rect.top - containerRect.top + container.scrollTop - 10,
      quote,
      blockId,
      sectionId,
    });
  }, [chapter.sections]);

  const askAboutSelection = () => {
    if (!popover) return;
    const section = chapter.sections.find((s) => s.id === popover.sectionId);
    setPendingQuote({
      quote: popover.quote,
      blockId: popover.blockId,
      sectionId: popover.sectionId,
      sectionLabel: section
        ? section.number
          ? `§${section.number} ${section.title}`
          : section.title
        : null,
    });
    setPopover(null);
    window.getSelection()?.removeAllRanges();
  };

  const anchor: Anchor | null = pendingQuote
    ? { sectionId: pendingQuote.sectionId, blockId: pendingQuote.blockId, quote: pendingQuote.quote }
    : null;

  return (
    <div className="reader-shell">
      <nav className="left-rail">
        <Link href="/" className="home-link">
          ← Curio
        </Link>
        <div className="chapter-heading">
          <span className="chapter-number">Chapter {chapter.number}</span>
          <span className="chapter-title">{chapter.title}</span>
        </div>
        <Link href={`/map/${course.id}`} className="rail-map-link">
          Course map →
        </Link>
        <ul className="section-nav">
          {chapter.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>
                {s.number && <span className="section-number">{s.number}</span>} {s.title}
              </a>
            </li>
          ))}
        </ul>
        {chapter.concepts.length > 0 && chapter.concepts[0].id !== "draft-placeholder" && (
          <div className="concept-list">
            <h3>Key concepts</h3>
            <ul>
              {chapter.concepts.map((c) => (
                <li key={c.id} title={c.description}>
                  {c.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      <div className="article-wrap" ref={articleRef} onMouseUp={handleMouseUp}>
        <article className="article">
          <header className="article-header">
            <div className="article-kicker">
              {course.title} · pp. {chapter.start_page}–{chapter.end_page}
            </div>
            <h1>
              <span className="article-chapter-no">{chapter.number}</span>
              {chapter.title}
            </h1>
          </header>
          {chapter.sections.map((section: Section) => (
            <section key={section.id} id={section.id} className="book-section">
              <h2>
                {section.number && <span className="section-number">{section.number}</span>}
                {section.title}
              </h2>
              {section.blocks.map((block) => (
                <BlockView key={block.id} block={block} courseId={course.id} />
              ))}
            </section>
          ))}
        </article>
        {popover && (
          <button
            className="ask-popover"
            style={{ left: popover.x, top: popover.y }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={askAboutSelection}
          >
            Ask Curio
          </button>
        )}
      </div>

      <TutorPanel
        courseId={course.id}
        chapterId={chapter.id}
        pendingQuote={pendingQuote}
        clearPendingQuote={() => setPendingQuote(null)}
        anchor={anchor}
      />
    </div>
  );
}
