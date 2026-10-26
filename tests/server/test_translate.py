"""The mapping rules from stored data to library objects, without a database."""

from datetime import date
from decimal import Decimal

import pytest

from meal_planner import IngredientAmount, Recipe
from server import models, translate

ENERGY = models.Attribute(id=1, name="Energy", unit="kcal", decimals=0)
PROTEIN = models.Attribute(id=2, name="Protein", unit="g", decimals=1)
VEGAN = models.Tag(id=1, name="vegan", derive="all")


def oats(basis="100", values=(), tags=()) -> models.Ingredient:
    return models.Ingredient(
        name="Oats",
        unit="g",
        basis=Decimal(basis),
        values=[models.IngredientValue(attribute=a, value=Decimal(v)) for a, v in values],
        tags=list(tags),
    )


def test_name_unit_and_tags_are_copied():
    ingredient = translate.ingredient(oats(tags=[VEGAN]))
    assert (ingredient.name, ingredient.unit, ingredient.tags) == ("Oats", "g", frozenset({"vegan"}))


def test_a_typed_value_is_divided_by_the_value_basis():
    ingredient = translate.ingredient(oats("100", [(ENERGY, "389"), (PROTEIN, "16.9")]))
    assert ingredient.attributes == {"Energy": Decimal("3.89"), "Protein": Decimal("0.169")}


def test_a_basis_of_one_keeps_the_value():
    egg = translate.ingredient(oats("1", [(PROTEIN, "6.3")]))
    assert egg.attributes == {"Protein": Decimal("6.3")}


def test_the_division_is_exact_enough_for_any_precision():
    """1/3 per unit, times 300 units, is 100 to well beyond 6 decimals."""
    ingredient = translate.ingredient(oats("3", [(ENERGY, "1")]))
    recipe = Recipe("Bowl", items=[IngredientAmount(ingredient, 300)])
    assert abs(recipe.attribute_total("Energy") - 100) < Decimal("1e-20")


def test_an_attribute_without_a_value_counts_as_0():
    ingredient = translate.ingredient(oats("100", [(ENERGY, "389")]))
    assert "Protein" not in ingredient.attributes
    recipe = Recipe("Bowl", items=[IngredientAmount(ingredient, 50)])
    assert recipe.attribute_total("Protein") == 0
    assert recipe.attribute_total("Energy") == Decimal("194.5")


def porridge(**fields) -> models.Recipe:
    milk = models.Ingredient(name="Milk", unit="ml", basis=Decimal("100"), values=[], tags=[])
    defaults = {
        "name": "Porridge",
        "min_multiplier": Decimal("0.5"),
        "max_multiplier": Decimal("2"),
        "step": None,
        "hard_max_multiplier": None,
        "serving_cap_weight": Decimal("1"),
        "items": [
            models.RecipeItem(ingredient=oats("100", [(ENERGY, "389")]), amount=Decimal("60")),
            models.RecipeItem(ingredient=milk, amount=Decimal("200")),
        ],
        "extra_tags": [],
    }
    return models.Recipe(**{**defaults, **fields})


def test_a_tag_keeps_its_name_and_rule():
    tag = translate.tag(models.Tag(name="contains-nuts", derive="any"))
    assert (tag.name, tag.derive) == ("contains-nuts", "any")


def test_a_recipes_items_are_its_ingredients_in_order_with_their_amounts():
    recipe = translate.recipe(porridge())
    assert [(i.ingredient.name, i.quantity) for i in recipe.items] == [("Oats", 60), ("Milk", 200)]
    assert recipe.items[0].ingredient.attributes == {"Energy": Decimal("3.89")}
    assert recipe.attribute_total("Energy") == Decimal("233.4")


def test_tags_added_by_hand_are_extra_tags():
    recipe = translate.recipe(porridge(extra_tags=[VEGAN]))
    assert recipe.extra_tags == frozenset({"vegan"})


def test_the_portion_size_fields_are_copied():
    recipe = translate.recipe(porridge(
        min_multiplier=Decimal("1"), max_multiplier=Decimal("2.5"), step=Decimal("0.5"),
        hard_max_multiplier=Decimal("4"), serving_cap_weight=Decimal("0"),
    ))
    assert (
        recipe.min_multiplier, recipe.max_multiplier, recipe.multiplier_step,
        recipe.hard_max_multiplier, recipe.serving_cap_weight,
    ) == (1, Decimal("2.5"), Decimal("0.5"), 4, 0)


def test_any_amount_is_no_step_and_no_hard_limit_is_3_times_the_soft_one():
    recipe = translate.recipe(porridge(max_multiplier=Decimal("1.5")))
    assert recipe.multiplier_step is None
    assert recipe.hard_max_multiplier == Decimal("4.5")


def test_derived_tags_come_from_the_ingredients_by_each_tags_rule():
    nuts = models.Tag(name="contains-nuts", derive="any")
    almonds = models.Ingredient(name="Almonds", unit="g", basis=Decimal("100"), values=[], tags=[VEGAN, nuts])
    recipe = translate.recipe(porridge(items=[
        models.RecipeItem(ingredient=oats(tags=[VEGAN]), amount=Decimal("60")),
        models.RecipeItem(ingredient=almonds, amount=Decimal("10")),
    ]))
    tag_defs = {tag.name: translate.tag(tag) for tag in (VEGAN, nuts)}
    assert recipe.tags(tag_defs) == frozenset({"vegan", "contains-nuts"})


# The plan


def test_an_attribute_keeps_its_name_and_its_decimals_are_the_precision():
    attribute = translate.attribute(PROTEIN)
    assert (attribute.name, attribute.precision) == ("Protein", 1)
    assert translate.attribute(ENERGY).precision == 0


def plan(days=3, skips=(), minimums=(), solve_time_limit=30) -> models.Plan:
    """Breakfast, Lunch and Dinner; `skips` are (day, meal position) pairs,
    `minimums` (day, at least) pairs."""
    meals = [
        models.PlanMeal(position=position, name=name, skips=[
            models.PlanSkip(day=day) for day, meal in skips if meal == position
        ])
        for position, name in enumerate(["Breakfast", "Lunch", "Dinner"])
    ]
    return models.Plan(
        start_date=date(2026, 10, 26),
        days=days,
        meals=meals,
        minimums=[models.PlanDayMinimum(day=day, at_least=at_least) for day, at_least in minimums],
        solve_time_limit=solve_time_limit,
    )


def test_each_day_has_a_slot_per_meal_planned_unless_skipped():
    days = translate.days(plan(skips=[(0, 1), (2, 0), (2, 2)]))
    assert [[slot.kind for slot in day.slots] for day in days] == [
        ["generated", "absent", "generated"],
        ["generated", "generated", "generated"],
        ["absent", "generated", "absent"],
    ]


def test_at_least_all_is_no_minimum_and_a_number_is_the_minimum():
    days = translate.days(plan(skips=[(1, 0)], minimums=[(1, 1), (2, 0)]))
    assert [day.min_meals_per_day for day in days] == [None, 1, 0]


def test_the_meals_follow_their_positions_not_the_list_order():
    setup = plan(skips=[(0, 0)])
    setup.meals.reverse()
    assert [slot.kind for slot in translate.days(setup)[0].slots] == ["absent", "generated", "generated"]


def test_the_request_holds_every_attribute_tag_and_recipe_the_days_and_the_time_limit():
    nuts = models.Tag(name="contains-nuts", derive="any")
    milk_porridge = porridge(name="Milk porridge", extra_tags=[nuts])
    request = translate.plan_request(
        plan(days=2, skips=[(1, 2)], solve_time_limit=45),
        [ENERGY, PROTEIN],
        [VEGAN, nuts],
        [porridge(), milk_porridge],
    )
    assert [(a.name, a.precision) for a in request.attributes] == [("Energy", 0), ("Protein", 1)]
    assert [(t.name, t.derive) for t in request.tags] == [("vegan", "all"), ("contains-nuts", "any")]
    assert [r.name for r in request.recipes] == ["Porridge", "Milk porridge"]
    assert request.recipes[1].extra_tags == frozenset({"contains-nuts"})
    assert request.days == translate.days(plan(days=2, skips=[(1, 2)]))
    assert request.solve_time_limit == 45
    assert (request.constraints, request.exclude_tags, request.require_tags) == ((), frozenset(), frozenset())


def goal(attribute=ENERGY, applies_to="day", must=False, importance=3, min="100", max=None, zero_reference=None, name=None):
    return models.Goal(
        attribute=attribute,
        name=name,
        applies_to=applies_to,
        must=must,
        importance=importance,
        min=None if min is None else Decimal(min),
        max=None if max is None else Decimal(max),
        zero_reference=None if zero_reference is None else Decimal(zero_reference),
    )


def test_a_day_goal_is_a_day_constraint():
    c = translate.constraint(goal(min="1800", max="2200"), "Energy per day")
    assert (c.name, c.attribute, c.scope, c.aggregate) == ("Energy per day", "Energy", "day", None)
    assert (c.min, c.max) == (Decimal(1800), Decimal(2200))


def test_a_plan_total_goal_is_a_horizon_total():
    c = translate.constraint(goal(applies_to="plan_total"), "x")
    assert (c.scope, c.aggregate) == ("horizon", "total")


def test_a_daily_average_goal_is_a_horizon_average_per_day():
    c = translate.constraint(goal(applies_to="daily_average"), "x")
    assert (c.scope, c.aggregate) == ("horizon", "average_per_day")


def test_must_is_hard_and_prefer_is_soft():
    assert translate.constraint(goal(must=True), "x").hard is True
    assert translate.constraint(goal(must=False), "x").hard is False


def test_each_importance_is_a_weight():
    weights = [translate.constraint(goal(importance=i), "x").weight for i in range(1, 6)]
    assert weights == [Decimal("0.25"), Decimal("0.5"), Decimal(1), Decimal(2), Decimal(4)]
    assert translate.IMPORTANCE_WEIGHTS == dict(zip(range(1, 6), weights, strict=True))


def test_the_zero_reference_is_the_normalization_reference():
    assert translate.constraint(goal(min="0", zero_reference="25"), "x").normalization_reference == Decimal(25)
    assert translate.constraint(goal(), "x").normalization_reference is None


def test_the_guard_rail_is_the_librarys_default():
    c = translate.constraint(goal(applies_to="daily_average"), "x")
    assert (c.add_day_guardrail, c.guardrail_weight, c.weight_below, c.weight_above) == (True, None, None, None)


def test_goal_names_say_the_scope():
    goals = [goal(PROTEIN), goal(PROTEIN, "plan_total"), goal(PROTEIN, "daily_average")]
    assert translate.goal_names(goals) == ["Protein per day", "Protein, plan total", "Protein, daily average"]


def test_a_repeated_name_gets_2_then_3_in_goal_order():
    goals = [goal(), goal(PROTEIN), goal(), goal(applies_to="plan_total"), goal()]
    assert translate.goal_names(goals) == [
        "Energy per day", "Protein per day", "Energy per day (2)", "Energy, plan total", "Energy per day (3)",
    ]


def test_a_stored_name_is_used_as_it_is_and_counts_for_the_numbering():
    goals = [goal(name="Fuel"), goal(), goal(name="Fuel")]
    assert translate.goal_names(goals) == ["Fuel", "Energy per day", "Fuel (2)"]


@pytest.mark.parametrize(
    ("applies_to", "must", "bound", "needed"),
    [
        ("day", False, "0", True),
        ("plan_total", False, "0", True),
        ("daily_average", False, "0", True),
        ("day", True, "0", False),
        ("plan_total", True, "0", False),
        # The day guard-rail is soft also for a Must goal.
        ("daily_average", True, "0", True),
        ("day", False, "5", False),
        ("daily_average", True, "5", False),
        # A negative bound would make the penalty's weight negative, a reward.
        ("day", False, "-5", True),
        ("plan_total", False, "-5", True),
        ("daily_average", True, "-5", True),
        ("day", True, "-5", False),
        ("plan_total", True, "-5", False),
    ],
)
def test_the_zero_reference_is_needed_for_a_bound_of_zero_or_below_with_a_soft_penalty(applies_to, must, bound, needed):
    for min_, max_ in ((Decimal(bound), None), (None, Decimal(bound)), (Decimal(bound), Decimal(9))):
        assert translate.needs_zero_reference(applies_to, must, min_, max_) is needed


def test_the_request_holds_the_goals_as_named_constraints_in_order():
    request = translate.plan_request(
        plan_with([goal(), goal(PROTEIN, "plan_total", must=True, max="50", min=None), goal()]),
        [ENERGY, PROTEIN], [], [porridge()],
    )
    assert [(c.name, c.attribute, c.scope) for c in request.constraints] == [
        ("Energy per day", "Energy", "day"),
        ("Protein, plan total", "Protein", "horizon"),
        ("Energy per day (2)", "Energy", "day"),
    ]


def plan_with(goals) -> models.Plan:
    result = plan()
    result.goals = goals
    return result
