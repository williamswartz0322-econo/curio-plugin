"""Give a textbook PDF the chapter bookmark table Curio's pipelines need.

Many scanned-and-OCRed or publisher PDFs carry no bookmark table, so chapter
based tools (`curio inspect` / `curio extract --chapter N`) cannot find
chapter boundaries. This script derives them from the book's own printed
contents pages, confirms each chapter's opening page by its heading text, and
writes a NEW file with the same page bytes plus a bookmark table. It never
modifies the original, never edits text, and refuses to overwrite anything.

Usage:

    curio bookmarks BOOK.pdf [--out BOOK.bookmarked.pdf]
        [--contents-pages 3-14] [--json mapping.json] [--dry-run]

Exit codes: 0 wrote (or dry-run mapping printed), 2 already bookmarked,
3 could not derive chapters.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import fitz

CHAPTER_TITLE_RE = re.compile(r"^(?:chapter|ch\.?)?\s*(\d+)\b[\s.:–—-]*(.*)$", re.IGNORECASE)
INT_LINE = re.compile(r"^\d{1,3}$")
SECTION_LINE = re.compile(r"^(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?$")


def normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def page_lines(doc: fitz.Document, index: int) -> list[str]:
    return [line.strip() for line in doc[index].get_text().splitlines() if line.strip()]


def existing_chapter_bookmarks(doc: fitz.Document) -> int:
    return sum(1 for level, title, _ in doc.get_toc() if level == 1 and CHAPTER_TITLE_RE.match(title.strip()))


def detect_contents_pages(doc: fitz.Document) -> list[int]:
    """Zero-based indexes of pages that look like a printed table of contents."""
    limit = max(10, doc.page_count // 8)
    found = []
    for index in range(min(limit, doc.page_count)):
        lines = page_lines(doc, index)
        sections = sum(1 for line in lines if SECTION_LINE.match(line))
        numbers = sum(1 for line in lines if INT_LINE.match(line))
        if sections >= 6 and numbers >= 6:
            found.append(index)
    # Keep the first contiguous run; later matches are usually list-of-figures pages.
    run: list[int] = []
    for index in found:
        if run and index != run[-1] + 1:
            break
        run.append(index)
    return run


def parse_contents(lines: list[str]) -> list[dict]:
    """Chapters in printed order. A standalone integer only counts as a chapter
    number when it is the next expected chapter and is followed by a title and a
    printed page number; other integers are page numbers of earlier entries."""
    chapters: list[dict] = []
    expected = 1
    i = 0
    while i < len(lines):
        line = lines[i]
        is_chapter = INT_LINE.match(line) and int(line) == expected
        section = SECTION_LINE.match(line)
        if (is_chapter or (section and chapters and int(section.group(1)) == chapters[-1]["number"])) and i + 2 < len(lines):
            title_parts: list[str] = []
            j = i + 1
            while j < len(lines) and not INT_LINE.match(lines[j]) and len(title_parts) < 3:
                title_parts.append(lines[j])
                j += 1
            if title_parts and j < len(lines) and INT_LINE.match(lines[j]) and not INT_LINE.match(title_parts[0]):
                title = " ".join(title_parts)
                printed = int(lines[j])
                if is_chapter:
                    chapters.append({"number": expected, "title": title, "printed": printed, "sections": []})
                    expected += 1
                else:
                    chapters[-1]["sections"].append({"label": line, "title": title, "printed": printed})
                i = j + 1
                continue
        i += 1
    return chapters


def find_opening_page(doc: fitz.Document, number: int, title: str, after: int) -> int | None:
    """One-based PDF page whose heading starts with the chapter number and title."""
    wanted = normalise(f"{number}{title}")[:22]
    alt = normalise(f"chapter{number}{title}")[:28]
    for index in range(after, doc.page_count):
        head = normalise("".join(page_lines(doc, index)[:4]))
        if head.startswith(wanted) or head.startswith(alt):
            return index + 1
    return None


def build_toc(doc: fitz.Document, chapters: list[dict]) -> tuple[list[list], list[dict]]:
    toc: list[list] = []
    report: list[dict] = []
    previous_page = 0
    last_offset: int | None = None
    for chapter in chapters:
        page = find_opening_page(doc, chapter["number"], chapter["title"], previous_page)
        located = page is not None
        if page is None and last_offset is not None:
            page = chapter["printed"] + last_offset
        if page is None or page <= previous_page or page > doc.page_count:
            report.append({"number": chapter["number"], "title": chapter["title"], "printed": chapter["printed"], "pdf_page": None, "located": False})
            continue
        offset = page - chapter["printed"]
        last_offset = offset
        toc.append([1, f"{chapter['number']} {chapter['title']}", page])
        for section in chapter["sections"]:
            section_page = section["printed"] + offset
            if page <= section_page <= doc.page_count:
                depth = 2 if section["label"].count(".") == 1 else 3
                toc.append([depth, f"{section['label']} {section['title']}", section_page])
        report.append({"number": chapter["number"], "title": chapter["title"], "printed": chapter["printed"], "pdf_page": page, "located": located, "offset": offset})
        previous_page = page
    return toc, report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="curio bookmarks", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--out", type=Path, help="Output path (default: <name> (bookmarked).pdf beside the input)")
    parser.add_argument("--contents-pages", help="One-based inclusive page range of the printed contents, e.g. 3-14 (default: auto-detect)")
    parser.add_argument("--json", type=Path, help="Also write the chapter mapping as JSON")
    parser.add_argument("--dry-run", action="store_true", help="Print the mapping without writing a PDF")
    args = parser.parse_args(argv)

    src: Path = args.pdf.expanduser().resolve()
    if not src.is_file():
        print(f"not a file: {src}", file=sys.stderr)
        return 3
    out: Path = (args.out or src.with_name(f"{src.stem} (bookmarked).pdf")).expanduser().resolve()
    if out == src:
        print("refusing to overwrite the original", file=sys.stderr)
        return 3
    if out.exists() and not args.dry_run:
        print(f"refusing to overwrite existing file: {out}", file=sys.stderr)
        return 3

    doc = fitz.open(src)
    already = existing_chapter_bookmarks(doc)
    if already >= 3:
        print(f"already bookmarked: {already} chapter-level bookmarks present; nothing to do")
        return 2

    if args.contents_pages:
        start, end = (int(part) for part in args.contents_pages.split("-", 1))
        contents = list(range(start - 1, end))
    else:
        contents = detect_contents_pages(doc)
    if not contents:
        print("could not detect printed contents pages; pass --contents-pages", file=sys.stderr)
        return 3
    lines: list[str] = []
    for index in contents:
        lines += page_lines(doc, index)
    chapters = parse_contents(lines)
    if len(chapters) < 2:
        print(f"parsed only {len(chapters)} chapter(s) from contents pages {contents[0] + 1}-{contents[-1] + 1}", file=sys.stderr)
        return 3

    toc, report = build_toc(doc, chapters)
    print(f"contents pages {contents[0] + 1}-{contents[-1] + 1}; {len(chapters)} chapters in printed contents; {doc.page_count} PDF pages")
    for entry in report:
        if entry["pdf_page"] is None:
            print(f"  chapter {entry['number']:2d}: NOT PLACED (printed {entry['printed']}): {entry['title']}")
        else:
            how = "heading" if entry["located"] else "offset"
            print(f"  chapter {entry['number']:2d} -> pdf page {entry['pdf_page']:4d} (printed {entry['printed']:4d}, by {how}): {entry['title']}")
    placed = sum(1 for entry in report if entry["pdf_page"] is not None)
    if args.json:
        args.json.write_text(json.dumps({"source": str(src), "output": None if args.dry_run else str(out), "pages": doc.page_count, "chapters": report}, indent=2))
    if args.dry_run:
        print(f"dry run: {placed} chapters placed, {len(toc)} bookmarks would be written")
        return 0
    if placed < 2:
        print("too few chapters placed; not writing", file=sys.stderr)
        return 3
    doc.set_toc(toc)
    doc.save(out, garbage=0, deflate=False)
    print(f"wrote {out}: {placed} chapters, {len(toc)} bookmarks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
