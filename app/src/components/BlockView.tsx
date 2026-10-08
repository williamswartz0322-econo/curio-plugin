"use client";

import type { Block } from "@/lib/content";
import Markdown from "./Markdown";

export default function BlockView({ block, courseId }: { block: Block; courseId: string }) {
  switch (block.type) {
    case "figure":
      return (
        <figure className="block-figure" data-block-id={block.id}>
          {block.image && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={`/api/assets/${courseId}/${block.image}`} alt={block.label ?? "Figure"} />
          )}
          {(block.label || block.md) && (
            <figcaption>
              {block.label && <strong>{block.label}. </strong>}
              <Markdown>{block.md}</Markdown>
            </figcaption>
          )}
        </figure>
      );
    case "definition":
      return (
        <div className="block-definition" data-block-id={block.id}>
          {block.term && <span className="block-tag">Definition · {block.term}</span>}
          <Markdown>{block.md}</Markdown>
        </div>
      );
    case "principle":
      return (
        <div className="block-principle" data-block-id={block.id}>
          {block.label && <span className="block-tag">{block.label}</span>}
          <Markdown>{block.md}</Markdown>
        </div>
      );
    case "example":
    case "worked_example":
      return (
        <div className="block-example" data-block-id={block.id}>
          <span className="block-tag">{block.label ?? "Example"}</span>
          <Markdown>{block.md}</Markdown>
        </div>
      );
    case "equation":
      return (
        <div className="block-equation" data-block-id={block.id}>
          <Markdown>{block.md}</Markdown>
        </div>
      );
    case "exercise":
      return (
        <div className="block-exercise" data-block-id={block.id}>
          {block.label && <span className="exercise-number">{block.label}</span>}
          <Markdown>{block.md}</Markdown>
        </div>
      );
    case "aside":
      return (
        <aside className="block-aside" data-block-id={block.id}>
          <Markdown>{block.md}</Markdown>
        </aside>
      );
    case "table":
    case "paragraph":
    default:
      return (
        <div className="block-paragraph" data-block-id={block.id}>
          <Markdown>{block.md}</Markdown>
        </div>
      );
  }
}
