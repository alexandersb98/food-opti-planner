"""How a constraint unfolds into concrete bounds over the planned days.

The builder turns these into model constraints and penalties, and the
planner checks the solved plan against the same bounds, so the meaning of
a constraint (factor, normalization reference, guard-rail) lives only here.
All values are real numbers (Decimal), not yet scaled to integers.
"""

from dataclasses import dataclass
from decimal import Decimal

from .constraint import Constraint
from .scaling import to_decimal


@dataclass(frozen=True)
class HardBound:
    """``low <= total <= high`` for one day, or the horizon when ``day`` is None."""

    constraint: str
    attribute: str
    day: int | None
    low: Decimal | None
    high: Decimal | None


@dataclass(frozen=True)
class SoftSide:
    """One penalized side: "below" ``bound`` (min) or "above" it (max)."""

    side: str
    bound: Decimal
    reference: Decimal  # the miss is penalized as weight * amount / reference (#17)
    weight: Decimal


@dataclass(frozen=True)
class SoftBound:
    name: str  # the constraint's name, or its guard-rail name
    attribute: str
    day: int | None
    sides: tuple[SoftSide, ...]


def guardrail_name(c: Constraint) -> str:
    return f"{c.name} (day guard-rail)"


def factor(c: Constraint, days: int) -> int:
    """A per-day average over ``days`` days is checked as a horizon total."""
    return days if c.aggregate == "average_per_day" else 1


def target_days(c: Constraint, days: int) -> list[int | None]:
    return list(range(days)) if c.scope == "day" else [None]


def hard_bounds(c: Constraint, days: int) -> list[HardBound]:
    if not c.hard:
        return []
    f = factor(c, days)
    low = None if c.min is None else to_decimal(c.min) * f
    high = None if c.max is None else to_decimal(c.max) * f
    return [HardBound(c.name, c.attribute, d, low, high) for d in target_days(c, days)]


def soft_bounds(c: Constraint, days: int) -> list[SoftBound]:
    """The constraint's own soft bounds, then its day guard-rails (#18)."""
    found = []
    if not c.hard:
        sides = _sides(c, factor(c, days), c.side_weight)
        found += [SoftBound(c.name, c.attribute, d, sides) for d in target_days(c, days)]
    if c.has_guardrail():
        sides = _sides(c, 1, c.guardrail_side_weight)
        found += [SoftBound(guardrail_name(c), c.attribute, d, sides) for d in range(days)]
    return found


def _sides(c: Constraint, f: int, weight_of) -> tuple[SoftSide, ...]:
    sides = []
    for side, value in (("below", c.min), ("above", c.max)):
        weight = None if value is None else weight_of(side)
        if not weight:
            continue
        reference = c.normalization_reference
        reference = to_decimal(value if reference is None else reference) * f
        sides.append(SoftSide(side, to_decimal(value) * f, reference, weight))
    return tuple(sides)
