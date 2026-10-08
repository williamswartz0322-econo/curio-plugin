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
