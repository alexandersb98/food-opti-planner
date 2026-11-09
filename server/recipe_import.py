"""Recipe import from pasted text: the AI step and the checks around it
(import spec, "Import flow" steps 2 to 4). No FastAPI.

`import_recipe` asks the model for a draft, checks it without AI against the
user's own ingredients (matches, unit spellings, a status per line), asks for a
conversion factor where a line needs one, and answers the draft. It writes
nothing: the draft is only saved when the user presses Save."""

from collections.abc import Sequence
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from . import conversions, line_units, models, units
from .ai.draft import CatalogEntry, Draft, FactorSuggester, RecipeConverter
from .ai.errors import AIServiceError, BadAnswerError
from .ai.prompts import MAX_TEXT_CHARS
from .ai_usage import DailyLimitReached

Status = Literal[
    "unmatched", "not_an_ingredient", "own_unit", "built_in_step", "stored_conversion", "needs_factor", "bad_unit"
]
NEEDS_YOU: tuple[Status, ...] = ("unmatched", "needs_factor", "bad_unit")

MAX_FACTOR_SUGGESTIONS = 15  # per import: a cost bound, the rest are typed by hand
MAX_SECTIONS = 50
MAX_LINES = 200  # per section
LIMIT = Decimal(10) ** 9  # an amount or factor this big has too many digits
_SIX = Decimal("0.000001")


@dataclass
class ImportedLine:
    original_text: str
    food: str
    amount: Decimal | None
    unit: str
    ingredient_id: int | None
    status: Status
    suggested_factor: Decimal | None = None


@dataclass
class ImportedSection:
    name: str
    lines: list[ImportedLine]


@dataclass
class ImportedDraft:
    name: str
    servings: int
    instructions: str
    source_url: str
    cut: bool
    needs_you: int
    sections: list[ImportedSection] = field(default_factory=list)


def catalogue(db: Session) -> list[tuple[models.Ingredient, CatalogEntry]]:
    """Every ingredient by id with the entry the prompt shows."""
    rows = db.scalars(
        select(models.Ingredient).options(selectinload(models.Ingredient.conversions)).order_by(models.Ingredient.id)
    ).all()
    return [(row, _entry(row)) for row in rows]


def _entry(ingredient: models.Ingredient) -> CatalogEntry:
    return CatalogEntry(ingredient.name, ingredient.unit, tuple(c.unit for c in ingredient.conversions))


def _rounded(number: Decimal) -> Decimal | None:
    """Half up to 6 decimals, or None when that is 0 or has too many digits."""
    value = number.quantize(_SIX, rounding=ROUND_HALF_UP)
    return value if 0 < value < LIMIT else None


def _status(unit: str, ingredient: models.Ingredient) -> Status:
    parsed = units.parse(unit)
    if parsed is not None and parsed.category == "energy":
        return "bad_unit"
    found = line_units.route(unit, ingredient.unit, [(c.unit, c.factor) for c in ingredient.conversions])
    if found is None:
        return "needs_factor"
    if not unit:
        return "own_unit"
    if found.via is not None:
        return "stored_conversion"
    return "own_unit" if line_units.is_own(unit, ingredient.unit) else "built_in_step"


def check(draft: Draft, ingredients: Sequence[models.Ingredient]) -> list[ImportedSection]:
    """The draft's sections with a status per line; pure over the draft and
    the loaded ingredients. Raises BadAnswerError for an answer the editor
    could not hold."""
    if len(draft.sections) > MAX_SECTIONS or any(len(s.lines) > MAX_LINES for s in draft.sections):
        raise BadAnswerError("too many sections or lines")
    by_name: dict[str, models.Ingredient] = {}
    for ingredient in ingredients:
        by_name.setdefault(ingredient.name.strip().lower(), ingredient)
    kept = [section for section in draft.sections if section.lines]
    sections = []
    for position, section in enumerate(kept, start=1):
        name = section.name.strip()[: models.NAME_LENGTH]
        if len(kept) > 1 and not name:
            name = f"Section {position}"
        lines = []
        for raw in section.lines:
            amount = None
            if raw.amount is not None:
                amount = _rounded(raw.amount)
                if amount is None:
                    raise BadAnswerError("an amount is out of range")
            ingredient = None if raw.not_an_ingredient else by_name.get((raw.match or "").strip().lower())
            unit = units.normalise(raw.unit)
            too_long = len(unit) > models.UNIT_LENGTH
            unit = unit[: models.UNIT_LENGTH]
            status: Status
            if raw.not_an_ingredient:
                status = "not_an_ingredient"
            elif ingredient is None:
                status = "unmatched"
            else:
                unit = conversions.canonical_unit(unit, ingredient)[: models.UNIT_LENGTH]
                status = "bad_unit" if too_long else _status(unit, ingredient)
            lines.append(
                ImportedLine(
                    original_text=raw.original_text[: models.ORIGINAL_TEXT_LENGTH],
                    food=raw.food[:200],
                    amount=amount,
                    unit=unit,
                    ingredient_id=ingredient.id if ingredient else None,
                    status=status,
                )
            )
        sections.append(ImportedSection(name, lines))
    return sections


def _with_retry(call):
    """Run `call`, once more when it raises BadAnswerError; other errors pass."""
    try:
        return call()
    except BadAnswerError:
        return call()


def convert_with_retry(
    converter: RecipeConverter, text: str, catalog: Sequence[CatalogEntry], ingredients: Sequence[models.Ingredient]
) -> tuple[Draft, list[ImportedSection]]:
    """Convert and check; a bad answer, including an amount out of range, is
    tried once more with the same input. A service error or NoRecipeFound is not."""

    def attempt() -> tuple[Draft, list[ImportedSection]]:
        draft = converter.convert(text, catalog)
        return draft, check(draft, ingredients)

    return _with_retry(attempt)


def _suggest(suggester: FactorSuggester, entry: CatalogEntry, unit: str, food: str) -> Decimal:
    def attempt() -> Decimal:
        factor = _rounded(suggester.suggest(entry, unit, food))
        if factor is None:
            raise BadAnswerError("the factor is out of range")
        return factor

    return _with_retry(attempt)


def suggest_factors(
    sections: list[ImportedSection], ingredients: Sequence[models.Ingredient], suggester: FactorSuggester
) -> None:
    """Fill `suggested_factor` on every needs_factor line: one call per
    distinct (ingredient, unit), at most MAX_FACTOR_SUGGESTIONS. A pair whose
    answer stays bad is left empty; an outage or the daily limit stops the rest."""
    by_id = {ingredient.id: ingredient for ingredient in ingredients}
    pairs: dict[tuple[int, str], list[ImportedLine]] = {}
    for section in sections:
        for line in section.lines:
            if line.status == "needs_factor" and line.ingredient_id is not None:
                pairs.setdefault((line.ingredient_id, line.unit.lower()), []).append(line)
    for count, (lines_key, lines) in enumerate(pairs.items()):
        if count >= MAX_FACTOR_SUGGESTIONS:
            break
        ingredient = by_id[lines_key[0]]
        try:
            factor = _suggest(suggester, _entry(ingredient), lines[0].unit, lines[0].food)
        except BadAnswerError:
            continue
        except (AIServiceError, DailyLimitReached):
            break
        for line in lines:
            line.suggested_factor = factor


def suggest_one(db: Session, ingredient_id: int, unit: str, food: str, suggester: FactorSuggester) -> Decimal:
    """The factor for one ingredient and unit, typed by hand on the review.
    Raises BadAnswerError, AIServiceError or DailyLimitReached."""
    ingredient = db.get(models.Ingredient, ingredient_id)
    assert ingredient is not None  # the route checked the id
    return _suggest(suggester, _entry(ingredient), unit, food)


def import_recipe(
    db: Session, text: str, converter: RecipeConverter, suggester: FactorSuggester, *, source_url: str = ""
) -> ImportedDraft:
    """The checked draft for pasted text or a page's text; `source_url` is the
    page's link, empty for pasted text. NoRecipeFound, BadAnswerError (after
    the retry), AIServiceError and DailyLimitReached pass out."""
    text = text.strip()
    cut = len(text) > MAX_TEXT_CHARS
    rows = catalogue(db)
    ingredients = [ingredient for ingredient, _ in rows]
    draft, sections = convert_with_retry(converter, text[:MAX_TEXT_CHARS], [entry for _, entry in rows], ingredients)
    suggest_factors(sections, ingredients, suggester)
    needs_you = sum(line.status in NEEDS_YOU for section in sections for line in section.lines)
    return ImportedDraft(
        name=draft.name.strip()[: models.NAME_LENGTH],
        servings=draft.servings,
        instructions=draft.instructions[: models.INSTRUCTIONS_LENGTH],
        source_url=source_url,
        cut=cut,
        needs_you=needs_you,
        sections=sections,
    )
