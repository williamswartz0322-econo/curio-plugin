from pathlib import Path

from curio_pipeline import tasks
from curio_pipeline.extract import RawChapter, TocEntry


def raw_chapter() -> RawChapter:
    pages = "\n\n".join(f"[[page {p}]]\n" + ("word " * 800) for p in range(10, 20))
    return RawChapter(
        number=1, title="T", start_page=10, end_page=19, text=pages,
        sections=[TocEntry(2, "1.1 A", 10), TocEntry(2, "1.2 B", 15)], figures=[],
    )


def test_rerun_keeps_finished_answers_when_the_plan_is_unchanged(tmp_path: Path):
    course = tmp_path / "c"
    book = {"title": "B", "author": "", "pages": 30, "pdf": "b.pdf"}
    first = tasks.write_tasks(raw_chapter(), course, course="c", book=book)
    answer = Path(first["batches"][0]["output"])
    answer.write_text("=== section 1.1 | A\n--- paragraph p10\nword\n")

    second = tasks.write_tasks(raw_chapter(), course, course="c", book=book)
    assert [b["output"] for b in second["batches"]] == [b["output"] for b in first["batches"]]
    assert answer.exists(), "a finished answer must survive a re-run of extract"
    assert Path(second["batches"][0]["task"]).exists()


def test_rerun_discards_answers_when_the_plan_changes(tmp_path: Path, monkeypatch):
    course = tmp_path / "c"
    book = {"title": "B", "author": "", "pages": 30, "pdf": "b.pdf"}
    first = tasks.write_tasks(raw_chapter(), course, course="c", book=book)
    answer = Path(first["batches"][0]["output"])
    answer.write_text("stale")
    monkeypatch.setattr(tasks, "BATCH_CHAR_BUDGET", 3_000)
    tasks.write_tasks(raw_chapter(), course, course="c", book=book)
    assert not answer.exists() or answer.read_text() != "stale"
