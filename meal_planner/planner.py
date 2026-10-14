"""``plan(request) -> Plan``: the one public entry point (STRICT mode, #14)."""

from decimal import Decimal

from .backends import cpsat
from .builder import OBJECTIVE_SCALE, BuiltModel, build, guardrail_name
from .request import Constraint, PlanRequest
from .result import (
    ConflictMember,
    ConflictReport,
    Plan,
    SlotAssignment,
    SolveStatus,
    Violation,
    ViolationReport,
)
from .scaling import MULTIPLIER_PRECISION, from_int, to_decimal

_STATUS = {
    "OPTIMAL": SolveStatus.OPTIMAL,
    "FEASIBLE": SolveStatus.FEASIBLE,
    "INFEASIBLE": SolveStatus.INFEASIBLE,
    "UNKNOWN": SolveStatus.TIMEOUT_NO_SOLUTION,
}


def plan(request: PlanRequest) -> Plan:
    built = build(request)
    outcome = cpsat.solve(built.model, request.solve_time_limit)
    status = _STATUS[outcome.status]
    if status is SolveStatus.INFEASIBLE:
        core = minimize_core(built, outcome.core, request.solve_time_limit)
        guards = built.model.guards
        members = tuple(ConflictMember(guards[g].constraint, guards[g].day) for g in core)
        return Plan(status, conflicts=ConflictReport(members))
    if status is SolveStatus.TIMEOUT_NO_SOLUTION:
        return Plan(status)
    return _decode(request, built, outcome, status)


def minimize_core(built: BuiltModel, core, time_limit: float) -> tuple[int, ...]:
    """Drop each member in turn; keep it only if the rest become feasible.

    A re-solve that times out counts as feasible, so the member is kept.
    """
    members = list(core)
    for guard in list(members):
        trial = [g for g in members if g != guard]
        outcome = cpsat.solve(built.model, time_limit, assumed=trial, optimize=False)
        if outcome.status == "INFEASIBLE":
            members = trial
    return tuple(members)


def _decode(request: PlanRequest, built: BuiltModel, outcome, status) -> Plan:
    values = outcome.values
    precision = {a.name: a.precision for a in request.attributes}
    chosen = {}
    for ch in built.choices:
        if values[ch.used.index]:
            chosen[(ch.day, ch.slot)] = (ch, values[ch.amount.index] * ch.ticks_per_amount)
    zero = {a: Decimal(0) for a in precision}
    slots, day_totals = [], []
    for d, day in enumerate(request.days):
        day_total = dict(zero)
        for s, slot in enumerate(day.slots):
            if (d, s) not in chosen:
                slots.append(SlotAssignment(d, s, slot.kind, None, None, dict(zero)))
                continue
            ch, ticks = chosen[(d, s)]
            totals = {
                a: from_int(built.recipe_units[(ch.recipe.name, a)] * ticks,
                            p + MULTIPLIER_PRECISION)
                for a, p in precision.items()
            }
            for a in totals:
                day_total[a] += totals[a]
            multiplier = from_int(ticks, MULTIPLIER_PRECISION)
            slots.append(SlotAssignment(d, s, slot.kind, ch.recipe.name, multiplier, totals))
        day_totals.append(day_total)
    horizon = {a: sum((t[a] for t in day_totals), Decimal(0)) for a in precision}
    report = ViolationReport(tuple(_violations(request, slots, day_totals, horizon)))
    objective = Decimal(outcome.objective) / OBJECTIVE_SCALE
    return Plan(status, objective, tuple(slots), tuple(day_totals), horizon, report)


def _violations(request, slots, day_totals, horizon):
    days = len(request.days)
    for c in request.constraints:
        factor = days if c.aggregate == "average_per_day" else 1
        if not c.hard:
            if c.scope == "day":
                for d, totals in enumerate(day_totals):
                    yield from _misses(c, c.name, d, totals[c.attribute], 1, c.side_weight)
            else:
                yield from _misses(c, c.name, None, horizon[c.attribute], factor,
                                   c.side_weight)
        if c.has_guardrail():
            for d, totals in enumerate(day_totals):
                yield from _misses(c, guardrail_name(c), d, totals[c.attribute], 1,
                                   c.guardrail_side_weight)
    for a in slots:
        if a.recipe is None:
            continue
        recipe = next(r for r in request.recipes if r.name == a.recipe)
        cap = to_decimal(recipe.max_multiplier)
        if a.multiplier > cap and to_decimal(recipe.serving_cap_weight) > 0:
            excess = a.multiplier - cap
            yield Violation(f"serving cap: {recipe.name}", a.day, a.slot, "above",
                            cap, a.multiplier, excess, excess * 100 / cap)


def _misses(c: Constraint, name, day, actual, factor, weight_of):
    for side, value in (("below", c.min), ("above", c.max)):
        if value is None or weight_of(side) == 0:
            continue
        bound = to_decimal(value) * factor
        amount = bound - actual if side == "below" else actual - bound
        if amount <= 0:
            continue
        reference = to_decimal(
            c.normalization_reference if c.normalization_reference is not None else value
        ) * factor
        yield Violation(name, day, None, side, bound, actual, amount,
                        amount * 100 / reference)
