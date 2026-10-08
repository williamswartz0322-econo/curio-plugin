"""Cross-course concept weaving (roadmap phase L).

Finds the bridges BETWEEN subjects — the edges no single course's graph can
contain. Within-course structure stays in each course's graph.json; this pass
only proposes links whose endpoints live in different courses.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict

WeaveType = Literal["same_idea", "structural_analogy", "applies"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WeaveEdge(StrictModel):
    source: str
    target: str
    type: WeaveType
    confidence: Literal["low", "medium", "high"]
    evidence: str


class WeaveEdgeList(StrictModel):
    edges: list[WeaveEdge]


class Web(StrictModel):
    generated_at: str
    edges: list[WeaveEdge]


# The weaving prompt lives in agents/graph-linker.md; this module prepares its
# input and validates its answer.


def _all_concepts(content_dir: Path) -> list[dict]:
    out: list[dict] = []
    courses_dir = content_dir / "courses"
    for course_dir in sorted(courses_dir.iterdir()):
        course_file = course_dir / "course.json"
        if not course_file.exists():
            continue
        course = json.loads(course_file.read_text())
        for entry in sorted(course["chapters"], key=lambda c: c["number"]):
            chapter_file = course_dir / "chapters" / f"{entry['id']}.json"
            if not chapter_file.exists():
                continue
            chapter = json.loads(chapter_file.read_text())
            for concept in chapter["concepts"]:
                if concept["id"] == "draft-placeholder":
                    continue
                out.append(
                    {
                        "key": f"{course['id']}/{chapter['id']}:{concept['id']}",
                        "course": course["id"],
                        "course_title": course["title"],
                        "name": concept["name"],
                        "description": concept["description"],
                    }
                )
    return out


def prepare(content_dir: Path) -> tuple[str, int]:
    """Every concept grouped by course, for the agent; and the course count."""
    concepts = _all_concepts(content_dir)
    courses = sorted({c["course"] for c in concepts})
    if len(courses) < 2:
        raise ValueError("weaving needs at least two courses")
    lines: list[str] = []
    current = None
    for concept in concepts:
        if concept["course"] != current:
            current = concept["course"]
            lines.append(f"\n## {concept['course_title']} ({concept['course']})")
        lines.append(f"{concept['key']} — {concept['name']}: {concept['description']}")
    return "\n".join(lines), len(courses)


def apply(content_dir: Path, edges_json: str) -> tuple[Web, int]:
    """Validate the agent's bridges; returns the web and how many were dropped."""
    concepts = _all_concepts(content_dir)
    raw = WeaveEdgeList.model_validate_json(edges_json)
    valid = {c["key"]: c["course"] for c in concepts}
    kept: list[WeaveEdge] = []
    seen: set[tuple[str, str]] = set()
    dropped = 0
    for edge in raw.edges:
        if edge.source not in valid or edge.target not in valid:
            dropped += 1
            continue
        if valid[edge.source] == valid[edge.target]:
            dropped += 1  # within-course links belong to graph.json
            continue
        signature = tuple(sorted((edge.source, edge.target)))
        if signature in seen:
            continue
        seen.add(signature)
        kept.append(edge)
    return Web(generated_at=datetime.now(timezone.utc).isoformat(), edges=kept), dropped
