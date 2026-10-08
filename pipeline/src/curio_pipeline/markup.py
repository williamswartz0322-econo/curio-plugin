"""Block markup: the plain-text format structuring agents write.

Agents used to return chapter JSON through the API's structured outputs. Inside
Claude Code they write files instead, and hand-written JSON is a trap for math:
"\\frac", "\\beta", "\\theta" and "\\rho" are valid JSON escapes, so a missed
backslash silently turns LaTeX into control characters. This markup has no
escaping at all — the block body is taken verbatim.

    === section 1.1 | The Market
    --- paragraph p12
    Verbatim text with $p^*$ ...
    --- definition p12 term="Reservation price"
    ...
    --- figure p13 label="Figure 1.1" image="figures/ch01/p013-f1.png"
    Caption text

A section header with no number is written `=== section | Introduction`.
Attribute values are double-quoted; write a literal quote inside one as \\".
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import get_args

from .schema import Block, BlockType, Section

BLOCK_TYPES: tuple[str, ...] = get_args(BlockType)

SECTION_RE = re.compile(r"^=== section(?:\s+(?P<number>[^|]*?))?\s*\|\s*(?P<title>.+?)\s*$")
BLOCK_RE = re.compile(
    r"^--- (?P<type>[a-z_]+) p(?P<page>\d+)(?P<attrs>(?:\s+[a-z]+=\"(?:[^\"\\]|\\.)*\")*)\s*$"
)
ATTR_RE = re.compile(r"([a-z]+)=\"((?:[^\"\\]|\\.)*)\"")
ATTR_NAMES = {"term", "label", "image"}
# Anything below space except newline and tab is an extraction or escaping accident.
CONTROL_RE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
# A dollar sign that is not escaped as \$.
UNESCAPED_DOLLAR_RE = re.compile(r"(?<!\\)\$")


@dataclass
class ParseResult:
    sections: list[Section] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _unquote(value: str) -> str:
    return value.replace('\\"', '"')


def parse(text: str) -> ParseResult:
    """Parse markup into Sections with provisional ids (assemble renumbers them)."""
    result = ParseResult()
    section: Section | None = None
    block: dict | None = None
    body: list[str] = []

    def close_block() -> None:
        nonlocal block, body
        if block is None:
            return
        md = "\n".join(body).strip("\n").strip()
        line = block.pop("_line")
        if section is None:
            result.errors.append(f"line {line}: block appears before any section header")
        else:
            block["md"] = md
            block["id"] = f"{section.id}-b{len(section.blocks) + 1:03d}"
            section.blocks.append(Block(**block))
        block, body = None, []

    # Split on newlines only: str.splitlines() also breaks on form feeds and
    # other control characters, which would hide exactly the "\f" a mangled
    # "\frac" leaves behind.
    for lineno, line in enumerate(text.split("\n"), start=1):
        line = line.removesuffix("\r")
        if line.startswith("=== "):
            close_block()
            m = SECTION_RE.match(line)
            if not m:
                result.errors.append(f"line {lineno}: malformed section header: {line!r}")
                section = None
                continue
            section = Section(
                id=f"s{len(result.sections) + 1:02d}",
                number=(m.group("number") or "").strip(),
                title=m.group("title"),
                blocks=[],
            )
            result.sections.append(section)
            continue

        if line.startswith("--- "):
            m = BLOCK_RE.match(line)
            if m:
                close_block()
                kind = m.group("type")
                if kind not in BLOCK_TYPES:
                    result.errors.append(
                        f"line {lineno}: unknown block type {kind!r} "
                        f"(use one of: {', '.join(BLOCK_TYPES)})"
                    )
                    kind = "paragraph"
                attrs = {"term": None, "label": None, "image": None}
                for name, value in ATTR_RE.findall(m.group("attrs") or ""):
                    if name not in ATTR_NAMES:
                        result.errors.append(f"line {lineno}: unknown attribute {name!r}")
                        continue
                    attrs[name] = _unquote(value)
                block = {"type": kind, "page": int(m.group("page")), "_line": lineno, **attrs}
                continue
            if re.match(r"^--- [a-z_]+ ", line):
                result.errors.append(f"line {lineno}: malformed block header: {line!r}")
                continue

        if block is None:
            if line.strip():
                result.errors.append(
                    f"line {lineno}: text outside any block (start one with '--- paragraph pN')"
                )
            continue
        body.append(line)

    close_block()
    return result


def check(
    result: ParseResult,
    *,
    first_page: int,
    last_page: int,
    figure_paths: set[str],
) -> ParseResult:
    """Content checks a parser can't make on its own. Mutates and returns `result`."""
    if not result.sections:
        result.errors.append("no sections found — start with '=== section <number> | <title>'")
    used_images: set[str] = set()
    for section in result.sections:
        where = f"section {section.number or ''} {section.title!r}".replace("  ", " ")
        if not section.blocks:
            result.warnings.append(f"{where}: has no blocks")
        for i, block in enumerate(section.blocks, start=1):
            tag = f"{where}, block {i} ({block.type} p{block.page})"
            if CONTROL_RE.search(block.md):
                result.errors.append(f"{tag}: contains control characters")
            if not (first_page <= block.page <= last_page):
                result.errors.append(
                    f"{tag}: page {block.page} is outside this chapter's pages "
                    f"{first_page}-{last_page}"
                )
            if block.type == "figure":
                if not block.image:
                    result.errors.append(f"{tag}: figure needs image=\"...\" from the asset list")
                elif block.image not in figure_paths:
                    result.errors.append(f"{tag}: image {block.image!r} is not a listed figure asset")
                else:
                    used_images.add(block.image)
            elif not block.md:
                result.errors.append(f"{tag}: empty body")
            if block.type == "definition" and not block.term:
                result.warnings.append(f"{tag}: definition without term=\"...\"")
            if len(UNESCAPED_DOLLAR_RE.findall(block.md.replace("$$", ""))) % 2:
                result.warnings.append(
                    f"{tag}: odd number of $ — unbalanced math, or a currency sign that needs \\$"
                )
    return result
