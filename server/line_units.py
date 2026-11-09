"""How a recipe line's unit becomes the ingredient's own unit (import spec,
"Conversion when a plan is made"). Pure: no database, no FastAPI. The unit
catalogue (`units`) stays the only unit table; this module only decides which
step to use.

For a line `unit` of an ingredient with own unit `own` and stored conversions
(unit, factor) in id order, the first rule that applies:

1. `unit` is empty or the same unit as `own`: factor 1.
2. A stored conversion for the same unit as `unit`: its factor (a stored
   conversion wins over a catalogue step).
3. A catalogue step straight to `own`: that ratio.
4. A catalogue step to the unit of a stored conversion (the first in order
   that the catalogue can reach): the ratio times the conversion's factor.
5. Otherwise the line does not convert.

A conversion's factor says how many of `own` one of its unit makes, so
"1 dl = 40 g" is ("dl", 40) on a g ingredient.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from fractions import Fraction

from . import units


@dataclass(frozen=True)
class Route:
    factor: Fraction  # multiplies the line's amount to give the amount in `own`
    via: str | None  # the stored conversion's unit, as stored; None: none used


def is_own(line_unit: str, own_unit: str) -> bool:
    """Whether the line is in the ingredient's own unit (empty counts)."""
    return not line_unit.strip() or units.ratio(line_unit, own_unit) == 1


def route(line_unit: str, own_unit: str, conversions: Sequence[tuple[str, Decimal]]) -> Route | None:
    """The exact factor from `line_unit` to `own_unit`, and the stored
    conversion it went through, or None when the line does not convert."""
    if is_own(line_unit, own_unit):
        return Route(Fraction(1), None)
    for unit, factor in conversions:
        if units.ratio(line_unit, unit) == 1:
            return Route(Fraction(factor), unit)
    step = units.ratio(line_unit, own_unit)
    if step is not None:
        return Route(step, None)
    for unit, factor in conversions:
        step = units.ratio(line_unit, unit)
        if step is not None:
            return Route(step * Fraction(factor), unit)
    return None
