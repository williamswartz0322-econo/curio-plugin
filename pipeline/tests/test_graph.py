import json
from pathlib import Path

import pytest

from curio_pipeline import graph, weave


def write_course(root: Path, course_id: str, chapters: dict[str, list[str]]) -> Path:
    course_dir = root / "courses" / course_id
    (course_dir / "chapters").mkdir(parents=True)
    entries = []
    for n, (ch, concepts) in enumerate(chapters.items(), start=1):
        entries.append({"id": ch, "number": n, "title": ch, "draft": False, "ingested": "2026-01-01"})
        (course_dir / "chapters" / f"{ch}.json").write_text(json.dumps({
            "id": ch, "number": n, "title": ch, "start_page": 1, "end_page": 2,
            "sections": [{"id": f"{ch}-s01", "number": "1", "title": "S", "blocks": []}],
            "concepts": [
                {"id": c, "name": c, "description": c, "section_ids": [f"{ch}-s01"]} for c in concepts
            ],
        }))
    (course_dir / "course.json").write_text(json.dumps(
        {"id": course_id, "title": course_id, "author": "", "source_pdf": "", "chapters": entries}))
    return course_dir


def edge(source, target, type="prerequisite_of"):
    return {"source": source, "target": target, "type": type, "confidence": "high", "evidence": "e"}


def test_link_apply_enforces_structure(tmp_path):
    course_dir = write_course(tmp_path, "c", {"ch01": ["mean", "variance"], "ch02": ["mean", "ols"]})
    payload, count = graph.prepare(course_dir)
    assert count == 4 and "ch02:ols" in payload
    result, dropped = graph.apply(course_dir, "c", json.dumps({"edges": [
        edge("ch01:mean", "ch02:ols"),
        edge("ch02:ols", "ch01:mean"),  # backward
        edge("ch01:mean", "ch02:mean"),  # same concept across chapters
        edge("ch01:mean", "ch09:nope"),  # unknown key
        edge("ch01:mean", "ch02:ols"),  # repeat
        edge("ch02:ols", "ch01:variance", "contrasts_with"),  # either direction is fine
    ]}))
    assert [(e.source, e.target) for e in result.edges] == [
        ("ch01:mean", "ch02:ols"), ("ch02:ols", "ch01:variance")]
    assert dropped == {"unknown_key": 1, "self": 0, "backward": 1, "duplicate_concept": 1, "repeat": 1}


def test_link_prepare_needs_two_concepts(tmp_path):
    course_dir = write_course(tmp_path, "c", {"ch01": ["only"]})
    with pytest.raises(ValueError):
        graph.prepare(course_dir)


def test_weave_keeps_only_cross_course_bridges(tmp_path):
    write_course(tmp_path, "econ", {"ch01": ["slope"]})
    write_course(tmp_path, "calc", {"ch01": ["derivative", "limit"]})
    payload, courses = weave.prepare(tmp_path)
    assert courses == 2
    web, dropped = weave.apply(tmp_path, json.dumps({"edges": [
        {**edge("econ/ch01:slope", "calc/ch01:derivative", "same_idea")},
        {**edge("calc/ch01:limit", "calc/ch01:derivative", "applies")},
        {**edge("calc/ch01:derivative", "econ/ch01:slope", "same_idea")},
    ]}))
    assert len(web.edges) == 1 and dropped == 1
