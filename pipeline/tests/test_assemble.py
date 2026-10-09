import json
from pathlib import Path

from curio_pipeline import assemble
from curio_pipeline.schema import Block, Section

RAW = (
    "[[page 10]]\nThe market for apartments is a running example in this chapter.\n\n"
    "[[page 11]]\nDemand curves slope downward because people value apartments differently.\n\n"
    "[[page 12]]\nThe equilibrium price clears the market when supply equals demand.\n"
)


def make_work(tmp_path: Path, batches: list[tuple[int, int, str]]) -> Path:
    course = tmp_path / "courses" / "c"
    work = course / "work" / "ch01"
    work.mkdir(parents=True)
    (course / "raw").mkdir()
    (course / "raw" / "ch01.txt").write_text(RAW)
    entries = []
    for i, (first, last, answer) in enumerate(batches, start=1):
        out = work / f"batch-{i:02d}.blocks.txt"
        out.write_text(answer)
        entries.append(
            {"index": i, "first_page": first, "last_page": last, "wanted": [], "task": "", "output": str(out)}
        )
    manifest = {
        "course": "c",
        "book": {"title": "Book", "author": "A", "pages": 30, "pdf": "b.pdf"},
        "chapter": {"id": "ch01", "number": 1, "title": "The Market", "start_page": 10, "end_page": 12},
        "raw_text": str(course / "raw" / "ch01.txt"),
        "figures": [],
        "batches": entries,
    }
    (work / "manifest.json").write_text(json.dumps(manifest))
    return work


FULL_1 = (
    "=== section 1.1 | The Market\n"
    "--- paragraph p10\nThe market for apartments is a running example in this chapter.\n"
    "--- paragraph p11\nDemand curves slope downward because people value apartments differently.\n"
)
FULL_2 = (
    "=== section 1.1 | (continued)\n"
    "--- paragraph p11\nDemand curves slope downward because people value apartments differently.\n"
    "--- paragraph p12\nThe equilibrium price clears the market when supply equals demand.\n"
)


def test_truncated_answer_fails_coverage(tmp_path):
    work = make_work(tmp_path, [(10, 12, "=== section 1.1 | The Market\n--- paragraph p10\nThe market.\n")])
    reports, sections = assemble.assemble(work)
    assert sections is None
    assert "text was dropped" in reports[0].errors[0]


def test_merge_drops_boundary_duplicates_and_joins_continuations(tmp_path):
    work = make_work(tmp_path, [(10, 11, FULL_1), (12, 12, FULL_2)])
    reports, sections = assemble.assemble(work)
    assert sections is not None, [r.render() for r in reports]
    assert len(sections) == 1
    assert [b.page for b in sections[0].blocks] == [10, 11, 12]
    assert [b.id for b in sections[0].blocks] == ["ch01-s01-b001", "ch01-s01-b002", "ch01-s01-b003"]
    assert (work / "outline.md").exists()


def test_same_number_different_title_merges():
    a = Section(id="s01", number="1.3", title="Some Examples", blocks=[
        Block(id="x", type="paragraph", md="alpha beta gamma", page=1, term=None, label=None, image=None)])
    b = Section(id="s01", number="1.3", title="Example continued", blocks=[
        Block(id="y", type="paragraph", md="delta epsilon zeta", page=2, term=None, label=None, image=None)])
    merged = assemble._merge([[a], [b]])
    assert len(merged) == 1 and len(merged[0].blocks) == 2


def test_finalize_validates_concepts(tmp_path):
    work = make_work(tmp_path, [(10, 11, FULL_1), (12, 12, FULL_2)])
    assemble.assemble(work)
    course_dir = work.parent.parent
    (work / "concepts.json").write_text(json.dumps({"concepts": [
        {"id": "Bad Id", "name": "x", "description": "y", "section_ids": ["ch01-s09"]}]}))
    chapter, errors = assemble.finalize(work, course_dir)
    assert chapter is None
    assert any("kebab-case" in e for e in errors)
    assert any("unknown section ids" in e for e in errors)

    concepts = [
        {"id": f"concept-{i}", "name": f"C{i}", "description": "d", "section_ids": ["ch01-s01"]}
        for i in range(8)
    ]
    (work / "concepts.json").write_text(json.dumps({"concepts": concepts}))
    chapter, errors = assemble.finalize(work, course_dir)
    assert not errors and chapter is not None
    course = json.loads((course_dir / "course.json").read_text())
    assert course["chapters"][0]["draft"] is False
    assert (course_dir / "chapters" / "ch01.json").exists()


def test_dropped_boundary_page_is_caught(tmp_path):
    # Page 12 is shared: batch 1's section ends there, batch 2's starts after
    # a heading. If batch 1 stops at its last full page and batch 2 rightly
    # skips the previous section's tail, per-batch coverage passes but the
    # text is gone. The merged-chapter shingle check must blame batch 1.
    words = [f"word{chr(97 + i % 26)}{chr(97 + i // 26 % 26)}" for i in range(400)]
    tail = " ".join(words[:300])
    head = " ".join(words[300:])
    raw = (
        "[[page 11]]\n" + " ".join(f"opening{chr(97 + i % 26)}" for i in range(60)) + "\n\n"
        f"[[page 12]]\n{tail}\n1.2 Next\n{head}\n"
    )
    course = tmp_path / "courses" / "c"
    work = course / "work" / "ch01"
    work.mkdir(parents=True)
    (course / "raw").mkdir()
    (course / "raw" / "ch01.txt").write_text(raw)
    page11 = " ".join(f"opening{chr(97 + i % 26)}" for i in range(60))
    answers = [
        (11, 11, f"=== section 1.1 | First\n--- paragraph p11\n{page11}\n"),
        (12, 12, f"=== section 1.2 | Next\n--- paragraph p12\n{head}\n"),
    ]
    entries = []
    for i, (first, last, answer) in enumerate(answers, start=1):
        out = work / f"batch-{i:02d}.blocks.txt"
        out.write_text(answer)
        entries.append({"index": i, "first_page": first, "last_page": last, "wanted": [], "task": "", "output": str(out)})
    (work / "manifest.json").write_text(json.dumps({
        "course": "c", "book": {"title": "B", "author": "", "pages": 20, "pdf": "b.pdf"},
        "chapter": {"id": "ch01", "number": 1, "title": "T", "start_page": 11, "end_page": 12},
        "raw_text": str(course / "raw" / "ch01.txt"), "figures": [], "batches": entries,
    }))
    reports, sections = assemble.assemble(work)
    assert sections is None
    assert "page 12" in reports[0].errors[0] and reports[1].ok

    # Once batch 1 finishes its section on page 12, the chapter assembles.
    (work / "batch-01.blocks.txt").write_text(
        f"=== section 1.1 | First\n--- paragraph p11\n{page11}\n--- paragraph p12\n{tail}\n"
    )
    reports, sections = assemble.assemble(work)
    assert sections is not None, [r.render() for r in reports]


def test_first_page_of_the_chapter_counts(tmp_path):
    # Batch 1 has no predecessor, so skipping its first page is a real loss.
    page10 = " ".join(f"alpha{chr(97 + i % 26)}{chr(97 + i // 26)}" for i in range(200))
    raw_answer = "=== section 1.1 | The Market\n--- paragraph p11\nDemand curves slope downward because people value apartments differently.\n"
    work = make_work(tmp_path, [(10, 11, raw_answer)])
    (work.parent.parent / "raw" / "ch01.txt").write_text(
        f"[[page 10]]\n{page10}\n\n[[page 11]]\nDemand curves slope downward because people value apartments differently.\n"
    )
    reports, sections = assemble.assemble(work)
    assert sections is None
    assert "text was dropped" in reports[0].errors[0]
