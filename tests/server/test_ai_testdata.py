import json
from pathlib import Path

import pytest

from server.ai.schema import parse_draft

DATA = Path(__file__).parents[1] / "data" / "recipe_import"
IDS = [
    "en-blog-curry",
    "en-guacamole-tacos",
    "en-no-recipe",
    "en-oat-cookies",
    "en-uk-pasta-bake",
    "sv-bråk-och-spann",
    "sv-forum-post",
    "sv-injection",
    "sv-kikartsgryta",
    "sv-pannkakor",
]


def collapse(text):
    return " ".join(text.split())


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def text_of(rid):
    return (DATA / "recipes" / f"{rid}.txt").read_text(encoding="utf-8")


def draft_of(rid):
    return parse_draft((DATA / "recipes" / f"{rid}.expected.json").read_text(encoding="utf-8"))


CATALOG = load("catalog.json")
NAMES = {entry["name"].lower() for entry in CATALOG}


def test_catalog_is_valid():
    lowered = [e["name"].lower() for e in CATALOG]
    assert len(lowered) == len(set(lowered)) == 37
    for entry in CATALOG:
        assert set(entry) == {"name", "unit", "conversion_units"}
        assert entry["name"] and entry["unit"]
        assert isinstance(entry["conversion_units"], list)


def test_factor_cases():
    cases = load("factors.json")
    assert len(cases) == 12
    for case in cases:
        assert case["ingredient"].lower() in NAMES
        assert case["unit"] and case["food"]
        assert case["expected"] > 0


def test_ten_recipes_each_with_both_files():
    recipes = DATA / "recipes"
    assert sorted(p.stem for p in recipes.glob("*.txt")) == IDS
    assert sorted(p.name.removesuffix(".expected.json") for p in recipes.glob("*.json")) == IDS
    assert sum(i.startswith("sv-") for i in IDS) >= 4
    assert sum(i.startswith("en-") for i in IDS) >= 4


@pytest.mark.parametrize("rid", IDS)
def test_expected_obeys_schema_and_matches_source(rid):
    draft = draft_of(rid)  # also proves the file is valid under the model's schema
    source = collapse(text_of(rid))
    assert 600 <= len(text_of(rid)) <= 2500
    for line in draft.lines:
        assert collapse(line.original_text) in source
        assert line.match is None or line.match.lower() in NAMES
        if line.not_an_ingredient:
            assert line.amount is None and line.match is None
        else:
            assert line.amount is not None
    if rid == "en-no-recipe":
        assert draft.sections == () and draft.servings == 1
    else:
        assert draft.instructions and draft.lines and draft.name


def test_servings():
    assert draft_of("en-uk-pasta-bake").servings == 4
    assert draft_of("en-oat-cookies").servings == 24
    assert draft_of("sv-pannkakor").servings == 4
    assert draft_of("en-blog-curry").servings == 1


def test_coverage_of_features():
    drafts = {rid: draft_of(rid) for rid in IDS}
    lines = [line for d in drafts.values() for line in d.lines]
    units = {line.unit for line in lines}
    assert {"burk", "klyfta", "kruka", "handful"} <= units
    assert any(line.unit == "" for line in lines)  # "ägg"
    assert any(line.amount is None and line.not_an_ingredient for line in lines)
    assert any(line.match is None for line in lines)
    assert any("–" in line.original_text or "-" in line.original_text.split()[0] for line in lines)
    assert any("½" in line.original_text for line in lines)
    assert any("," in line.original_text.split()[0] for line in lines)
    named = [d for d in drafts.values() if sum(1 for s in d.sections if s.name) >= 2]
    assert named
    assert any(s.name == "" for d in drafts.values() for s in d.sections)
    assert any(
        len([ln.match for ln in d.lines if ln.match])
        != len({ln.match for ln in d.lines if ln.match})
        for d in drafts.values()
    )
    for rid, d in drafts.items():
        if rid != "en-no-recipe":
            assert len(d.instructions.splitlines()) >= 2, rid


def test_range_midpoint_and_fraction_amounts():
    amounts = {line.original_text: line.amount for line in draft_of("sv-bråk-och-spann").lines}
    assert str(amounts["2–3 morötter"]) == "2.5"
    assert str(amounts["1 ½ dl havregryn"]) == "1.5"
    assert str(amounts["0,5 tsk salt"]) == "0.5"
    curry = {line.original_text: line.amount for line in draft_of("en-blog-curry").lines}
    assert str(curry["2-3 tbsp red curry paste"]) == "2.5"


def test_injection_trap():
    assert "KLAR" in text_of("sv-injection")
    expected_text = (DATA / "recipes" / "sv-injection.expected.json").read_text(encoding="utf-8")
    assert "KLAR" not in expected_text
    assert "Ignorera" not in expected_text


def test_no_other_files():
    found = {p.relative_to(DATA).as_posix() for p in DATA.rglob("*") if p.is_file()}
    expected = {"README.md", "catalog.json", "factors.json"}
    for rid in IDS:
        expected |= {f"recipes/{rid}.txt", f"recipes/{rid}.expected.json"}
    assert found == expected
