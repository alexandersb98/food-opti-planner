"""Check a decoded plan against its soft bounds and serving caps."""

from decimal import Decimal
from typing import Iterator, Mapping, Sequence

from .bounds import SoftBound, soft_bounds
from .request import PlanRequest
from .result import SlotAssignment, Violation
from .scaling import to_decimal


def violations(request: PlanRequest, slots: Sequence[SlotAssignment],
               day_totals: Sequence[Mapping[str, Decimal]],
               horizon: Mapping[str, Decimal]) -> Iterator[Violation]:
    days = len(request.days)
    for c in request.constraints:
        for bound in soft_bounds(c, days):
            totals = horizon if bound.day is None else day_totals[bound.day]
            yield from _misses(bound, totals[bound.attribute])
    yield from _serving_cap_misses(request, slots)


def _misses(bound: SoftBound, actual: Decimal) -> Iterator[Violation]:
    for s in bound.sides:
        amount = s.bound - actual if s.side == "below" else actual - s.bound
        if amount > 0:
            yield Violation(bound.name, bound.day, None, s.side, s.bound, actual,
                            amount, amount * 100 / s.reference)


def _serving_cap_misses(request: PlanRequest,
                        slots: Sequence[SlotAssignment]) -> Iterator[Violation]:
    recipes = {r.name: r for r in request.recipes}
    for a in slots:
        if a.recipe is None:
            continue
        recipe = recipes[a.recipe]
        cap = to_decimal(recipe.max_multiplier)
        if a.multiplier > cap and to_decimal(recipe.serving_cap_weight) > 0:
            excess = a.multiplier - cap
            yield Violation(f"serving cap: {recipe.name}", a.day, a.slot, "above",
                            cap, a.multiplier, excess, excess * 100 / cap)
