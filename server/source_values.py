"""What a data source's numbers become in an ingredient (data source spec,
"Add from data source"): the basis in the preferred mass unit and the mapped,
converted values. The one place that turns a source food into "the ingredient
it would become"; the preview and the add call it, and so will the comparison
of later updates. Arithmetic goes through `unit_change.convert_number`, so no
second rounding rule exists. No FastAPI."""

from dataclasses import dataclass
from decimal import Decimal
from fractions import Fraction

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, preferences, unit_change, units

# The food values of a source are per 100 g.
FOOD_GRAMS = Decimal(100)


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


def copied_values(db: Session, food: models.SourceFood) -> Copied:
    """The values of `food` to copy into an ingredient: for every column of its
    source that is not withdrawn, is mapped to an attribute and has a value for
    this food, the value converted to the attribute's unit (exact, then rounded
    half up to 6 decimals), by attribute id. A value that would not fit the
    stored size is left out and its attribute named in `skipped`; zero is a
    value and is kept."""
    rows = db.execute(
        select(models.SourceFoodValue.value, models.SourceColumn, models.Attribute)
        .join(models.SourceColumn, models.SourceColumn.id == models.SourceFoodValue.column_id)
        .join(models.Attribute, models.Attribute.id == models.SourceColumn.attribute_id)
        .where(
            models.SourceFoodValue.food_id == food.id,
            models.SourceColumn.source_id == food.source_id,
            models.SourceColumn.withdrawn.is_(False),
        )
        .order_by(models.Attribute.id)
    )
    values: list[CopiedValue] = []
    skipped: list[str] = []
    for value, column, attribute in rows:
        ratio: Fraction | None = units.ratio(column.unit, attribute.unit)
        if ratio is None:
            # A mapping always converts (slice D3 keeps it so): this is a bug.
            raise RuntimeError(f"column {column.name} ({column.unit}) is mapped to {attribute.name} ({attribute.unit})")
        converted = unit_change.convert_number(value, ratio)
        if converted is None:
            skipped.append(attribute.name)
        else:
            values.append(CopiedValue(attribute, column, converted))
    return Copied(values, skipped)
