"""Typed educational objects — the contract between the pipeline and the reader app.

Mirrored on the TypeScript side in app/src/lib/content.ts. Keep in sync.
"""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

BlockType = Literal[
    "paragraph",
    "definition",
    "principle",
    "example",
    "worked_example",
    "equation",
    "figure",
    "table",
    "exercise",
    "aside",
]


class StrictModel(BaseModel):
    # extra="forbid" also puts additionalProperties: false in the JSON schema,
    # which structured outputs require on every object.
    model_config = ConfigDict(extra="forbid")


class Block(StrictModel):
    id: str
    type: BlockType
    md: str
    page: int
    term: Optional[str]
    label: Optional[str]
    image: Optional[str]


class Section(StrictModel):
    id: str
    number: str
    title: str
    blocks: list[Block]


class Concept(StrictModel):
    id: str
    name: str
    description: str
    section_ids: list[str]


class SectionList(StrictModel):
    """Response shape when a long chapter is structured a few sections at a time."""

    sections: list[Section]


class ConceptList(StrictModel):
    """Response shape for the concept pass, which always sees the whole chapter."""

    concepts: list[Concept]


class Chapter(StrictModel):
    id: str
    number: int
    title: str
    start_page: int
    end_page: int
    sections: list[Section]
    concepts: list[Concept]
