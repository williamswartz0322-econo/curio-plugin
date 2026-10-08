"""Deterministic PDF extraction: chapter text, TOC sections, and vector-figure renders.

No LLM calls here — everything in this module is reproducible offline.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import fitz  # pymupdf

# Books label chapters differently — "Chapter 1 The Market" (Varian) vs
# "1 Measurement" (Halliday). Accept an optional prefix before the number.
CHAPTER_RE = re.compile(
    r"^(?:chapter|ch\.?)?\s*(\d+)\b[\s.:–—-]*(.*)$", re.IGNORECASE
)

LIGATURES = str.maketrans(
    {
        "ﬀ": "ff",
        "ﬁ": "fi",
        "ﬂ": "fl",
        "ﬃ": "ffi",
        "ﬄ": "ffl",
        "’": "'",
        "‘": "'",
        "“": '"',
        "”": '"',
    }
)

# A full-size diagram clears these outright.
MIN_FIGURE_WIDTH_PT = 140
MIN_FIGURE_HEIGHT_PT = 90
MIN_FIGURE_AREA_PT2 = 20_000
# Smaller inline diagrams are common in science texts and would otherwise be
# dropped. Rules and table borders are the thing to exclude, and they give
# themselves away by being extremely wide relative to their height.
SMALL_FIGURE_AREA_PT2 = 3_000
SMALL_FIGURE_MIN_WIDTH_PT = 60
SMALL_FIGURE_MIN_HEIGHT_PT = 40
MAX_FIGURE_ASPECT = 6.0
# Embedded photographs run smaller than diagrams; icons and rules are smaller still.
MIN_RASTER_WIDTH_PT = 100
MIN_RASTER_HEIGHT_PT = 80
FIGURE_PAD_PT = 6
FIGURE_DPI = 180


@dataclass
class TocEntry:
    level: int
    title: str
    page: int  # 1-based pdf page


def _looks_like_figure(rect: fitz.Rect) -> bool:
    """True for diagrams; false for rules, borders, and stray marks."""
    if rect.height <= 0:
        return False
    if (
        rect.width >= MIN_FIGURE_WIDTH_PT
        and rect.height >= MIN_FIGURE_HEIGHT_PT
        and rect.width * rect.height >= MIN_FIGURE_AREA_PT2
    ):
        return True
    return (
        rect.width * rect.height >= SMALL_FIGURE_AREA_PT2
        and rect.width >= SMALL_FIGURE_MIN_WIDTH_PT
        and rect.height >= SMALL_FIGURE_MIN_HEIGHT_PT
        and rect.width / rect.height <= MAX_FIGURE_ASPECT
    )


@dataclass
class FigureAsset:
    page: int
    path: str  # relative to the course directory, e.g. figures/ch01/p033-f1.png
    width_pt: int
    height_pt: int


@dataclass
class RawChapter:
    number: int
    title: str
    start_page: int  # 1-based, inclusive
    end_page: int  # 1-based, inclusive
    text: str  # full chapter text with [[page N]] markers
    sections: list[TocEntry] = field(default_factory=list)
    figures: list[FigureAsset] = field(default_factory=list)


def book_metadata(pdf_path: Path) -> dict:
    doc = fitz.open(pdf_path)
    try:
        meta = doc.metadata or {}
        return {
            "title": meta.get("title") or pdf_path.stem,
            "author": meta.get("author") or "",
            "pages": doc.page_count,
        }
    finally:
        doc.close()


def list_chapters(pdf_path: Path) -> list[TocEntry]:
    doc = fitz.open(pdf_path)
    try:
        toc = doc.get_toc()
    finally:
        doc.close()
    return [
        TocEntry(level, title.strip(), page)
        for level, title, page in toc
        if level == 1 and CHAPTER_RE.match(title.strip())
    ]


def _chapter_bounds(doc: fitz.Document, number: int) -> tuple[str, int, int, list[TocEntry]]:
    toc = doc.get_toc()
    start_idx = None
    title = ""
    for i, (level, raw_title, page) in enumerate(toc):
        if level != 1:
            continue
        m = CHAPTER_RE.match(raw_title.strip())
        if m and int(m.group(1)) == number:
            start_idx = i
            title = m.group(2).strip() or raw_title.strip()
            break
    if start_idx is None:
        raise ValueError(f"Chapter {number} not found in PDF table of contents")

    start_page = toc[start_idx][2]
    end_page = doc.page_count
    sections: list[TocEntry] = []
    for level, raw_title, page in toc[start_idx + 1 :]:
        if level == 1:
            end_page = page - 1
            break
        sections.append(TocEntry(level, raw_title.strip(), page))
    return title, start_page, end_page, sections


def _extract_figures(
    doc: fitz.Document,
    start_page: int,
    end_page: int,
    figures_dir: Path,
    course_relative_prefix: str,
) -> list[FigureAsset]:
    figures_dir.mkdir(parents=True, exist_ok=True)
    assets: list[FigureAsset] = []
    for pno in range(start_page - 1, end_page):
        page = doc[pno]
        kept = [r for r in page.cluster_drawings() if _looks_like_figure(r)]

        # Photographs are embedded images, not vector art — a diagram-only sweep
        # misses them entirely in books like Halliday. Add any that a vector
        # cluster doesn't already cover (the clip render would include those).
        for xref, *_ in page.get_images(full=True):
            for rect in page.get_image_rects(xref):
                if rect.width < MIN_RASTER_WIDTH_PT or rect.height < MIN_RASTER_HEIGHT_PT:
                    continue
                if any(rect in cluster or (rect & cluster).get_area() > rect.get_area() * 0.6
                       for cluster in kept):
                    continue
                kept.append(rect)

        for i, rect in enumerate(sorted(kept, key=lambda r: r.y0), start=1):
            clip = fitz.Rect(
                rect.x0 - FIGURE_PAD_PT,
                rect.y0 - FIGURE_PAD_PT,
                rect.x1 + FIGURE_PAD_PT,
                rect.y1 + FIGURE_PAD_PT,
            ) & page.rect
            pix = page.get_pixmap(clip=clip, dpi=FIGURE_DPI)
            name = f"p{pno + 1:03d}-f{i}.png"
            pix.save(figures_dir / name)
            assets.append(
                FigureAsset(
                    page=pno + 1,
                    path=f"{course_relative_prefix}/{name}",
                    width_pt=round(rect.width),
                    height_pt=round(rect.height),
                )
            )
    return assets


def extract_chapter(pdf_path: Path, number: int, course_dir: Path) -> RawChapter:
    doc = fitz.open(pdf_path)
    try:
        title, start_page, end_page, sections = _chapter_bounds(doc, number)

        pages_text: list[str] = []
        for pno in range(start_page - 1, end_page):
            text = doc[pno].get_text("text").translate(LIGATURES)
            pages_text.append(f"[[page {pno + 1}]]\n{text.strip()}")

        chapter_slug = f"ch{number:02d}"
        figures = _extract_figures(
            doc,
            start_page,
            end_page,
            course_dir / "figures" / chapter_slug,
            f"figures/{chapter_slug}",
        )
    finally:
        doc.close()

    return RawChapter(
        number=number,
        title=title,
        start_page=start_page,
        end_page=end_page,
        text="\n\n".join(pages_text),
        sections=sections,
        figures=figures,
    )
