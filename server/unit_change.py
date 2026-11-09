"""Changing a unit converts the numbers stored in it (units spec, "Changing a
unit"). The one place the rule lives: the exact arithmetic, the refusals, and
a list of converters per entity. A converter is a named source of stored
numbers; `plan` asks each for its numbers, multiplies them all by one exact
ratio and answers a `Change` that `apply` writes or a preview reports. A
later slice that stores more numbers in an attribute's or ingredient's unit
adds one converter to a list here. No FastAPI."""

from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Context, Decimal
from fractions import Fraction
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, queries, translate, units
from .fields import plain

# A converted number must stay below 10^9: 15 digits with 6 decimals.
LIMIT = 10 ** (models.VALUE_DIGITS - models.VALUE_DECIMALS)
FACTOR_DIGITS = 12  # significant digits of the factor shown to the user

NEEDS_DECIMALS = "conversion_needs_decimals"
TOO_LARGE = "conversion_too_large"
ROUNDS_TO_ZERO = "conversion_rounds_to_zero"


@dataclass
class Number:
    """One stored number in the unit that changes."""

    kind: str  # "ingredient_value" | "goal" | "basis" | "recipe_amount"
    row_id: int  # counted once per (kind, row_id): a goal's bounds are one goal
    name: str  # for a refusal: the goal's, ingredient's or recipe's name
    field: str  # "value" | "min" | "max" | "zero_reference" | "basis" | "amount"
    value: Decimal
    write: Callable[[Decimal], None]
    decimals: int | None = None  # None: round to VALUE_DECIMALS; n: must fit n decimals exactly
    positive: bool = False  # must stay above 0 after rounding


@dataclass(frozen=True)
class Converter:
    key: str  # the count's key in the answer
    numbers: Callable[[Session], list[Number]]  # in row id order


@dataclass(frozen=True)
class Refusal:
    """The facts of the first refused number."""

    type: str
    msg: str
    kind: str | None = None
    name: str | None = None
    field: str | None = None
    number: str | None = None
    converted: str | None = None
    decimals_needed: int | None = None
    # For a mapped source column that would stop converting: its source's name
    # and its own unit.
    source: str | None = None
    unit: str | None = None


@dataclass
class Change:
    kind: Literal["same", "convert", "no_convert"]
    factor: str | None
    counts: dict[str, int]
    rounded: int
    refusal: Refusal | None
    _writes: list[tuple[Number, Decimal]] = field(default_factory=list, repr=False)

    def apply(self) -> None:
        """Write every converted number. Only a `convert` without a refusal
        has any; the caller commits."""
        if self.kind != "convert" or self.refusal is not None:
            return
        for number, converted in self._writes:
            number.write(converted)


@dataclass(frozen=True)
class _Converted:
    value: Decimal | None = None
    rounded: bool = False
    refusal: str | None = None
    decimals_needed: int | None = None


def _decimals_needed(exact: Fraction) -> int | None:
    """How many decimals write `exact`, or None when no number of them does."""
    denominator = exact.denominator
    twos = fives = 0
    while denominator % 2 == 0:
        denominator //= 2
        twos += 1
    while denominator % 5 == 0:
        denominator //= 5
        fives += 1
    return max(twos, fives) if denominator == 1 else None


def _to_decimal(exact: Fraction, places: int) -> tuple[Decimal, bool]:
    """`exact` rounded half away from zero to `places` decimals, and whether
    digits were lost."""
    magnitude = abs(exact)
    scaled = magnitude * 10**places
    units_ = (2 * scaled.numerator + scaled.denominator) // (2 * scaled.denominator)
    rounded = Fraction(units_, 10**places) != magnitude
    return Decimal(-units_ if exact < 0 else units_).scaleb(-places), rounded


def _convert(value: Decimal, ratio: Fraction, decimals: int | None, positive: bool) -> _Converted:
    """`value` times `ratio`: the new number and whether it lost digits, or
    the type of the refusal. With `decimals` the result must fit that many
    exactly; without it the result rounds to 6 decimals."""
    exact = Fraction(value) * ratio
    if decimals is not None:
        needed = _decimals_needed(exact)
        if needed is None or needed > decimals:
            return _Converted(refusal=NEEDS_DECIMALS, decimals_needed=needed)
    places = models.VALUE_DECIMALS if decimals is None else decimals
    converted, rounded = _to_decimal(exact, places)
    if abs(converted) >= LIMIT:
        return _Converted(refusal=TOO_LARGE)
    if positive and converted <= 0:
        return _Converted(refusal=ROUNDS_TO_ZERO)
    return _Converted(value=converted, rounded=rounded)


def _shown(exact: Fraction) -> str:
    """A converted number for a message: exact where it terminates."""
    needed = _decimals_needed(exact)
    return plain(_to_decimal(exact, models.VALUE_DECIMALS if needed is None else needed)[0])


def _factor_text(ratio: Fraction) -> str:
    context = Context(prec=FACTOR_DIGITS)
    return plain(context.divide(Decimal(ratio.numerator), Decimal(ratio.denominator)))


def _refusal(number: Number, result: _Converted, ratio: Fraction, old: str, new: str) -> Refusal:
    exact = Fraction(number.value) * ratio
    shown, was = plain(number.value), _shown(exact)
    subject = f"{number.name}, {number.field}"
    if result.refusal == NEEDS_DECIMALS:
        if result.decimals_needed is None:
            msg = f"{subject}: {shown} {old} can't be written exactly in {new}."
        else:
            msg = f"{subject}: {shown} {old} would need {result.decimals_needed} decimals as {new}."
    elif result.refusal == TOO_LARGE:
        msg = f"{subject}: {shown} {old} would be {was} {new}, which is too large."
    else:
        msg = f"{subject}: {shown} {old} would round to 0 {new}, which is not allowed."
    return Refusal(
        type=result.refusal or "", msg=msg, kind=number.kind, name=number.name, field=number.field,
        number=shown, converted=was, decimals_needed=result.decimals_needed,
    )


def plan(db: Session, old_unit: str, new_unit: str, converters: list[Converter]) -> Change:
    """What changing `old_unit` to `new_unit` does to the numbers the
    converters name. Reads only. Counts are filled in for every kind; the
    refusal is the first problem, going through the converters in order and
    each one's rows as it gives them."""
    ratio = units.ratio(old_unit, new_unit)
    if units.normalise(old_unit) == units.normalise(new_unit) or ratio == 1:
        kind: Literal["same", "convert", "no_convert"] = "same"
    elif ratio is None:
        kind = "no_convert"
    else:
        kind = "convert"

    counts: dict[str, int] = {}
    writes: list[tuple[Number, Decimal]] = []
    refusal: Refusal | None = None
    rounded = 0
    for converter in converters:
        numbers = converter.numbers(db)
        counts[converter.key] = len({(n.kind, n.row_id) for n in numbers})
        if kind != "convert" or ratio is None:
            continue
        for number in numbers:
            result = _convert(number.value, ratio, number.decimals, number.positive)
            if result.refusal is not None:
                refusal = refusal or _refusal(number, result, ratio, old_unit, new_unit)
            elif result.value is not None:
                rounded += result.rounded
                writes.append((number, result.value))
    return Change(
        kind, _factor_text(ratio) if kind == "convert" and ratio is not None else None,
        counts, rounded, refusal, writes,
    )


def mapped_column_refusal(db: Session, attribute: models.Attribute, new_unit: str) -> Refusal | None:
    """The first column (by source, then column id) mapped to the attribute
    that would no longer convert with `new_unit`, or None. A mapping must keep
    converting (data source spec, decision 7), so such a change is refused."""
    rows = db.execute(
        select(models.SourceColumn, models.DataSource.name)
        .join(models.DataSource, models.DataSource.id == models.SourceColumn.source_id)
        .where(models.SourceColumn.attribute_id == attribute.id)
        .order_by(models.SourceColumn.source_id, models.SourceColumn.id)
    )
    for column, source in rows:
        if units.factor(column.unit, new_unit) is None:
            return Refusal(
                type="unit_mismatch",
                msg=(
                    f"{attribute.name} is mapped from {column.name} ({source}), which is in "
                    f"{column.unit or 'no unit'}, so it can't become {new_unit}. "
                    "Unmap the column on the data source page first."
                ),
                kind="source_column", name=column.name, source=source, unit=column.unit,
            )
    return None


def attribute_converters(attribute: models.Attribute, decimals: int) -> list[Converter]:
    """The numbers stored in an attribute's unit: its ingredient values and
    the live plan's goal bounds and zero references. `decimals` is the
    attribute's decimals as they will be saved. Saved results keep their own
    copy of units and numbers and are not touched."""

    def values(db: Session) -> list[Number]:
        rows = db.execute(
            select(models.IngredientValue, models.Ingredient.name)
            .join(models.Ingredient, models.Ingredient.id == models.IngredientValue.ingredient_id)
            .where(models.IngredientValue.attribute_id == attribute.id)
            .order_by(models.IngredientValue.ingredient_id)
        )

        def setter(row: models.IngredientValue):
            return lambda converted: setattr(row, "value", converted)

        return [
            Number("ingredient_value", row.ingredient_id, name, "value", row.value, setter(row))
            for row, name in rows
        ]

    def goals(db: Session) -> list[Number]:
        # Not queries.plan: a preview must not create the default plan.
        setup = db.get(models.Plan, queries.PLAN_ID)
        if setup is None:
            return []
        numbers: list[Number] = []
        for goal, name in translate.named_goals(sorted(setup.goals, key=lambda g: g.position)):
            if goal.attribute_id != attribute.id:
                continue
            for bound in ("min", "max", "zero_reference"):
                current = getattr(goal, bound)
                if current is not None:
                    numbers.append(Number(
                        "goal", goal.id, name, bound, current,
                        lambda converted, goal=goal, bound=bound: setattr(goal, bound, converted),
                        decimals=decimals,
                    ))
        return sorted(numbers, key=lambda n: n.row_id)

    return [Converter("ingredient_values", values), Converter("goals", goals)]


def ingredient_converters(ingredient: models.Ingredient, basis: Decimal) -> list[Converter]:
    """The numbers stored in an ingredient's unit: its basis (the one the
    form sends, as `PUT` saves it) and the amounts of every recipe line that
    uses it. Its values are per basis and stay as they are."""

    def basis_number(db: Session) -> list[Number]:
        return [Number(
            "basis", ingredient.id, ingredient.name, "basis", basis,
            lambda converted: setattr(ingredient, "basis", converted), positive=True,
        )]

    def amounts(db: Session) -> list[Number]:
        rows = db.execute(
            select(models.RecipeItem, models.Recipe.name)
            .join(models.Recipe, models.Recipe.id == models.RecipeItem.recipe_id)
            .where(models.RecipeItem.ingredient_id == ingredient.id)
            .order_by(models.RecipeItem.recipe_id)
        )

        def setter(row: models.RecipeItem):
            return lambda converted: setattr(row, "amount", converted)

        return [
            Number("recipe_amount", row.recipe_id, name, "amount", row.amount, setter(row), positive=True)
            for row, name in rows
        ]

    return [Converter("basis", basis_number), Converter("recipe_amounts", amounts)]
