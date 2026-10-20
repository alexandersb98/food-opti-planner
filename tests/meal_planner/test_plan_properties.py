"""Larger seeded scenarios checked against an independent exact recomputation."""

from fractions import Fraction

import pytest

from meal_planner import SolveStatus, plan

from scenarios import random_request


def exact(value):
    return Fraction(str(value))


def recompute_totals(request, p):
    """Day totals from the ingredient definitions, not from the planner's numbers."""
    recipes = {r.name: r for r in request.recipes}
    names = [a.name for a in request.attributes]
    days = [{a: Fraction(0) for a in names} for _ in request.days]
    for a in p.slots:
        if a.recipe is None:
            continue
        for item in recipes[a.recipe].items:
            for attr in names:
                per_unit = exact(item.ingredient.attributes.get(attr, 0))
                days[a.day][attr] += exact(item.quantity) * per_unit * exact(a.multiplier)
    return days


def penalty(c, actual, factor, weight_of):
    total = Fraction(0)
    for side, bound in (("below", c.min), ("above", c.max)):
        if bound is None:
            continue
        b = exact(bound) * factor
        miss = b - actual if side == "below" else actual - b
        if miss > 0:
            ref = exact(c.normalization_reference or bound) * factor
            total += exact(weight_of(side)) * miss / ref
    return total


def expected_objective(request, p, days):
    n = len(request.days)
    total = Fraction(0)
    for c in request.constraints:
        factor = n if c.aggregate == "average_per_day" else 1
        if not c.hard:
            if c.scope == "day":
                total += sum(penalty(c, d[c.attribute], 1, c.side_weight) for d in days)
            else:
                horizon = sum(d[c.attribute] for d in days)
                total += penalty(c, horizon, factor, c.side_weight)
        if c.has_guardrail():
            total += sum(penalty(c, d[c.attribute], 1, c.guardrail_side_weight) for d in days)
    recipes = {r.name: r for r in request.recipes}
    for a in p.slots:
        if a.recipe is not None:
            r = recipes[a.recipe]
            excess = exact(a.multiplier) - exact(r.max_multiplier)
            if excess > 0:
                total += exact(r.serving_cap_weight) * excess / exact(r.max_multiplier)
    return total


@pytest.mark.parametrize("seed", range(6))
def test_random_plans_hold_every_hard_rule(seed):
    request = random_request(seed)
    p = plan(request)
    assert p.solve_status is SolveStatus.OPTIMAL
    days = recompute_totals(request, p)
    for d, day in enumerate(request.days):
        assert days[d] == {k: exact(v) for k, v in p.day_totals[d].items()}
        served = [a for a in p.slots if a.day == d and a.recipe is not None]
        assert len(served) >= day.meal_floor()
        assert all(day.slots[a.slot].kind == "generated" for a in served)
        assert days[d]["cost"] <= 80
    assert sum(d["cost"] for d in days) <= 60 * len(request.days)
    recipes = {r.name: r for r in request.recipes}
    for a in p.slots:
        if a.recipe is not None:
            r = recipes[a.recipe]
            assert exact(r.min_multiplier) <= exact(a.multiplier) <= exact(r.hard_max_multiplier)
            if r.multiplier_step is not None:
                assert exact(a.multiplier) % exact(r.multiplier_step) == 0
    assert float(p.objective_value) == pytest.approx(
        float(expected_objective(request, p, days)), rel=1e-4, abs=1e-6)
