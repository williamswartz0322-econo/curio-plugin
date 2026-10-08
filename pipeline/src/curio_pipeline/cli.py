"""Curio ingestion CLI — the deterministic half of every pipeline step.

The judgment half (structuring, naming concepts, drawing edges) is done by
Claude Code agents; these commands prepare their inputs and check their
answers. The /curio:ingest and /curio:link skills run them in order:

    curio inspect BOOK.pdf                         # chapters in the bookmark table
    curio bookmarks BOOK.pdf --dry-run             # when inspect finds none
    curio extract BOOK.pdf --chapter 3 --course slug
        -> structurer agents answer work/ch03/batch-KK.task.md
    curio check-batch <answer>                     # agents self-check
    curio assemble --course slug --chapter 3
        -> concept agent answers work/ch03/outline.md
    curio finalize --course slug --chapter 3       # writes chapters/ch03.json
    curio link-prepare --course slug  /  curio link-apply --course slug
    curio weave-prepare  /  curio weave-apply
    curio draft BOOK.pdf --chapter 3 --course slug # no-AI reading draft
    curio library                                  # what's ingested

Content lives in the library: --library, else $CURIO_LIBRARY, else ~/Curio.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

from pydantic import ValidationError

from . import assemble, bookmarks, extract, graph, structure, tasks, weave


def _library(args: argparse.Namespace) -> Path:
    # An unset plugin option can reach a skill as its literal "${user_config.library}".
    candidates = [args.library, os.environ.get("CURIO_LIBRARY")]
    raw = next((c.strip() for c in candidates if c and c.strip() and "${" not in c), "~/Curio")
    return Path(raw).expanduser().resolve()


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _course_dir(args: argparse.Namespace) -> Path:
    course_dir = _library(args) / "courses" / args.course
    if not course_dir.exists():
        raise SystemExit(f"no course at {course_dir}")
    return course_dir


def _work_dir(args: argparse.Namespace) -> Path:
    return _course_dir(args) / "work" / f"ch{args.chapter:02d}"


def _book(pdf: Path) -> dict:
    meta = extract.book_metadata(pdf)
    return {"title": meta["title"], "author": meta["author"], "pages": meta["pages"], "pdf": pdf.name}


def cmd_inspect(args: argparse.Namespace) -> None:
    pdf = Path(args.pdf).expanduser().resolve()
    meta = extract.book_metadata(pdf)
    chapters = extract.list_chapters(pdf)
    print(f"{meta['title']} — {meta['author']} ({meta['pages']} pages)")
    print(f"suggested course slug: {_slugify(meta['title'])}")
    if not chapters:
        print("no chapters in the bookmark table — run `curio bookmarks` first")
    for ch in chapters:
        print(f"  {ch.title} -> page {ch.page}")


def _extract(args: argparse.Namespace) -> tuple[Path, extract.RawChapter, dict, str]:
    pdf = Path(args.pdf).expanduser().resolve()
    book = _book(pdf)
    slug = args.course or _slugify(book["title"])
    course_dir = _library(args) / "courses" / slug
    course_dir.mkdir(parents=True, exist_ok=True)
    raw = extract.extract_chapter(pdf, args.chapter, course_dir)
    raw_dir = course_dir / "raw"
    raw_dir.mkdir(exist_ok=True)
    (raw_dir / f"ch{args.chapter:02d}.txt").write_text(raw.text)
    print(
        f"Chapter {raw.number}: {raw.title} — pages {raw.start_page}-{raw.end_page}, "
        f"{len(raw.sections)} toc sections, {len(raw.figures)} figures, {len(raw.text)} chars"
    )
    print(f"course: {slug} ({course_dir})")
    return course_dir, raw, book, slug


def cmd_extract(args: argparse.Namespace) -> None:
    course_dir, raw, book, slug = _extract(args)
    manifest = tasks.write_tasks(raw, course_dir, course=slug, book=book)
    batches = manifest["batches"]
    print(f"{len(batches)} structuring task(s) in {course_dir / 'work' / manifest['chapter']['id']}:")
    for b in batches:
        print(f"  batch {b['index']}: pages {b['first_page']}-{b['last_page']}")
        print(f"    task:   {b['task']}")
        print(f"    answer: {b['output']}")


def cmd_draft(args: argparse.Namespace) -> None:
    course_dir, raw, book, slug = _extract(args)
    chapter = structure.draft_chapter(raw)
    chapters_dir = course_dir / "chapters"
    chapters_dir.mkdir(exist_ok=True)
    (chapters_dir / f"{chapter.id}.json").write_text(chapter.model_dump_json(indent=2))
    assemble.update_course_json(course_dir, slug, book, chapter, draft=True)
    print(f"wrote draft {chapters_dir / f'{chapter.id}.json'} (no typed blocks or concepts)")


def cmd_check_batch(args: argparse.Namespace) -> None:
    manifest, batch = assemble.find_batch(Path(args.answer).expanduser())
    report = assemble.check_batch(manifest, batch)
    print(report.render())
    if not report.ok:
        sys.exit(1)


def cmd_assemble(args: argparse.Namespace) -> None:
    work = _work_dir(args)
    reports, sections = assemble.assemble(work)
    for report in reports:
        print(report.render())
    if sections is None:
        failed = [r.batch for r in reports if not r.ok]
        print(f"\nnot assembled — batch(es) {failed} need another pass")
        sys.exit(1)
    blocks = sum(len(s.blocks) for s in sections)
    print(
        f"\nassembled {len(sections)} sections, {blocks} blocks; "
        f"chapter coverage {assemble.chapter_coverage(work, sections):.0%}"
    )
    print(f"concept task:   {work / 'outline.md'}")
    print(f"concept answer: {work / 'concepts.json'}")


def cmd_finalize(args: argparse.Namespace) -> None:
    course_dir = _course_dir(args)
    chapter, errors = assemble.finalize(_work_dir(args), course_dir)
    if errors:
        for e in errors:
            print(f"error: {e}")
        sys.exit(1)
    assert chapter is not None
    print(
        f"wrote {course_dir / 'chapters' / f'{chapter.id}.json'}: "
        f"{len(chapter.sections)} sections, "
        f"{sum(len(s.blocks) for s in chapter.sections)} blocks, {len(chapter.concepts)} concepts"
    )


def cmd_link_prepare(args: argparse.Namespace) -> None:
    course_dir = _course_dir(args)
    try:
        payload, count = graph.prepare(course_dir)
    except ValueError as err:
        raise SystemExit(f"error: {err}")
    work = course_dir / "work"
    work.mkdir(exist_ok=True)
    (work / "graph-input.md").write_text(payload)
    print(f"{count} concepts")
    print(f"link task:   {work / 'graph-input.md'}")
    print(f"link answer: {work / 'graph-edges.json'}")


def cmd_link_apply(args: argparse.Namespace) -> None:
    course_dir = _course_dir(args)
    edges_path = course_dir / "work" / "graph-edges.json"
    try:
        result, dropped = graph.apply(course_dir, args.course, edges_path.read_text())
    except (FileNotFoundError, ValidationError) as err:
        raise SystemExit(f"error: {edges_path}: {err}")
    (course_dir / "graph.json").write_text(result.model_dump_json(indent=2))
    by_type: dict[str, int] = {}
    for e in result.edges:
        by_type[e.type] = by_type.get(e.type, 0) + 1
    cross = sum(1 for e in result.edges if e.source.split(":")[0] != e.target.split(":")[0])
    print(f"wrote {course_dir / 'graph.json'}: {len(result.edges)} edges ({cross} cross-chapter) {by_type}")
    if any(dropped.values()):
        print(f"dropped: {dropped}")


def cmd_weave_prepare(args: argparse.Namespace) -> None:
    library = _library(args)
    try:
        payload, courses = weave.prepare(library)
    except ValueError as err:
        raise SystemExit(f"error: {err}")
    work = library / "work"
    work.mkdir(exist_ok=True)
    (work / "weave-input.md").write_text(payload)
    print(f"{courses} courses")
    print(f"weave task:   {work / 'weave-input.md'}")
    print(f"weave answer: {work / 'weave-edges.json'}")


def cmd_weave_apply(args: argparse.Namespace) -> None:
    library = _library(args)
    edges_path = library / "work" / "weave-edges.json"
    try:
        web, dropped = weave.apply(library, edges_path.read_text())
    except (FileNotFoundError, ValidationError) as err:
        raise SystemExit(f"error: {edges_path}: {err}")
    (library / "web.json").write_text(web.model_dump_json(indent=2))
    print(f"wrote {library / 'web.json'}: {len(web.edges)} bridges (dropped {dropped})")


def cmd_library(args: argparse.Namespace) -> None:
    library = _library(args)
    courses_dir = library / "courses"
    courses_dir.mkdir(parents=True, exist_ok=True)
    print(f"library: {library}")
    if not any(courses_dir.iterdir()):
        print("  (empty)")
        return
    for course_dir in sorted(p for p in courses_dir.iterdir() if p.is_dir()):
        course_path = course_dir / "course.json"
        if not course_path.exists():
            print(f"  {course_dir.name}: (no finished chapters yet)")
            continue
        course = json.loads(course_path.read_text())
        chapters = ", ".join(
            f"{c['number']}{' (draft)' if c.get('draft') else ''}" for c in course["chapters"]
        )
        linked = "graph" if (course_dir / "graph.json").exists() else "no graph"
        print(f"  {course['id']}: {course['title']} — chapters {chapters or 'none'}; {linked}")


def main() -> None:
    # `bookmarks` keeps its own argument parser.
    if len(sys.argv) > 1 and sys.argv[1] == "bookmarks":
        raise SystemExit(bookmarks.main(sys.argv[2:]))

    parser = argparse.ArgumentParser(
        prog="curio", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="command", required=True)

    def add(name: str, func, help: str) -> argparse.ArgumentParser:
        p = sub.add_parser(name, help=help)
        p.add_argument("--library", help="Library directory (default: $CURIO_LIBRARY or ~/Curio)")
        p.set_defaults(func=func)
        return p

    p = add("inspect", cmd_inspect, "List chapters in a PDF's bookmark table")
    p.add_argument("pdf")

    for name, func, help in (
        ("extract", cmd_extract, "Extract a chapter and write its structuring tasks"),
        ("draft", cmd_draft, "Extract a chapter as a no-AI reading draft"),
    ):
        p = add(name, func, help)
        p.add_argument("pdf")
        p.add_argument("--chapter", type=int, required=True)
        p.add_argument("--course", help="Course slug (default: slugified book title)")

    p = add("check-batch", cmd_check_batch, "Check one structuring answer")
    p.add_argument("answer")

    for name, func, help in (
        ("assemble", cmd_assemble, "Check and merge a chapter's structuring answers"),
        ("finalize", cmd_finalize, "Combine sections and concepts into the chapter"),
    ):
        p = add(name, func, help)
        p.add_argument("--course", required=True)
        p.add_argument("--chapter", type=int, required=True)

    for name, func, help in (
        ("link-prepare", cmd_link_prepare, "Write the concept index for the graph linker"),
        ("link-apply", cmd_link_apply, "Validate the linker's edges into graph.json"),
    ):
        p = add(name, func, help)
        p.add_argument("--course", required=True)

    add("weave-prepare", cmd_weave_prepare, "Write every course's concepts for cross-course weaving")
    add("weave-apply", cmd_weave_apply, "Validate the weaver's bridges into web.json")
    add("library", cmd_library, "List ingested courses (creates the library if needed)")
    sub.add_parser("bookmarks", help="Add a chapter bookmark table from the printed contents")

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
