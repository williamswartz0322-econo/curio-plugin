"""Chapter batching, outlines, and the no-AI draft.

The structuring itself happens in Claude Code: `curio extract` writes one task
file per batch, a structurer agent answers each in block markup (see
markup.py), and `curio assemble` checks and merges the answers. This module
holds the deterministic pieces those steps share.
"""

from __future__ import annotations

import re

from .extract import RawChapter, TocEntry
from .schema import Block, Chapter, Concept, Section

# Each batch becomes one agent's answer, written through a file tool rather
# than streamed from the API, so batches stay well below an agent's output
# budget. Roughly one output token per source character.
BATCH_CHAR_BUDGET = 20_000


def _section_spans(raw: RawChapter) -> list[tuple[TocEntry, int, int]]:
    """Each level-2 TOC entry with the page range it owns."""
    entries = [s for s in raw.sections if s.level == 2] or raw.sections
    spans: list[tuple[TocEntry, int, int]] = []
    for i, entry in enumerate(entries):
        end = entries[i + 1].page - 1 if i + 1 < len(entries) else raw.end_page
        spans.append((entry, entry.page, max(end, entry.page)))
    return spans


def _pages(marked_text: str) -> list[tuple[int, str]]:
    parts = re.split(r"\[\[page (\d+)\]\]\n", marked_text)
    return [(int(parts[i]), parts[i + 1]) for i in range(1, len(parts), 2)]


def _text_for_pages(raw: RawChapter, first: int, last: int) -> str:
    return "\n\n".join(
        f"[[page {page}]]\n{body.strip()}"
        for page, body in _pages(raw.text)
        if first <= page <= last
    )


def _batches(raw: RawChapter) -> list[list[tuple[TocEntry, int, int]]]:
    """Group sections so each batch stays under the character budget."""
    batches: list[list[tuple[TocEntry, int, int]]] = []
    current: list[tuple[TocEntry, int, int]] = []
    size = 0
    for span in _section_spans(raw):
        _, first, last = span
        span_chars = len(_text_for_pages(raw, first, last))
        if current and size + span_chars > BATCH_CHAR_BUDGET:
            batches.append(current)
            current, size = [], 0
        current.append(span)
        size += span_chars
    if current:
        batches.append(current)
    return batches


def _renumber(sections: list[Section], chapter_id: str) -> list[Section]:
    """Ids are assigned per batch, so they collide until the batches are merged."""
    for s_idx, section in enumerate(sections, start=1):
        section.id = f"{chapter_id}-s{s_idx:02d}"
        for b_idx, block in enumerate(section.blocks, start=1):
            block.id = f"{section.id}-b{b_idx:03d}"
    return sections


def outline(sections: list[Section]) -> str:
    """The section/block outline the concept pass reads."""
    return "\n".join(
        f"[{s.id}] {s.number} {s.title}\n"
        + "\n".join(f"  - {b.type}: {(b.term or b.label or b.md)[:110]}" for b in s.blocks)
        for s in sections
    )


def draft_chapter(raw: RawChapter) -> Chapter:
    """No-LLM fallback: naive paragraph split, sections assigned by TOC page ranges.

    Good enough to exercise the reader end-to-end; replaced by the LLM pass.
    """
    chapter_id = f"ch{raw.number:02d}"

    section_defs: list[tuple[str, str, int]] = []  # (number, title, start_page)
    for entry in raw.sections:
        if entry.level != 2:
            continue
        m = re.match(rf"({raw.number}\.\d+)\s+(.*)", entry.title)
        number, title = (m.group(1), m.group(2)) if m else ("", entry.title)
        section_defs.append((number, title, entry.page))
    if not section_defs or section_defs[0][2] > raw.start_page:
        section_defs.insert(0, ("", "Introduction", raw.start_page))

    sections: list[Section] = []
    for idx, (number, title, start) in enumerate(section_defs):
        end = (
            section_defs[idx + 1][2] - 1 if idx + 1 < len(section_defs) else raw.end_page
        )
        # sections can share a boundary page; give the page to the later section
        # for text purposes only in the simple draft (overlap is acceptable here).
        sections.append(
            Section(id=f"{chapter_id}-s{idx + 1:02d}", number=number, title=title, blocks=[])
        )
        blocks = sections[-1].blocks
        bnum = 0
        for page, body in _pages(raw.text):
            if not (start <= page <= end):
                continue
            for para in re.split(r"\n\s*\n", body):
                para = " ".join(para.split())
                if len(para) < 3:
                    continue
                bnum += 1
                blocks.append(
                    Block(
                        id=f"{chapter_id}-s{idx + 1:02d}-b{bnum:03d}",
                        type="paragraph",
                        md=para,
                        page=page,
                        term=None,
                        label=None,
                        image=None,
                    )
                )
            for fig in raw.figures:
                if fig.page == page and not any(b.image == fig.path for b in blocks):
                    bnum += 1
                    blocks.append(
                        Block(
                            id=f"{chapter_id}-s{idx + 1:02d}-b{bnum:03d}",
                            type="figure",
                            md="",
                            page=page,
                            term=None,
                            label=None,
                            image=fig.path,
                        )
                    )

    return Chapter(
        id=chapter_id,
        number=raw.number,
        title=raw.title,
        start_page=raw.start_page,
        end_page=raw.end_page,
        sections=sections,
        concepts=[
            Concept(
                id="draft-placeholder",
                name="Draft extraction",
                description="This chapter was ingested without the LLM structuring pass; run /curio:ingest for typed blocks and concepts.",
                section_ids=[],
            )
        ],
    )
