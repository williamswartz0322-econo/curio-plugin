from curio_pipeline import markup


def parse_checked(text: str, figures: set[str] | None = None) -> markup.ParseResult:
    return markup.check(
        markup.parse(text), first_page=10, last_page=20, figure_paths=figures or set()
    )


def test_latex_backslashes_survive_verbatim():
    result = parse_checked(
        "=== section 2.1 | Means\n"
        "--- equation p12\n"
        "$$ \\frac{\\beta}{\\theta} = \\rho \\nabla f $$\n"
    )
    assert not result.errors
    assert result.sections[0].blocks[0].md == "$$ \\frac{\\beta}{\\theta} = \\rho \\nabla f $$"


def test_sections_blocks_and_attributes():
    result = parse_checked(
        "=== section | Introduction\n"
        "--- paragraph p10\n"
        "First line\nsecond line\n\n"
        "--- definition p11 term=\"Reservation \\\"price\\\"\"\n"
        "The most someone will pay.\n"
        "=== section 2.1 | Next\n"
        "--- figure p12 label=\"Figure 2.1\" image=\"figures/ch02/p012-f1.png\"\n"
        "Caption\n",
        figures={"figures/ch02/p012-f1.png"},
    )
    assert not result.errors, result.errors
    intro, nxt = result.sections
    assert (intro.number, intro.title) == ("", "Introduction")
    assert intro.blocks[0].md == "First line\nsecond line"
    assert intro.blocks[1].term == 'Reservation "price"'
    assert nxt.number == "2.1"
    assert nxt.blocks[0].image == "figures/ch02/p012-f1.png"


def test_errors_are_specific():
    result = parse_checked(
        "stray text\n"
        "=== section 1.1 | A\n"
        "--- paragrph p12\nx\n"
        "--- paragraph p99\nout of range\n"
        "--- figure p12 image=\"figures/none.png\"\ncap\n"
        "--- paragraph p12\nbad \x0crac\n"
    )
    joined = "\n".join(result.errors)
    assert "text outside any block" in joined
    assert "unknown block type 'paragrph'" in joined
    assert "outside this chapter's pages" in joined
    assert "not a listed figure asset" in joined
    assert "control characters" in joined


def test_unbalanced_dollar_is_a_warning():
    result = parse_checked("=== section 1 | A\n--- paragraph p12\npays $500 a month\n")
    assert not result.errors
    assert any("odd number of $" in w for w in result.warnings)
    clean = parse_checked("=== section 1 | A\n--- paragraph p12\npays \\$500 for $x$\n")
    assert not clean.warnings
