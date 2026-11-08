import json
from decimal import Decimal

import pytest

from server.ai.draft import Draft
from server.ai.errors import BadAnswerError
from server.ai.schema import (
    DRAFT_SCHEMA,
    FACTOR_SCHEMA,
    parse_draft,
    parse_factor,
    parse_json_object,
)


def line(**over):
    base = {
        "original_text": "2 dl mjölk",
        "amount": 2,
        "unit": "dl",
        "food": "mjölk",
        "match": "Mjölk",
        "not_an_ingredient": False,
    }
    base.update(over)
    return base


def answer(lines=None, **over):
    base = {
        "name": "Pannkakor",
        "servings": 4,
        "instructions": "Vispa.\nStek.",
        "sections": [{"name": "", "lines": lines if lines is not None else [line()]}],
    }
    base.update(over)
    return base


def parse(obj):
    return parse_draft(json.dumps(obj))


def test_full_answer_parses_with_decimal_amounts():
    draft = parse_draft(
        '{"name": "P", "servings": 4, "instructions": "x", "sections": [{"name": "", '
        '"lines": [{"original_text": "1/2 dl", "amount": 0.5, "unit": "dl", "food": "f", '
        '"match": null, "not_an_ingredient": false}]}]}'
    )
    assert isinstance(draft, Draft)
    assert draft.servings == 4
    only = draft.lines[0]
    assert only.amount == Decimal("0.5") and isinstance(only.amount, Decimal)
    assert only.match is None


def test_fence_surrounding_text_and_decimal_comma_are_tolerated():
    body = json.dumps(answer([line(amount="0,5")]))
    assert parse_draft(f"```json\n{body}\n```").lines[0].amount == Decimal("0.5")
    assert parse_draft(f"Here you go:\n{body}\nHope it helps").servings == 4
    assert parse_draft(f"  {body}  ").servings == 4


def test_fraction_string_is_refused():
    with pytest.raises(BadAnswerError, match=r"sections\[0\]\.lines\[0\]\.amount"):
        parse(answer([line(amount="1/2")]))


@pytest.mark.parametrize("text", ["nope", "", "{not json}"])
def test_not_json(text):
    with pytest.raises(BadAnswerError, match="not JSON"):
        parse_draft(text)


def test_array_is_refused():
    with pytest.raises(BadAnswerError, match=r"\$"):
        parse_draft("[1, 2]")


def test_missing_sections():
    obj = answer()
    del obj["sections"]
    with pytest.raises(BadAnswerError, match=r"\$\.sections"):
        parse(obj)


@pytest.mark.parametrize("servings", [0, 2.5, True, "4", None, -1])
def test_bad_servings(servings):
    with pytest.raises(BadAnswerError, match=r"\$\.servings"):
        parse(answer(servings=servings))


def test_servings_with_zero_fraction_accepted():
    assert parse_draft('{"name":"","servings":4.0,"instructions":"","sections":[]}').servings == 4


@pytest.mark.parametrize("amount", [0, -1, True, "abc"])
def test_bad_amount(amount):
    with pytest.raises(BadAnswerError, match=r"sections\[0\]\.lines\[0\]\.amount"):
        parse(answer([line(amount=amount)]))


def test_null_amount_only_on_not_an_ingredient():
    with pytest.raises(BadAnswerError, match=r"lines\[0\]\.amount"):
        parse(answer([line(amount=None)]))
    ok = parse(answer([line(amount=None, not_an_ingredient=True)]))
    assert ok.lines[0].amount is None and ok.lines[0].not_an_ingredient


@pytest.mark.parametrize(
    ("key", "value"),
    [("match", 3), ("unit", None), ("not_an_ingredient", "no"), ("food", 1), ("original_text", 5)],
)
def test_bad_line_field(key, value):
    with pytest.raises(BadAnswerError, match=rf"lines\[0\]\.{key}"):
        parse(answer([line(**{key: value})]))


def test_missing_line_key_names_path():
    bad = line()
    del bad["unit"]
    with pytest.raises(BadAnswerError, match=r"sections\[0\]\.lines\[0\]\.unit"):
        parse(answer([bad]))


def test_second_section_path():
    obj = answer()
    obj["sections"].append({"name": "B", "lines": [line(amount=0)]})
    with pytest.raises(BadAnswerError, match=r"sections\[1\]\.lines\[0\]\.amount"):
        parse(obj)


def test_extra_keys_ignored():
    obj = answer([line(extra=1)], note="hi")
    obj["sections"][0]["more"] = 2
    assert len(parse(obj).lines) == 1


def test_empty_sections_and_empty_section_parse():
    assert parse(answer(sections=[])).lines == ()
    assert parse(answer(sections=[{"name": "A", "lines": []}])).lines == ()


def test_parse_factor():
    assert parse_factor('{"factor": 100}') == Decimal(100)
    assert parse_factor('{"factor": "0,1"}') == Decimal("0.1")
    assert isinstance(parse_factor('{"factor": 0.25}'), Decimal)


@pytest.mark.parametrize(
    "text",
    ['{"factor": 0}', '{"factor": -2}', "{}", '{"factor": null}', '{"factor": [1]}', "[1]"],
)
def test_bad_factor(text):
    with pytest.raises(BadAnswerError):
        parse_factor(text)


def _from_schema(schema):
    """A valid answer built from the schema's own required lists."""
    if schema["type"] == "object":
        return {k: _from_schema(schema["properties"][k]) for k in schema["required"]}
    if schema["type"] == "array":
        return [_from_schema(schema["items"])]
    return None


def test_schema_properties_equal_required_keys():
    def check(schema):
        if schema.get("type") == "object":
            assert set(schema["properties"]) == set(schema["required"])
            for sub in schema["properties"].values():
                check(sub)
        elif schema.get("type") == "array":
            check(schema["items"])

    check(DRAFT_SCHEMA)
    check(FACTOR_SCHEMA)


def test_parser_reads_exactly_the_schema_keys():
    template = _from_schema(DRAFT_SCHEMA)
    line_keys = set(template["sections"][0]["lines"][0])
    assert line_keys == set(line().keys())
    assert set(template) == set(answer().keys())
    assert set(template["sections"][0]) == {"name", "lines"}
    # every key in the template is needed: dropping any one is refused
    full = answer()
    for key in list(full):
        broken = {k: v for k, v in full.items() if k != key}
        with pytest.raises(BadAnswerError):
            parse(broken)
    for key in line_keys:
        broken = {k: v for k, v in line().items() if k != key}
        with pytest.raises(BadAnswerError):
            parse(answer([broken]))


def test_parse_json_object_returns_dict():
    assert parse_json_object('{"a": 1.5}') == {"a": Decimal("1.5")}
