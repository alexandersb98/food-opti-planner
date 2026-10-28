from decimal import Decimal

import pytest

from meal_planner import (
    AttributeDef, Constraint, Day, Ingredient, IngredientAmount, PlanRequest,
    PlanRequestError, Recipe, Slot, TagDef, recipe_passes,
)

KCAL = AttributeDef("kcal", precision=0)
VEGAN = TagDef("vegan", "all")
NUTS = TagDef("contains-nuts", "any")
basil = Ingredient("basil", "g", {"kcal": 0.2}, {"vegan"})
pine_nuts = Ingredient("pine nuts", "g", {"kcal": 6.7}, {"vegan", "contains-nuts"})
cheese = Ingredient("parmesan", "g", {"kcal": 4.3})
salad = Recipe("salad", [IngredientAmount(basil, 100)])
vegan_pesto = Recipe("vegan pesto", [IngredientAmount(basil, 30), IngredientAmount(pine_nuts, 20)])
pesto = Recipe("pesto", [IngredientAmount(basil, 30), IngredientAmount(cheese, 20)])
ONE_DAY = [Day([Slot()])]


def make(**kwargs):
    args = dict(attributes=[KCAL], tags=[VEGAN, NUTS], recipes=[salad, vegan_pesto, pesto],
                days=ONE_DAY)
    args.update(kwargs)
    return PlanRequest(**args)


def test_valid_request_builds():
    request = make(constraints=[Constraint("energy", "kcal", min=1800, max=2200)])
    assert request.solve_time_limit == 30.0
    assert len(request.eligible_recipes()) == 3


def test_exclude_tags_removes_recipes_with_any_excluded_tag():
    names = [r.name for r in make(exclude_tags={"contains-nuts"}).eligible_recipes()]
    assert names == ["salad", "pesto"]


def test_require_tags_keeps_recipes_with_every_required_tag():
    names = [r.name for r in make(require_tags={"vegan"}).eligible_recipes()]
    assert names == ["salad", "vegan pesto"]


def test_recipe_passes_with_every_required_tag_and_no_excluded_one():
    tags = frozenset({"vegan", "quick"})
    assert recipe_passes(tags, frozenset(), frozenset())
    assert recipe_passes(tags, frozenset({"vegan", "quick"}), frozenset({"contains-nuts"}))
    assert not recipe_passes(tags, frozenset({"vegan", "contains-nuts"}), frozenset())
    assert not recipe_passes(tags, frozenset(), frozenset({"quick"}))


def test_no_recipe_left_after_filters():
    with pytest.raises(PlanRequestError, match="no recipes left"):
        make(require_tags={"vegan"}, exclude_tags={"vegan"})


def test_cross_reference_problems_are_collected_together():
    stray = Ingredient("stray", "g", {"sugar": 1}, {"keto"})
    with pytest.raises(PlanRequestError) as err:
        make(
            attributes=[KCAL, KCAL],
            recipes=[salad, salad, Recipe("odd", [IngredientAmount(stray, 1)], extra_tags={"x"})],
            constraints=[Constraint("c", "fat", max=1), Constraint("c", "kcal", max=1)],
            exclude_tags={"nope"},
        )
    problems = err.value.problems
    assert "duplicate attribute name 'kcal'" in problems
    assert "duplicate recipe name 'salad'" in problems
    assert "duplicate constraint name 'c'" in problems
    assert "ingredient 'stray': unknown attribute 'sugar'" in problems
    assert "ingredient 'stray': unknown tag 'keto'" in problems
    assert "recipe 'odd': unknown tag 'x'" in problems
    assert "constraint 'c': unknown attribute 'fat'" in problems
    assert "unknown tag 'nope' in exclude_tags/require_tags" in problems


def test_two_ingredients_with_one_name():
    other_basil = Ingredient("basil", "bunch", {"kcal": 5})
    with pytest.raises(PlanRequestError, match="two different ingredients named 'basil'"):
        make(recipes=[salad, Recipe("r", [IngredientAmount(other_basil, 1)])])


def test_day_meal_floor_defaults_to_all_generated_slots():
    day = Day([Slot(), Slot("absent"), Slot()])
    assert day.meal_floor() == 2
    assert Day([Slot(), Slot()], min_meals_per_day=0).meal_floor() == 0


def test_day_meal_floor_cannot_exceed_generated_slots():
    with pytest.raises(PlanRequestError, match="min_meals_per_day 2 not within 0..1"):
        Day([Slot(), Slot("absent")], min_meals_per_day=2)


def test_unsupported_slot_kind():
    with pytest.raises(PlanRequestError, match="slot kind 'external' not supported"):
        Slot("external")


@pytest.mark.parametrize(
    "kwargs, message",
    [
        ({}, "needs min, max or both"),
        ({"min": 5, "max": 4}, "min 5 greater than max 4"),
        ({"max": 4, "weight": -1}, "weight is negative"),
        ({"max": 4, "weight_above": -1}, "weight_above is negative"),
        ({"max": 4, "scope": "week"}, "scope must be one of"),
        ({"max": 4, "aggregate": "total"}, "aggregate applies to horizon scope only"),
        ({"max": 4, "scope": "horizon"}, "horizon scope needs aggregate"),
        ({"max": 0}, "a zero bound needs normalization_reference"),
        ({"max": 4, "normalization_reference": 0}, "normalization_reference must be positive"),
    ],
)
def test_constraint_validation(kwargs, message):
    with pytest.raises(PlanRequestError, match=message):
        Constraint("c", "kcal", **kwargs)


def test_zero_bound_is_fine_when_no_penalty_uses_it():
    Constraint("c", "kcal", max=0, hard=True)
    Constraint("c", "kcal", max=0, normalization_reference=10)


def test_hard_average_with_guardrail_still_needs_a_reference_for_zero():
    with pytest.raises(PlanRequestError, match="zero bound"):
        Constraint("c", "kcal", scope="horizon", aggregate="average_per_day", max=0, hard=True)


def test_side_and_guardrail_weights():
    c = Constraint("c", "kcal", scope="horizon", aggregate="average_per_day",
                   min=1, max=2, weight=4, weight_above=6)
    assert (c.side_weight("below"), c.side_weight("above")) == (4, 6)
    assert (c.guardrail_side_weight("below"), c.guardrail_side_weight("above")) == (2, 3)
    explicit = Constraint("c", "kcal", scope="horizon", aggregate="average_per_day",
                          min=1, guardrail_weight=0.25)
    assert explicit.guardrail_side_weight("below") == Decimal("0.25")
    assert explicit.has_guardrail()
    assert not Constraint("c", "kcal", scope="horizon", aggregate="total", min=1).has_guardrail()


@pytest.mark.parametrize("bad", [float("inf"), float("nan"), "abc", True])
@pytest.mark.parametrize(
    "field_name",
    ["min", "max", "weight", "weight_below", "weight_above", "guardrail_weight",
     "normalization_reference"],
)
def test_constraint_rejects_non_finite_numbers(field_name, bad):
    kwargs = {"max": 4, field_name: bad}
    with pytest.raises(PlanRequestError, match="must be a finite number"):
        Constraint("c", "kcal", **kwargs)


@pytest.mark.parametrize("bad", [float("inf"), float("nan"), "abc"])
def test_solve_time_limit_must_be_finite(bad):
    with pytest.raises(PlanRequestError, match="solve_time_limit must be a finite number"):
        make(solve_time_limit=bad)


@pytest.mark.parametrize("name", ["exclude_tags", "require_tags"])
def test_bare_string_tag_filter_is_rejected(name):
    with pytest.raises(PlanRequestError, match=f"{name} must be a collection of tag names"):
        make(**{name: "vegan"})
