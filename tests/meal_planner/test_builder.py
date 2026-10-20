import pytest

from meal_planner import (
    AttributeDef, Constraint, Day, Ingredient, IngredientAmount, ModelTooLargeError,
    PlanRequest, Recipe, Slot,
)
from meal_planner.builder import MEAL_FLOOR, OBJECTIVE_SCALE, build, penalty_coefficient

KCAL = AttributeDef("kcal", precision=0)
oats = Ingredient("oats", "g", {"kcal": 4})
porridge = Recipe("porridge", [IngredientAmount(oats, 100)])  # 400 kcal at 1x
eggs = Recipe("eggs", [IngredientAmount(oats, 50)], multiplier_step=0.5)  # 200 kcal


def request(days, constraints=(), recipes=(porridge, eggs)):
    return PlanRequest([KCAL], [], recipes, days, constraints)


def test_one_choice_per_generated_slot_and_recipe():
    built = build(request([Day([Slot(), Slot("absent")])]))
    assert [(c.day, c.slot, c.recipe.name) for c in built.choices] == [
        (0, 0, "porridge"), (0, 0, "eggs"),
    ]
    assert built.recipe_units[("porridge", "kcal")] == 400


def test_multiplier_variables_in_ticks_or_steps():
    by_name = {c.recipe.name: c for c in build(request([Day([Slot()])])).choices}
    cont, disc = by_name["porridge"], by_name["eggs"]
    assert (cont.ticks_per_amount, cont.amount.ub) == (1, 6000)  # thousandths up to 6x
    assert (disc.ticks_per_amount, disc.amount.ub) == (500, 12)  # half steps up to 6x
    assert (cont.used.lb, cont.used.ub) == (0, 1)


def test_at_most_one_recipe_per_slot():
    built = build(request([Day([Slot()])]))
    used = {c.used.index for c in built.choices}
    assert any(set(c.expr.terms) == used and c.ub == 1 for c in built.model.constraints)


def test_meal_floor_is_a_guarded_hard_constraint():
    built = build(request([Day([Slot(), Slot()]), Day([Slot()], min_meals_per_day=0)]))
    guards = [(g.constraint, g.day) for g in built.model.guards]
    assert guards == [(MEAL_FLOOR, 0)]
    floor = [c for c in built.model.constraints if c.enforced_by is not None]
    assert floor[0].lb == 2


def test_hard_day_constraint_gets_one_guard_per_day():
    c = Constraint("energy", "kcal", min=1800, hard=True)
    built = build(request([Day([Slot()]), Day([Slot()])], [c]))
    assert [(g.constraint, g.day) for g in built.model.guards if g.constraint == "energy"] == [
        ("energy", 0), ("energy", 1),
    ]
    guarded = [k for k in built.model.constraints if k.lb == 1800 * 10**3]
    assert len(guarded) == 2  # kcal precision 0 plus multiplier precision 3


def test_average_per_day_bound_is_multiplied_by_days_including_absent_ones():
    c = Constraint("energy", "kcal", scope="horizon", aggregate="average_per_day",
                   max=2000, hard=True, add_day_guardrail=False)
    days = [Day([Slot()]), Day([Slot("absent")]), Day([Slot()])]
    built = build(request(days, [c]))
    assert [g.day for g in built.model.guards if g.constraint == "energy"] == [None]
    assert any(k.ub == 3 * 2000 * 10**3 for k in built.model.constraints)


def test_soft_range_has_one_slack_per_side_with_normalized_coefficient():
    c = Constraint("energy", "kcal", min=1200, max=1500, weight_above=3)
    built = build(request([Day([Slot()])], [c]))
    terms = {(t.side): t for t in built.soft_terms}
    assert terms["below"].coefficient == round(OBJECTIVE_SCALE / (10**3 * 1200))
    assert terms["above"].coefficient == round(OBJECTIVE_SCALE * 3 / (10**3 * 1500))
    assert built.model.objective.terms[terms["below"].slack.index] == terms["below"].coefficient


def test_unreachable_side_gets_no_slack():
    c = Constraint("energy", "kcal", max=10**6)  # 6x of 400 kcal can never exceed it
    assert build(request([Day([Slot()])], [c])).soft_terms == []


def test_guardrail_adds_soft_day_copies_even_for_hard_horizon_constraints():
    c = Constraint("energy", "kcal", scope="horizon", aggregate="average_per_day",
                   min=1800, hard=True, weight=4)
    built = build(request([Day([Slot()]), Day([Slot()])], [c]))
    rails = [(t.constraint, t.day, t.side) for t in built.soft_terms]
    assert rails == [("energy (day guard-rail)", 0, "below"), ("energy (day guard-rail)", 1, "below")]
    assert built.soft_terms[0].coefficient == penalty_coefficient(2, 1800, 3)


def test_serving_cap_penalizes_excess_ticks():
    built = build(request([Day([Slot()])], recipes=[porridge]))
    (excess_coef,) = built.model.objective.terms.values()
    assert excess_coef == OBJECTIVE_SCALE // (10**3 * 2)  # weight 1, per tick, / max 2.0


def test_penalty_coefficient_never_rounds_a_positive_weight_to_zero():
    assert penalty_coefficient(1e-9, 10**6, 6) == 1
    assert penalty_coefficient(0, 5, 3) == 0


def test_model_too_large():
    huge = AttributeDef("huge", precision=6)
    heavy = Ingredient("heavy", "g", {"huge": 10**9})
    r = Recipe("r", [IngredientAmount(heavy, 1000)])
    req = PlanRequest([huge], [], [r], [Day([Slot()])], [Constraint("c", "huge", max=1, hard=True)])
    with pytest.raises(ModelTooLargeError):
        build(req)
