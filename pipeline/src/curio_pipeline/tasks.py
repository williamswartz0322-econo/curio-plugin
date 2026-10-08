"""Structuring tasks: split an extracted chapter into batches an agent can answer.

`curio extract` calls write_tasks(); each batch becomes a task file holding
exactly the context the old API call sent (sections to emit, figure assets,
the page-marked excerpt), plus where to write the answer. The manifest records
what the checks need later: page ranges, figure assets, and output paths.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .extract import RawChapter
from .structure import BATCH_CHAR_BUDGET, _pages, _section_spans, _text_for_pages

CONTINUED_TITLE = "(continued)"


@dataclass
class Unit:
    title: str  # TOC heading, or "" when the chapter has no section bookmarks
    first: int
    last: int
    continued: bool = False  # starts partway through the section named by `title`


@dataclass
class Batch:
    index: int
    first_page: int  # pages this batch owns (the excerpt adds one page each side)
    last_page: int
    wanted: list[str] = field(default_factory=list)
    task: str = ""
    output: str = ""


def _units(raw: RawChapter) -> list[Unit]:
    spans = _section_spans(raw)
    if spans:
        units = [Unit(entry.title, first, last) for entry, first, last in spans]
        # Text before the first bookmarked section is the chapter's opening.
        if units[0].first > raw.start_page:
            units.insert(0, Unit("Introduction", raw.start_page, units[0].first - 1))
    else:
        units = [Unit("", raw.start_page, raw.end_page)]

    # A section longer than the budget is split by pages into near-equal
    # pieces; every piece after the first continues the section.
    out: list[Unit] = []
    for unit in units:
        pages = [(p, len(_text_for_pages(raw, p, p))) for p, _ in _pages(raw.text)
                 if unit.first <= p <= unit.last]
        total = sum(n for _, n in pages)
        count = max(1, math.ceil(total / BATCH_CHAR_BUDGET))
        target = total / count
        pieces: list[list[int]] = [[]]
        size = 0
        for page, page_chars in pages:
            if pieces[-1] and len(pieces) < count and size + page_chars / 2 > target:
                pieces.append([])
                size = 0
            pieces[-1].append(page)
            size += page_chars
        for i, piece in enumerate(pieces):
            out.append(Unit(unit.title, piece[0], piece[-1], continued=i > 0))
    return out


def _describe(unit: Unit) -> str:
    if unit.continued and not unit.title:
        return (
            f"- the section in progress at page {unit.first} (open with "
            f"`=== section | {CONTINUED_TITLE}` unless a new heading starts the page), then "
            f"every further section whose text falls on pages up to {unit.last}, using the "
            f"headings printed in the text"
        )
    if unit.continued:
        return (
            f"- continue {unit.title} from page {unit.first} — open with a header repeating "
            f"that section's number and title exactly (or `=== section | {CONTINUED_TITLE}`)"
        )
    if not unit.title:
        return (
            f"- every section whose text falls on pages {unit.first}-{unit.last}, using the "
            f"headings printed in the text"
        )
    if unit.title == "Introduction":
        return (
            f"- Introduction — the chapter's opening text before its first numbered section "
            f"(pages {unit.first}-{unit.last}); write `=== section | Introduction`"
        )
    return f"- {unit.title} (starts page {unit.first})"


def plan_batches(raw: RawChapter) -> list[Batch]:
    batches: list[Batch] = []
    current: list[Unit] = []
    size = 0

    def flush() -> None:
        if current:
            batches.append(
                Batch(
                    index=len(batches) + 1,
                    first_page=min(u.first for u in current),
                    last_page=max(u.last for u in current),
                    wanted=[_describe(u) for u in current],
                )
            )

    for unit in _units(raw):
        unit_chars = len(_text_for_pages(raw, unit.first, unit.last))
        if current and size + unit_chars > BATCH_CHAR_BUDGET:
            flush()
            current, size = [], 0
        current.append(unit)
        size += unit_chars
    flush()
    return batches


def write_tasks(
    raw: RawChapter,
    course_dir: Path,
    *,
    course: str,
    book: dict,
) -> dict:
    """Write work/chNN/{manifest.json, batch-KK.task.md}. Returns the manifest."""
    chapter_id = f"ch{raw.number:02d}"
    work = course_dir / "work" / chapter_id
    work.mkdir(parents=True, exist_ok=True)
    for stale in work.glob("batch-*"):
        stale.unlink()

    batches = plan_batches(raw)
    for batch in batches:
        batch.task = str(work / f"batch-{batch.index:02d}.task.md")
        batch.output = str(work / f"batch-{batch.index:02d}.blocks.txt")
        lo = max(batch.first_page - 1, raw.start_page)
        hi = min(batch.last_page + 1, raw.end_page)
        figures = [f for f in raw.figures if lo <= f.page <= hi]
        fig_lines = (
            "\n".join(f"page {f.page}: {f.path} ({f.width_pt}x{f.height_pt} pt)" for f in figures)
            or "(none)"
        )
        Path(batch.task).write_text(
            f"# Structuring task — Chapter {raw.number}, batch {batch.index} of {len(batches)}\n\n"
            f"Write your answer in block markup to:\n    {batch.output}\n"
            f"Then check it with:\n    curio check-batch \"{batch.output}\"\n\n"
            f"Chapter {raw.number}: {raw.title}\n"
            f"The chapter runs from PDF page {raw.start_page} to {raw.end_page}. "
            f"This batch owns pages {batch.first_page}-{batch.last_page}; the excerpt adds "
            f"one page of overlap on each side.\n\n"
            f"<sections_to_emit>\n" + "\n".join(batch.wanted) + "\n</sections_to_emit>\n\n"
            f"<figure_assets>\n{fig_lines}\n</figure_assets>\n\n"
            f"<chapter_excerpt>\n{_text_for_pages(raw, lo, hi)}\n</chapter_excerpt>\n"
        )

    manifest = {
        "course": course,
        "book": book,
        "chapter": {
            "id": chapter_id,
            "number": raw.number,
            "title": raw.title,
            "start_page": raw.start_page,
            "end_page": raw.end_page,
        },
        "raw_text": str(course_dir / "raw" / f"{chapter_id}.txt"),
        "figures": [asdict(f) for f in raw.figures],
        "batches": [asdict(b) for b in batches],
    }
    (work / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest
