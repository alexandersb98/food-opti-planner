"""Read a solver's variable values back into a :class:`Plan`."""

from decimal import Decimal

from .backends.cpsat import SolveOutcome
from .builder import OBJECTIVE_SCALE, BuiltModel
from .request import PlanRequest
from .result import Plan, SlotAssignment, ViolationReport
from .scaling import MULTIPLIER_PRECISION, from_int
from .violations import violations


def decode(request: PlanRequest, built: BuiltModel, outcome: SolveOutcome) -> Plan:
    chosen = _chosen(built, outcome.values)
    zero = {a: Decimal(0) for a in built.precision}
    slots, day_totals = [], []
    for d, day in enumerate(request.days):
        day_total = dict(zero)
        for s, slot in enumerate(day.slots):
            if (d, s) not in chosen:
                slots.append(SlotAssignment(d, s, slot.kind, None, None, dict(zero)))
                continue
            recipe, ticks = chosen[(d, s)]
            totals = {
                a: from_int(built.recipe_units[(recipe, a)] * ticks, built.total_scale(a))
                for a in built.precision
            }
            for a in totals:
                day_total[a] += totals[a]
            multiplier = from_int(ticks, MULTIPLIER_PRECISION)
            slots.append(SlotAssignment(d, s, slot.kind, recipe, multiplier, totals))
        day_totals.append(day_total)
    horizon = {a: sum((t[a] for t in day_totals), Decimal(0)) for a in built.precision}
    report = ViolationReport(tuple(violations(request, slots, day_totals, horizon)))
    objective = Decimal(outcome.objective) / OBJECTIVE_SCALE
    return Plan(outcome.status, objective, tuple(slots), tuple(day_totals), horizon, report)


def _chosen(built: BuiltModel, values) -> dict[tuple[int, int], tuple[str, int]]:
    """(day, slot) -> (recipe name, multiplier in ticks) for each served slot."""
    chosen = {}
    for ch in built.choices:
        if values[ch.used.index]:
            ticks = values[ch.amount.index] * ch.ticks_per_amount
            chosen[(ch.day, ch.slot)] = (ch.recipe.name, ticks)
    return chosen
