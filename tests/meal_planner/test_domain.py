from decimal import Decimal

import pytest

from meal_planner import AttributeDef, Ingredient, IngredientAmount, PlanRequestError, Recipe, TagDef

VEGAN = TagDef("vegan", "all")
NUTS = TagDef("contains-nuts", "any")
TAGS = {"vegan": VEGAN, "contains-nuts": NUTS}

basil = Ingredient("basil", "g", {"kcal": 0.2, "cost": 0.1}, {"vegan"})
pine_nuts = Ingredient("pine nuts", "g", {"kcal": 6.7}, {"vegan", "contains-nuts"})
cheese = Ingredient("parmesan", "g", {"kcal": 4.3, "cost": 0.25})


def test_attribute_defaults():
    assert AttributeDef("protein").precision == 3
    assert AttributeDef("protein").accrues_on == "eaten"
    assert AttributeDef("cost").accrues_on == "purchase"


def test_recipe_attribute_total_is_exact_sum():
    pesto = Recipe("pesto", [IngredientAmount(basil, 30), IngredientAmount(cheese, 20)])
    assert pesto.attribute_total("kcal") == Decimal("92.0")  # 30*0.2 + 20*4.3
    assert pesto.attribute_total("cost") == Decimal("8.0")


def test_missing_ingredient_attribute_counts_as_zero():
    nuts_only = Recipe("nuts", [IngredientAmount(pine_nuts, 10)])
    assert nuts_only.attribute_total("cost") == 0


def test_all_tag_needs_every_ingredient():
    vegan_pesto = Recipe("vegan pesto", [IngredientAmount(basil, 30), IngredientAmount(pine_nuts, 20)])
    pesto = Recipe("pesto", [IngredientAmount(basil, 30), IngredientAmount(cheese, 20)])
    assert "vegan" in vegan_pesto.tags(TAGS)
    assert "vegan" not in pesto.tags(TAGS)


def test_any_tag_needs_one_ingredient():
    vegan_pesto = Recipe("vegan pesto", [IngredientAmount(basil, 30), IngredientAmount(pine_nuts, 20)])
    assert "contains-nuts" in vegan_pesto.tags(TAGS)
    assert "contains-nuts" not in Recipe("b", [IngredientAmount(basil, 1)]).tags(TAGS)


def test_extra_tags_are_added():
    pesto = Recipe("pesto", [IngredientAmount(basil, 30)], extra_tags={"italian"})
    assert pesto.tags(TAGS) == {"vegan", "italian"}


def test_multiplier_defaults():
    r = Recipe("b", [IngredientAmount(basil, 1)])
    assert (r.min_multiplier, r.max_multiplier, r.hard_max_multiplier) == (0.5, 2.0, Decimal("6.0"))
    assert r.multiplier_step is None


@pytest.mark.parametrize(
    "kwargs, message",
    [
        ({"items": []}, "has no ingredients"),
        ({"min_multiplier": 3}, "multipliers must satisfy"),
        ({"hard_max_multiplier": 1.5}, "multipliers must satisfy"),
        ({"multiplier_step": 0.4}, "not a multiple of step"),
        ({"multiplier_step": 0}, "multiplier_step must be positive"),
        ({"serving_cap_weight": -1}, "serving_cap_weight is negative"),
    ],
)
def test_recipe_validation(kwargs, message):
    args = {"name": "r", "items": [IngredientAmount(basil, 1)], **kwargs}
    with pytest.raises(PlanRequestError, match=message):
        Recipe(**args)


def test_recipe_collects_every_problem():
    with pytest.raises(PlanRequestError) as err:
        Recipe("r", [], min_multiplier=3)
    assert len(err.value.problems) == 2


@pytest.mark.parametrize(
    "make, message",
    [
        (lambda: AttributeDef("x", precision=9), "precision 9 outside"),
        (lambda: AttributeDef("x", accrues_on="later"), "accrues_on"),
        (lambda: TagDef("x", "some"), "derive must be one of"),
        (lambda: IngredientAmount(basil, 0), "must be positive"),
    ],
)
def test_other_validation(make, message):
    with pytest.raises(PlanRequestError, match=message):
        make()


def test_plan_request_error_is_a_value_error():
    assert issubclass(PlanRequestError, ValueError)
