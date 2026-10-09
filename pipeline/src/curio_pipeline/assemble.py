"""Check, merge, and finalize agent-written chapter structure.

    check-batch  one batch's markup: parse, content checks, coverage of its pages
    assemble     every batch: merge, renumber, chapter coverage -> sections.json + outline.md
    finalize     sections + the concept agent's concepts.json -> chapters/chNN.json

Coverage is the guard the API's max_tokens check used to be: an agent that
stops early, skips a passage, or summarizes instead of transcribing leaves
words of the source behind, and the multiset overlap of words catches it.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from pydantic import ValidationError

from . import markup
from .schema import Chapter, ConceptList, Section, SectionList
from .structure import _pages, _renumber, outline
from .tasks import CONTINUED_TITLE

# Running heads, page numbers, and figure labels that leak into the text
# stream are rightly dropped, so faithful output still loses a few percent.
BATCH_COVERAGE_ERROR = 0.80
BATCH_COVERAGE_WARN = 0.90
# A batch boundary page is shared: the earlier batch finishes its last section
# there and the later one starts after the next heading. If both skip their
# part, per-batch coverage can't see it, so boundary pages are checked on the
# merged chapter with 5-word shingles. Faithful pages, even math-heavy ones,
# score above ~0.45; a dropped page scores near zero.
BOUNDARY_SHINGLE_MIN = 0.30
BOUNDARY_MIN_SHINGLES = 40
MIN_CONCEPTS = 3
MAX_CONCEPTS = 30
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
LATEX_COMMAND_RE = re.compile(r"\\[A-Za-z]+")
WORD_RE = re.compile(r"[a-z]{3,}")


def words(text: str) -> Counter:
    """Comparable words: page markers, LaTeX commands, and line-break hyphens removed."""
    text = re.sub(r"\[\[page \d+\]\]", " ", text)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    text = LATEX_COMMAND_RE.sub(" ", text)
    return Counter(WORD_RE.findall(text.lower()))


def shingles(text: str, n: int = 5) -> set[tuple[str, ...]]:
    text = re.sub(r"\[\[page \d+\]\]", " ", text)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    text = LATEX_COMMAND_RE.sub(" ", text)
    w = re.findall(r"[a-z]{2,}", text.lower())
    return {tuple(w[i : i + n]) for i in range(max(len(w) - n + 1, 0))}


def coverage(source: Counter, output: Counter) -> float:
    total = sum(source.values())
    if total == 0:
        return 1.0
    return sum(min(n, output[w]) for w, n in source.items()) / total


def _source_text(manifest: dict, first: int, last: int) -> str:
    raw = Path(manifest["raw_text"]).read_text()
    return "\n".join(body for page, body in _pages(raw) if first <= page <= last)


def _section_text(sections: list[Section]) -> str:
    return "\n".join(
        " ".join(filter(None, [s.number, s.title]))
        + "\n"
        + "\n".join(" ".join(filter(None, [b.term, b.label, b.md])) for b in s.blocks)
        for s in sections
    )


@dataclass
class BatchReport:
    batch: int
    output: str
    sections: list[Section] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    coverage: float | None = None

    @property
    def ok(self) -> bool:
        return not self.errors

    def render(self) -> str:
        head = f"batch {self.batch}: " + ("OK" if self.ok else f"{len(self.errors)} error(s)")
        if self.coverage is not None:
            head += f", coverage {self.coverage:.0%}"
        lines = [head]
        lines += [f"  error: {e}" for e in self.errors]
        lines += [f"  warning: {w}" for w in self.warnings]
        return "\n".join(lines)


def load_manifest(work_dir: Path) -> dict:
    path = work_dir / "manifest.json"
    if not path.exists():
        raise SystemExit(f"no manifest at {path} — run `curio extract` first")
    return json.loads(path.read_text())


def check_batch(manifest: dict, batch: dict) -> BatchReport:
    report = BatchReport(batch=batch["index"], output=batch["output"])
    out_path = Path(batch["output"])
    if not out_path.exists():
        report.errors.append(f"answer file not written yet: {out_path}")
        return report

    chapter = manifest["chapter"]
    parsed = markup.check(
        markup.parse(out_path.read_text()),
        first_page=chapter["start_page"],
        last_page=chapter["end_page"],
        figure_paths={f["path"] for f in manifest["figures"]},
    )
    report.sections = parsed.sections
    report.errors += parsed.errors
    report.warnings += parsed.warnings

    # A later batch's first page may open with the tail of the previous
    # batch's section, which it rightly skips, so those words count only when
    # transcribed. The first batch has no predecessor: its first page counts.
    first, last = batch["first_page"], batch["last_page"]
    output = words(_section_text(parsed.sections))
    source = words(_source_text(manifest, first, last))
    skipped = 0
    if batch["index"] > 1:
        opening = words(_source_text(manifest, first, first))
        skipped = sum(opening.values()) - sum((opening & output).values())
    total = sum(source.values()) - skipped
    report.coverage = sum((source & output).values()) / total if total > 0 else 1.0
    if report.coverage < BATCH_COVERAGE_ERROR:
        report.errors.append(
            f"only {report.coverage:.0%} of the words on pages {batch['first_page']}-"
            f"{batch['last_page']} appear in the answer — text was dropped, summarized, or "
            f"the answer stops early. Transcribe every sentence of the owned pages."
        )
    elif report.coverage < BATCH_COVERAGE_WARN:
        report.warnings.append(
            f"coverage {report.coverage:.0%} — check nothing was skipped beyond running "
            f"heads, page numbers, and figure labels"
        )
    return report


def find_batch(output: Path) -> tuple[dict, dict]:
    manifest = load_manifest(output.parent)
    for batch in manifest["batches"]:
        if Path(batch["output"]).resolve() == output.resolve():
            return manifest, batch
    raise SystemExit(f"{output} is not an output listed in {output.parent / 'manifest.json'}")


def _same_text(a: str, b: str) -> bool:
    wa, wb = words(a), words(b)
    if not wa or not wb:
        return " ".join(a.split()) == " ".join(b.split())
    shared = sum((wa & wb).values())
    return shared / max(sum(wa.values()), sum(wb.values())) >= 0.9


def _drop_overlap(
    previous: list[Section], current: list[Section], boundary_page: int | None
) -> list[Section]:
    """Drop blocks at the start of a batch that repeat the previous batch's tail.

    Batches share their boundary page, and text near it can be transcribed by
    both — sometimes several whole sections. The earlier batch owns it.
    """
    tail = [b.md for s in previous[-2:] for b in s.blocks]
    if boundary_page is not None:
        tail += [b.md for s in previous for b in s.blocks if b.page >= boundary_page]
    for section in current:
        while section.blocks and any(_same_text(section.blocks[0].md, t) for t in tail):
            section.blocks.pop(0)
        if section.blocks:
            break
    return [s for s in current if s.blocks]


def _merge(batches: list[list[Section]], first_pages: list[int] | None = None) -> list[Section]:
    """Join the batches, rejoining any section split across a boundary."""
    merged: list[Section] = []
    for k, sections in enumerate(batches):
        if merged:
            sections = _drop_overlap(merged, sections, first_pages[k] if first_pages else None)
        for section in sections:
            prev = merged[-1] if merged else None
            if prev and (
                section.title == CONTINUED_TITLE
                or (section.number and section.number == prev.number)
                or (section.number, section.title) == (prev.number, prev.title)
            ):
                prev.blocks.extend(section.blocks)
                continue
            merged.append(section)
    return merged


def assemble(work_dir: Path) -> tuple[list[BatchReport], list[Section] | None]:
    manifest = load_manifest(work_dir)
    reports = [check_batch(manifest, b) for b in manifest["batches"]]
    if not all(r.ok for r in reports):
        return reports, None

    chapter_id = manifest["chapter"]["id"]
    sections = _renumber(
        _merge([r.sections for r in reports], [b["first_page"] for b in manifest["batches"]]),
        chapter_id,
    )
    if not _check_boundaries(manifest, reports, sections):
        return reports, None
    (work_dir / "sections.json").write_text(
        SectionList(sections=sections).model_dump_json(indent=2)
    )
    ch = manifest["chapter"]
    (work_dir / "outline.md").write_text(
        f"Chapter {ch['number']}: {ch['title']}\n\n<outline>\n{outline(sections)}\n</outline>\n"
    )
    return reports, sections


def _check_boundaries(manifest: dict, reports: list[BatchReport], sections: list[Section]) -> bool:
    output = shingles(_section_text(sections))
    ok = True
    for prev, report, batch in zip(reports, reports[1:], manifest["batches"][1:]):
        page = batch["first_page"]
        source = shingles(_source_text(manifest, page, page))
        if len(source) < BOUNDARY_MIN_SHINGLES:
            continue
        found = len(source & output) / len(source)
        if found < BOUNDARY_SHINGLE_MIN:
            ok = False
            prev.errors.append(
                f"page {page}, where this batch hands over to batch {report.batch}, is mostly "
                f"missing from the chapter ({found:.0%} found). This batch's last section "
                f"continues onto page {page}: transcribe it to its end, up to the next "
                f"section's heading."
            )
    return ok


def chapter_coverage(work_dir: Path, sections: list[Section]) -> float:
    manifest = load_manifest(work_dir)
    ch = manifest["chapter"]
    return coverage(
        words(_source_text(manifest, ch["start_page"], ch["end_page"])),
        words(_section_text(sections)),
    )


def finalize(work_dir: Path, course_dir: Path) -> tuple[Chapter | None, list[str]]:
    manifest = load_manifest(work_dir)
    errors: list[str] = []
    sections_path = work_dir / "sections.json"
    concepts_path = work_dir / "concepts.json"
    if not sections_path.exists():
        return None, ["no sections.json — run `curio assemble` first"]
    if not concepts_path.exists():
        return None, [f"no concepts.json — the concept agent writes it to {concepts_path}"]

    sections = SectionList.model_validate_json(sections_path.read_text()).sections
    try:
        concepts = ConceptList.model_validate_json(concepts_path.read_text()).concepts
    except ValidationError as err:
        return None, [f"concepts.json does not match the schema: {err}"]

    section_ids = {s.id for s in sections}
    seen: set[str] = set()
    for c in concepts:
        if not SLUG_RE.match(c.id):
            errors.append(f"concept id {c.id!r} is not a kebab-case slug")
        if c.id in seen:
            errors.append(f"duplicate concept id {c.id!r}")
        seen.add(c.id)
        unknown = [s for s in c.section_ids if s not in section_ids]
        if unknown:
            errors.append(f"concept {c.id!r} cites unknown section ids {unknown}")
    if not (MIN_CONCEPTS <= len(concepts) <= MAX_CONCEPTS):
        errors.append(f"{len(concepts)} concepts — expected 8-20 (accepting {MIN_CONCEPTS}-{MAX_CONCEPTS})")
    if errors:
        return None, errors

    ch = manifest["chapter"]
    chapter = Chapter(
        id=ch["id"],
        number=ch["number"],
        title=ch["title"],
        start_page=ch["start_page"],
        end_page=ch["end_page"],
        sections=sections,
        concepts=concepts,
    )
    chapters_dir = course_dir / "chapters"
    chapters_dir.mkdir(exist_ok=True)
    (chapters_dir / f"{chapter.id}.json").write_text(chapter.model_dump_json(indent=2))
    update_course_json(course_dir, manifest["course"], manifest["book"], chapter, draft=False)
    return chapter, []


def update_course_json(course_dir: Path, slug: str, book: dict, chapter: Chapter, draft: bool) -> None:
    course_path = course_dir / "course.json"
    course = (
        json.loads(course_path.read_text())
        if course_path.exists()
        else {
            "id": slug,
            "title": book["title"],
            "author": book["author"],
            "source_pdf": book["pdf"],
            "chapters": [],
        }
    )
    entry = {
        "id": chapter.id,
        "number": chapter.number,
        "title": chapter.title,
        "draft": draft,
        "ingested": date.today().isoformat(),
    }
    course["chapters"] = [c for c in course["chapters"] if c["id"] != chapter.id] + [entry]
    course["chapters"].sort(key=lambda c: c["number"])
    course_path.write_text(json.dumps(course, indent=2))
