"""Small, tie-free scenarios with hand-computed answers (decision #25)."""

from decimal import Decimal

import pytest

from meal_planner import (
    AttributeDef, ConflictMember, Constraint, Day, Ingredient, IngredientAmount,
    PlanRequest, Recipe, Slot, SolveStatus, TagDef, plan,
)

KCAL = AttributeDef("kcal", precision=0)
PROTEIN = AttributeDef("protein", precision=1)
COST = AttributeDef("cost", precision=2)
VEGAN = TagDef("vegan", "all")
NUTS = TagDef("contains-nuts", "any")

oats = Ingredient("oats", "g", {"kcal": 5})
porridge = Recipe("porridge", [IngredientAmount(oats, 100)])  # 500 kcal at 1x


def solve(recipes, days, constraints, attributes=(KCAL,), tags=(), **kw):
    return plan(PlanRequest(attributes, tags, recipes, days, constraints, **kw))


def test_soft_minimum_stops_at_the_serving_cap():
    # Shortfall costs 500/1200 per 1x; past the 2x cap each 1x costs 1/2. Stop at 2x.
    p = solve([porridge], [Day([Slot()])], [Constraint("energy", "kcal", min=1200)])
    assert p.solve_status is SolveStatus.OPTIMAL
    assert (p.slot(0, 0).recipe, p.slot(0, 0).multiplier) == ("porridge", Decimal(2))
    assert p.day_totals[0]["kcal"] == 1000
    (v,) = p.violations
    assert (v.constraint, v.day, v.side, v.bound, v.actual, v.amount) == (
        "energy", 0, "below", 1200, 1000, 200)
    assert v.percent == pytest.approx(Decimal(200) / 12)
    assert float(p.objective_value) == pytest.approx(200 / 1200, rel=1e-5)


def test_cheaper_serving_cap_lets_the_multiplier_pass_it():
    # Cap weight 0.5 costs 1/4 per 1x, less than the shortfall's 5/12: reach 1200 at 2.4x.
    loose = Recipe("porridge", [IngredientAmount(oats, 100)], serving_cap_weight=0.5)
    p = solve([loose], [Day([Slot()])], [Constraint("energy", "kcal", min=1200)])
    assert p.slot(0, 0).multiplier == Decimal("2.4")
    (v,) = p.violations
    assert (v.constraint, v.slot, v.amount, v.percent) == (
        "serving cap: porridge", 0, Decimal("0.4"), 20)


def test_asymmetric_range_weights_pick_the_cheaper_side():
    # 1x = 500 kcal, discrete whole servings: 2x misses min 1100 by 100, 3x passes max
    # 1400 by 100. Below weight 1 costs 100/1100; above weight 3 costs 300/1400. Pick 2x.
    whole = Recipe("porridge", [IngredientAmount(oats, 100)], multiplier_step=1, min_multiplier=1,
                   max_multiplier=4)
    c = Constraint("energy", "kcal", min=1100, max=1400, weight_above=3)
    p = solve([whole], [Day([Slot()])], [c])
    assert p.slot(0, 0).multiplier == 2
    (v,) = p.violations
    assert (v.side, v.amount) == ("below", 100)


def test_discrete_multiplier_lands_on_a_whole_step():
    # 6 g protein per egg. 3 eggs miss min 20 by 2 (2/20); 4 pass max 22 by 2 (2/22).
    egg = Ingredient("egg", "piece", {"protein": 6})
    eggs = Recipe("eggs", [IngredientAmount(egg, 1)], multiplier_step=1, min_multiplier=1,
                  max_multiplier=4)
    p = solve([eggs], [Day([Slot()])], [Constraint("protein", "protein", min=20, max=22)],
              attributes=[PROTEIN])
    assert p.slot(0, 0).multiplier == 4
    (v,) = p.violations
    assert (v.side, v.amount) == ("above", 2)
    assert v.percent == pytest.approx(Decimal(200) / 22)


def test_strict_mode_reports_a_minimal_conflict():
    # 1x pasta = 500 kcal for 5.00. 2000 kcal needs 4x = 20.00, over the budget of 10.
    pasta_i = Ingredient("pasta", "g", {"kcal": 5, "cost": 0.05})
    pasta = Recipe("pasta", [IngredientAmount(pasta_i, 100)])
    constraints = [
        Constraint("energy", "kcal", min=2000, hard=True),
        Constraint("budget", "cost", max=10, hard=True),
        Constraint("sanity", "kcal", max=100000, hard=True),
    ]
    p = solve([pasta], [Day([Slot()])], constraints, attributes=[KCAL, COST])
    assert p.solve_status is SolveStatus.INFEASIBLE
    assert set(p.conflicts.members) == {ConflictMember("energy", 0), ConflictMember("budget", 0)}
    assert p.slots == ()


def test_conflict_can_name_the_meal_floor_and_a_horizon_constraint():
    # Two served meals of at least 0.5x each are at least 500 kcal; the horizon max is 400.
    c = Constraint("cap", "kcal", scope="horizon", aggregate="total", max=400, hard=True)
    p = solve([porridge], [Day([Slot(), Slot()])], [c])
    assert set(p.conflicts.members) == {ConflictMember("min_meals_per_day", 0),
                                        ConflictMember("cap", None)}


def test_guardrail_reports_a_forced_one_day_spike():
    # Day 1 has no meal, so day 0 alone must carry the 2-day average of 80 g: 160 g = 4 shakes.
    # Moving day 0 from 80 to 160 g saves 1/160 per g on the horizon and costs only
    # 0.25/80 per g on the guard-rail, so the full spike wins.
    powder = Ingredient("whey", "scoop", {"protein": 40})
    shake = Recipe("shake", [IngredientAmount(powder, 1)], multiplier_step=1, min_multiplier=1,
                   max_multiplier=4)
    c = Constraint("protein", "protein", scope="horizon", aggregate="average_per_day",
                   min=80, max=80, guardrail_weight=0.25)
    p = solve([shake], [Day([Slot()]), Day([Slot("absent")])], [c], attributes=[PROTEIN])
    assert p.slot(0, 0).multiplier == 4
    assert p.horizon_totals["protein"] == 160
    rails = [(v.day, v.side, v.amount, v.percent) for v in p.violations]
    assert rails == [(0, "above", 80, 100), (1, "below", 80, 100)]
    assert float(p.objective_value) == pytest.approx(0.5, rel=1e-6)


def test_guardrail_spreads_an_average_evenly():
    # Without the guard-rail any split of 4 shakes over 2 days is free. With it only 2 + 2 is.
    powder = Ingredient("whey", "scoop", {"protein": 40})
    shake = Recipe("shake", [IngredientAmount(powder, 1)], multiplier_step=1, min_multiplier=1,
                   max_multiplier=3)
    c = Constraint("protein", "protein", scope="horizon", aggregate="average_per_day",
                   min=80, max=80)
    p = solve([shake], [Day([Slot()]), Day([Slot()])], [c], attributes=[PROTEIN])
    assert [p.slot(d, 0).multiplier for d in (0, 1)] == [2, 2]
    assert len(p.violations) == 0


def test_day_floor_forces_every_slot_to_be_served():
    # Both slots must hold at least 0.5x (250 kcal), so 500 kcal against a max of 300.
    p = solve([porridge], [Day([Slot(), Slot()])], [Constraint("light", "kcal", max=300)])
    assert [p.slot(0, s).multiplier for s in (0, 1)] == [Decimal("0.5"), Decimal("0.5")]
    (v,) = p.violations
    assert (v.side, v.amount) == ("above", 200)


def test_day_floor_of_zero_allows_an_empty_day():
    p = solve([porridge], [Day([Slot(), Slot()], min_meals_per_day=0)],
              [Constraint("light", "kcal", max=300)])
    assert [p.slot(0, s).recipe for s in (0, 1)] == [None, None]
    assert p.day_totals[0]["kcal"] == 0
    assert p.objective_value == 0


def test_absent_slot_stays_empty_and_adds_nothing():
    small = Recipe("snack", [IngredientAmount(oats, 50)])  # 250 kcal at 1x
    p = solve([small], [Day([Slot(), Slot("absent")])], [Constraint("energy", "kcal", min=500)])
    assert (p.slot(0, 0).recipe, p.slot(0, 0).multiplier) == ("snack", 2)
    absent = p.slot(0, 1)
    assert (absent.kind, absent.recipe, absent.totals["kcal"]) == ("absent", None, 0)
    assert len(p.violations) == 0


def test_tag_exclusion_removes_the_best_recipe():
    basil = Ingredient("basil", "g", {"kcal": 2}, {"vegan"})
    nuts = Ingredient("pine nuts", "g", {"kcal": 7}, {"vegan", "contains-nuts"})
    pesto = Recipe("pesto", [IngredientAmount(basil, 20), IngredientAmount(nuts, 80)])  # 600
    salad = Recipe("salad", [IngredientAmount(basil, 100)])  # 200
    c = Constraint("energy", "kcal", min=600, max=600)
    kw = dict(tags=[VEGAN, NUTS])
    assert solve([pesto, salad], [Day([Slot()])], [c], **kw).slot(0, 0).recipe == "pesto"
    p = solve([pesto, salad], [Day([Slot()])], [c], exclude_tags={"contains-nuts"}, **kw)
    # Salad shortfall costs 200/600 per 1x, the cap 1/2 per 1x: stop at 2x, 400 kcal.
    assert (p.slot(0, 0).recipe, p.slot(0, 0).multiplier) == ("salad", 2)
    (v,) = p.violations
    assert (v.side, v.amount) == ("below", 200)
