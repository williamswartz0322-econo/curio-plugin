"""Knowledge graph construction (memo §2.5).

Extracts typed, probabilistic edges between the concepts of every ingested
chapter. Cross-chapter by design — the value is in dependencies that span the
book, which is exactly what a single-chapter view cannot see.

Every edge carries a confidence and supporting evidence, per the memo's
insistence that the graph be treated as probabilistic rather than authoritative.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

EdgeType = Literal[
    "prerequisite_of",
    "builds_on",
    "contrasts_with",
    "commonly_confused_with",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Edge(StrictModel):
    source: str
    target: str
    type: EdgeType
    confidence: Literal["low", "medium", "high"]
    evidence: str


class EdgeList(StrictModel):
    edges: list[Edge]


class Graph(StrictModel):
    course: str
    generated_at: str
    edges: list[Edge]


# The linking prompt lives in agents/graph-linker.md; this module prepares its
# input and validates its answer.


def _concept_index(course_dir: Path) -> list[dict]:
    """Every concept across the course, in reading order, with position metadata."""
    course_path = course_dir / "course.json"
    course = json.loads(course_path.read_text())
    index: list[dict] = []

    for entry in sorted(course["chapters"], key=lambda c: c["number"]):
        chapter_path = course_dir / "chapters" / f"{entry['id']}.json"
        if not chapter_path.exists():
            continue
        chapter = json.loads(chapter_path.read_text())
        section_pos = {s["id"]: i for i, s in enumerate(chapter["sections"])}

        for concept in chapter["concepts"]:
            if concept["id"] == "draft-placeholder":
                continue
            positions = [section_pos[s] for s in concept["section_ids"] if s in section_pos]
            index.append(
                {
                    "key": f"{chapter['id']}:{concept['id']}",
                    "name": concept["name"],
                    "description": concept["description"],
                    "chapter": chapter["id"],
                    "chapter_number": chapter["number"],
                    "chapter_title": chapter["title"],
                    "position": min(positions) if positions else 999,
                }
            )
    index.sort(key=lambda c: (c["chapter_number"], c["position"]))
    return index


def _payload(index: list[dict]) -> str:
    lines: list[str] = []
    current_chapter: Optional[str] = None
    for concept in index:
        if concept["chapter"] != current_chapter:
            current_chapter = concept["chapter"]
            lines.append(
                f"\n## Chapter {concept['chapter_number']}: {concept['chapter_title']} "
                f"({concept['chapter']})"
            )
        lines.append(f"{concept['key']} — {concept['name']}: {concept['description']}")
    return "\n".join(lines)


def prepare(course_dir: Path) -> tuple[str, int]:
    """The concept index the graph-linker agent reads, and the concept count."""
    index = _concept_index(course_dir)
    if len(index) < 2:
        raise ValueError("need at least two concepts to build a graph")
    return _payload(index), len(index)


def apply(course_dir: Path, course_id: str, edges_json: str) -> tuple[Graph, dict]:
    """Validate the agent's edges and return the graph plus what was dropped."""
    index = _concept_index(course_dir)
    order = {c["key"]: i for i, c in enumerate(index)}
    valid = set(order)
    raw = EdgeList.model_validate_json(edges_json)

    kept: list[Edge] = []
    dropped = {"unknown_key": 0, "self": 0, "backward": 0, "duplicate_concept": 0, "repeat": 0}
    seen: set[tuple[str, str, str]] = set()

    for edge in raw.edges:
        if edge.source not in valid or edge.target not in valid:
            dropped["unknown_key"] += 1
            continue
        if edge.source == edge.target:
            dropped["self"] += 1
            continue
        # Each chapter carries its own concept list, so a concept the book
        # develops across several chapters appears more than once. An edge
        # between those copies reflects the duplication, not a dependency.
        if edge.source.split(":", 1)[1] == edge.target.split(":", 1)[1]:
            dropped["duplicate_concept"] += 1
            continue
        # A textbook builds in sequence: dependencies cannot point backward.
        if edge.type in ("prerequisite_of", "builds_on") and order[edge.source] >= order[edge.target]:
            dropped["backward"] += 1
            continue
        signature = (edge.source, edge.target, edge.type)
        if signature in seen:
            dropped["repeat"] += 1
            continue
        seen.add(signature)
        kept.append(edge)

    from datetime import datetime, timezone

    graph = Graph(course=course_id, generated_at=datetime.now(timezone.utc).isoformat(), edges=kept)
    return graph, dropped
