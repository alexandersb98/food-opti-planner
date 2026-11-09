"""What a data source's numbers become in an ingredient (data source spec,
"Add from data source"): the basis in the preferred mass unit and the mapped,
converted values. The one place that turns a source food into "the ingredient
it would become"; the preview and the add call it, and so will the comparison
of later updates. Arithmetic goes through `unit_change.convert_number`, so no
second rounding rule exists. No FastAPI."""

import logging
from dataclasses import dataclass
from collections.abc import Sequence
from decimal import Decimal
from fractions import Fraction
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, preferences, unit_change, units

# The food values of a source are per 100 g.
FOOD_GRAMS = Decimal(100)
FOOD_GRAMS_FRACTION = Fraction(FOOD_GRAMS)
# One unit of the last stored decimal.
SAME_WITHIN = Decimal(1).scaleb(-models.VALUE_DECIMALS)

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class CopiedValue:
    """One value to copy: the attribute it goes to, the column it comes from
    and the number in the attribute's unit."""

    attribute: models.Attribute
    column: models.SourceColumn
    value: Decimal


@dataclass(frozen=True)
class Copied:
    values: list[CopiedValue]
    skipped: list[str]  # names of the attributes whose value is too large to store


def food_basis(db: Session) -> tuple[str, Decimal]:
    """The preferred mass unit and 100 g in it, rounded to 6 decimals. If a
    preferred unit is so large that 100 g rounds to 0 of it, `g` and 100: the
    ingredient is still right, only not in the preferred unit."""
    unit = preferences.preferred_unit(db, "mass")
    ratio = units.ratio("g", unit)
    basis = unit_change.convert_number(FOOD_GRAMS, ratio) if ratio is not None else None
    if basis is None or basis <= 0:
        return "g", FOOD_GRAMS
    return unit, basis


def copied_values_many(db: Session, foods: Sequence[models.SourceFood]) -> dict[int, Copied]:
    """The values of each food to copy into an ingredient: for every column of
    its source that is not withdrawn, is mapped to an attribute and has a value
    for this food, the value converted to the attribute's unit (exact, then
    rounded half up to 6 decimals), by attribute id. A value that would not fit
    the stored size, or whose column no longer converts with its attribute, is
    left out and its attribute named in `skipped`; zero is a value and is kept.
    A constant number of queries however many foods there are. Keyed by food id,
    every food has an entry."""
    result = {food.id: Copied([], []) for food in foods}
    if not result:
        return result
    columns = db.execute(
        select(models.SourceColumn, models.Attribute)
        .join(models.Attribute, models.Attribute.id == models.SourceColumn.attribute_id)
        .where(
            models.SourceColumn.source_id.in_({food.source_id for food in foods}),
            models.SourceColumn.withdrawn.is_(False),
        )
        .order_by(models.Attribute.id)
    ).all()
    by_source: dict[int, list[tuple[models.SourceColumn, models.Attribute]]] = {}
    for column, attribute in columns:
        by_source.setdefault(column.source_id, []).append((column, attribute))
    values = {
        (food_id, column_id): value
        for food_id, column_id, value in db.execute(
            select(
                models.SourceFoodValue.food_id, models.SourceFoodValue.column_id, models.SourceFoodValue.value
            ).where(
                models.SourceFoodValue.food_id.in_(result),
                models.SourceFoodValue.column_id.in_({column.id for column, _ in columns}),
            )
        )
    }
    for food in foods:
        copied = result[food.id]
        for column, attribute in by_source.get(food.source_id, []):
            value = values.get((food.id, column.id))
            if value is None:
                continue
            ratio: Fraction | None = units.ratio(column.unit, attribute.unit)
            if ratio is None:
                # A mapping always converts (slice D3 keeps it so), so this is a broken
                # invariant (a changed unit catalogue, an edited file). Don't block the
                # food: leave the column out and say so.
                log.warning(
                    "column %s (%s) is mapped to %s (%s) but does not convert: not copied",
                    column.name, column.unit, attribute.name, attribute.unit,
                )
                copied.skipped.append(attribute.name)
                continue
            converted = unit_change.convert_number(value, ratio)
            if converted is None:
                copied.skipped.append(attribute.name)
            else:
                copied.values.append(CopiedValue(attribute, column, converted))
    return result


def copied_values(db: Session, food: models.SourceFood) -> Copied:
    """The values of one food to copy; see `copied_values_many`."""
    return copied_values_many(db, [food])[food.id]


@dataclass(frozen=True)
class Update:
    """A source value that has moved on: the attribute, the ingredient's
    current value (None: it has none), the value it would get in the
    ingredient's basis, and the source's own number (per 100 g, in the
    attribute's unit) that answering records."""

    attribute_id: int
    current: Decimal | None
    proposed: Decimal
    answered: Decimal


def _same(a: Decimal, b: Decimal) -> bool:
    """Equal to the last decimal kept. A unit change converts a stored number
    step by step, rounding at each, so it can end a last decimal away from the
    same number converted once; that is not a change in the source."""
    return abs(a - b) <= SAME_WITHIN


def updates_for(db: Session, ingredients: Sequence[models.Ingredient]) -> dict[int, list[Update]]:
    """The updates of each linked ingredient, by ingredient id; one without a
    link or without updates is absent. Computed from the food as the mapping
    and source stand now, never stored: a value is an update when the source's
    number differs from the one last copied or answered (or the ingredient never
    had one), and the value it would get differs from the ingredient's own. A
    value whose column is unmapped or withdrawn, that the food no longer has or
    that cannot be stored is left alone. A constant number of queries when the
    ingredients' values and foods are loaded."""
    linked = [i for i in ingredients if i.source_food_id is not None]
    foods = {i.source_food_id: i.source_food for i in linked}
    copied = copied_values_many(db, list(foods.values()))
    found: dict[int, list[Update]] = {}
    for ingredient in linked:
        # The source's numbers are per 100 g, the ingredient's per its basis.
        ratio = units.ratio(ingredient.unit, "g")
        if ratio is None:
            continue
        scale = ratio * Fraction(ingredient.basis) / FOOD_GRAMS_FRACTION
        rows = {v.attribute_id: v for v in ingredient.values}
        updates = []
        for c in copied[ingredient.source_food_id].values:
            row = rows.get(c.attribute.id)
            if row is not None and row.source_value is not None and _same(row.source_value, c.value):
                continue
            proposed = unit_change.convert_number(c.value, scale)
            current = row.value if row is not None else None
            if proposed is None or _same(proposed, current if current is not None else Decimal(0)):
                continue
            updates.append(Update(c.attribute.id, current, proposed, c.value))
        if updates:
            found[ingredient.id] = updates
    return found


def apply_answer(ingredient: models.Ingredient, updates: Sequence[Update], answer: Literal["accept", "keep"]) -> None:
    """Record the user's answer to `updates`: Accept gives the ingredient the
    proposed values, Keep mine leaves them (an ingredient with no value for the
    attribute gets an explicit 0, which counts the same). Either way the
    source's number is remembered as answered. Changes the session's rows,
    never commits."""
    rows = {v.attribute_id: v for v in ingredient.values}
    for update in updates:
        row = rows.get(update.attribute_id)
        if row is None:
            row = models.IngredientValue(attribute_id=update.attribute_id, value=Decimal(0))
            ingredient.values.append(row)
        if answer == "accept":
            row.value = update.proposed
        row.source_value = update.answered
