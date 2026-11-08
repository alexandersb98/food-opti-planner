"""The JSON schemas shown to the model and the validators for its answers."""

import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any

from server.ai.draft import Draft, LineDraft, SectionDraft
from server.ai.errors import BadAnswerError

DRAFT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "servings": {"type": "integer", "minimum": 1},
        "instructions": {"type": "string"},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "lines": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "original_text": {"type": "string"},
                                "amount": {"type": ["number", "null"]},
                                "unit": {"type": "string"},
                                "food": {"type": "string"},
                                "match": {"type": ["string", "null"]},
                                "not_an_ingredient": {"type": "boolean"},
                            },
                            "required": [
                                "original_text",
                                "amount",
                                "unit",
                                "food",
                                "match",
                                "not_an_ingredient",
                            ],
                        },
                    },
                },
                "required": ["name", "lines"],
            },
        },
    },
    "required": ["name", "servings", "instructions", "sections"],
}

FACTOR_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"factor": {"type": "number", "exclusiveMinimum": 0}},
    "required": ["factor"],
}

_FENCE = re.compile(r"^```[a-zA-Z]*\s*\n?(.*?)\n?```$", re.DOTALL)


def parse_json_object(text: str) -> dict[str, Any]:
    """The JSON object in a model's text; numbers become Decimal."""
    stripped = text.strip()
    fence = _FENCE.match(stripped)
    if fence:
        stripped = fence.group(1).strip()
    candidates = [stripped]
    first, last = stripped.find("{"), stripped.rfind("}")
    if first != -1 and last > first:
        candidates.append(stripped[first : last + 1])
    for candidate in candidates:
        try:
            value = json.loads(candidate, parse_float=Decimal)
        except ValueError:
            continue
        if isinstance(value, dict):
            return value
        raise BadAnswerError("$: not a JSON object")
    raise BadAnswerError("$: not JSON")


def _get(obj: dict[str, Any], key: str, path: str) -> Any:
    if key not in obj:
        raise BadAnswerError(f"{path}.{key}: missing")
    return obj[key]


def _string(value: Any, path: str) -> str:
    if not isinstance(value, str):
        raise BadAnswerError(f"{path}: must be a string")
    return value


def _number(value: Any, path: str) -> Decimal:
    """A JSON number, or a numeric string with . or , (not a fraction)."""
    if isinstance(value, bool):
        raise BadAnswerError(f"{path}: must be a number, not a boolean")
    if isinstance(value, (int, Decimal)):
        return Decimal(value)
    if isinstance(value, str):
        try:
            number = Decimal(value.strip().replace(",", "."))
        except InvalidOperation:
            raise BadAnswerError(f"{path}: not a number: {value!r}") from None
        if number.is_finite():
            return number
    raise BadAnswerError(f"{path}: must be a number")


def _object(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise BadAnswerError(f"{path}: must be an object")
    return value


def _line(raw: Any, path: str) -> LineDraft:
    obj = _object(raw, path)
    not_an_ingredient = _get(obj, "not_an_ingredient", path)
    if not isinstance(not_an_ingredient, bool):
        raise BadAnswerError(f"{path}.not_an_ingredient: must be a boolean")
    raw_amount = _get(obj, "amount", path)
    amount: Decimal | None
    if raw_amount is None:
        if not not_an_ingredient:
            raise BadAnswerError(f"{path}.amount: null is only allowed on a not_an_ingredient line")
        amount = None
    else:
        amount = _number(raw_amount, f"{path}.amount")
        if amount <= 0:
            raise BadAnswerError(f"{path}.amount: must be greater than 0")
    raw_match = _get(obj, "match", path)
    if raw_match is not None and not isinstance(raw_match, str):
        raise BadAnswerError(f"{path}.match: must be a string or null")
    return LineDraft(
        original_text=_string(_get(obj, "original_text", path), f"{path}.original_text"),
        amount=amount,
        unit=_string(_get(obj, "unit", path), f"{path}.unit"),
        food=_string(_get(obj, "food", path), f"{path}.food"),
        match=raw_match,
        not_an_ingredient=not_an_ingredient,
    )


def parse_draft(text: str) -> Draft:
    """Validate a model's answer text and build the Draft, or BadAnswerError."""
    root = parse_json_object(text)
    raw_servings = _get(root, "servings", "$")
    if isinstance(raw_servings, bool) or not isinstance(raw_servings, (int, Decimal)):
        raise BadAnswerError("$.servings: must be an integer")
    if raw_servings != int(raw_servings):
        raise BadAnswerError("$.servings: must be an integer")
    servings = int(raw_servings)
    if servings < 1:
        raise BadAnswerError("$.servings: must be at least 1")
    raw_sections = _get(root, "sections", "$")
    if not isinstance(raw_sections, list):
        raise BadAnswerError("$.sections: must be an array")
    sections = []
    for i, raw_section in enumerate(raw_sections):
        spath = f"$.sections[{i}]"
        section = _object(raw_section, spath)
        raw_lines = _get(section, "lines", spath)
        if not isinstance(raw_lines, list):
            raise BadAnswerError(f"{spath}.lines: must be an array")
        lines = tuple(_line(raw, f"{spath}.lines[{j}]") for j, raw in enumerate(raw_lines))
        sections.append(
            SectionDraft(name=_string(_get(section, "name", spath), f"{spath}.name"), lines=lines)
        )
    return Draft(
        name=_string(_get(root, "name", "$"), "$.name"),
        servings=servings,
        instructions=_string(_get(root, "instructions", "$"), "$.instructions"),
        sections=tuple(sections),
    )


def parse_factor(text: str) -> Decimal:
    """Validate a factor answer `{"factor": number}`, or BadAnswerError."""
    root = parse_json_object(text)
    factor = _number(_get(root, "factor", "$"), "$.factor")
    if factor <= 0:
        raise BadAnswerError("$.factor: must be greater than 0")
    return factor
