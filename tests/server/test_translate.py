"""The mapping rules from stored data to library objects, without a database."""

from datetime import date
from decimal import Decimal

import pytest

from meal_planner import IngredientAmount, Recipe, TagDef
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


def line(**fields) -> models.RecipeItem:
    return models.RecipeItem(original_text="", **{"unit": "", **fields})


def porridge(sections=None, **fields) -> models.Recipe:
    """`items` (default Oats and Milk) are one unnamed section, or `sections`
    gives the sections as lists of lines; servings 1."""
    milk = models.Ingredient(name="Milk", unit="ml", basis=Decimal("100"), values=[], tags=[])
    defaults = {
        "name": "Porridge",
        "min_multiplier": Decimal("0.5"),
        "max_multiplier": Decimal("2"),
        "step": None,
        "hard_max_multiplier": None,
        "serving_cap_weight": Decimal("1"),
        "servings": 1,
        "instructions": "",
        "source_url": "",
        "extra_tags": [],
    }
    items = fields.pop("items", None) or [
        line(ingredient=oats("100", [(ENERGY, "389")]), amount=Decimal("60")),
        line(ingredient=milk, amount=Decimal("200")),
    ]
    sections = sections or [items]
    built = [
        models.RecipeSection(position=i, name="", items=[replace_position(item, j) for j, item in enumerate(lines)])
        for i, lines in enumerate(sections)
    ]
    return models.Recipe(**{**defaults, "sections": built, **fields})


def replace_position(item: models.RecipeItem, position: int) -> models.RecipeItem:
    item.position = position
    return item


def test_a_tag_keeps_its_name_and_rule():
    tag = translate.tag(models.Tag(name="contains-nuts", derive="any"))
    assert (tag.name, tag.derive) == ("contains-nuts", "any")


def test_a_recipes_items_are_its_ingredients_in_order_with_their_amounts():
    recipe = translate.recipe(porridge())
    assert [(i.ingredient.name, i.quantity) for i in recipe.items] == [("Oats", 60), ("Milk", 200)]
    assert recipe.items[0].ingredient.attributes == {"Energy": Decimal("3.89")}
    assert recipe.attribute_total("Energy") == Decimal("233.4")


def test_amounts_are_the_whole_recipe_divided_by_servings():
    recipe = translate.recipe(porridge(servings=4))
    assert [(i.ingredient.name, i.quantity) for i in recipe.items] == [("Oats", 15), ("Milk", 50)]


def test_lines_of_one_ingredient_are_summed():
    grain = oats("100", [(ENERGY, "389")])
    recipe = translate.recipe(porridge(sections=[
        [line(ingredient=grain, amount=Decimal("40"))],
        [line(ingredient=grain, amount=Decimal("20"))],
    ]))
    assert [(i.ingredient.name, i.quantity) for i in recipe.items] == [("Oats", 60)]


def test_the_ingredients_keep_the_order_of_their_first_line():
    grain = oats()
    milk = models.Ingredient(name="Milk", unit="ml", basis=Decimal("100"), values=[], tags=[])
    salt = models.Ingredient(name="Salt", unit="g", basis=Decimal("100"), values=[], tags=[])
    recipe = translate.recipe(porridge(sections=[
        [line(ingredient=milk, amount=Decimal("1")), line(ingredient=grain, amount=Decimal("1"))],
        [line(ingredient=salt, amount=Decimal("1")), line(ingredient=milk, amount=Decimal("1"))],
    ]))
    assert [(i.ingredient.name, i.quantity) for i in recipe.items] == [("Milk", 2), ("Oats", 1), ("Salt", 1)]


def test_servings_that_do_not_divide_evenly_stay_exact_enough():
    recipe = translate.recipe(porridge(servings=3, items=[line(ingredient=oats("1", [(ENERGY, "1")]), amount=Decimal("10"))]))
    assert abs(recipe.items[0].quantity * 3 - 10) < Decimal("1e-20")


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
        line(ingredient=oats(tags=[VEGAN]), amount=Decimal("60")),
        line(ingredient=almonds, amount=Decimal("10")),
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


def goal(attribute=ENERGY, applies_to="day", must=False, importance=3, min="100", max=None, zero_reference=None,
         name=None, importance_below=None, importance_above=None, day_guard_rail=True, guard_rail_importance=None):
    return models.Goal(
        attribute=attribute,
        name=name,
        applies_to=applies_to,
        must=must,
        importance=importance,
        min=None if min is None else Decimal(min),
        max=None if max is None else Decimal(max),
        zero_reference=None if zero_reference is None else Decimal(zero_reference),
        importance_below=importance_below,
        importance_above=importance_above,
        day_guard_rail=day_guard_rail,
        guard_rail_importance=guard_rail_importance,
    )


def test_a_day_goal_is_a_day_constraint():
    c = translate.constraint(goal(min="1800", max="2200"), "goal 1")
    assert (c.name, c.attribute, c.scope, c.aggregate) == ("goal 1", "Energy", "day", None)
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


def test_without_advanced_settings_a_prefer_goal_weighs_as_the_librarys_defaults():
    # The guard-rail's weight is given, and is the library's own: half the goal's.
    c = translate.constraint(goal(applies_to="daily_average"), "x")
    assert (c.add_day_guardrail, c.weight_below, c.weight_above) == (True, None, None)
    assert c.guardrail_side_weight("below") == c.side_weight("below") / 2


def test_the_importance_below_and_above_are_the_side_weights():
    c = translate.constraint(goal(min="100", max="200", importance_below=5, importance_above=1), "x")
    assert (c.weight, c.weight_below, c.weight_above) == (Decimal(1), Decimal(4), Decimal("0.25"))


def test_the_guard_rail_off_is_no_guard_rail():
    c = translate.constraint(goal(applies_to="daily_average", day_guard_rail=False), "x")
    assert (c.add_day_guardrail, c.has_guardrail()) == (False, False)


def test_the_guard_rails_own_importance_is_its_weight():
    for must in (False, True):
        c = translate.constraint(goal(applies_to="daily_average", must=must, guard_rail_importance=4), "x")
        assert (c.add_day_guardrail, c.guardrail_weight) == (True, Decimal(2))


@pytest.mark.parametrize(
    ("must", "importance", "below", "above", "shown"),
    [
        (False, 5, None, None, 4),  # Prefer: one step below the goal's importance
        (False, 1, None, None, 1),  # at least 1
        (False, 3, 5, 1, 4),  # with below and above: one step below the higher
        (False, 3, None, 5, 4),  # a side without its own is the goal's
        (True, 5, None, None, 2),  # Must: the goal's importance is hidden
    ],
)
def test_a_guard_rail_without_its_own_importance_follows_the_goal(must, importance, below, above, shown):
    g = goal(applies_to="daily_average", must=must, importance=importance, importance_below=below, importance_above=above)
    assert translate.guard_rail_importance(g) == shown
    c = translate.constraint(g, "x")
    assert c.guardrail_weight == translate.IMPORTANCE_WEIGHTS[shown]


def test_only_a_daily_average_has_guard_rail_settings():
    for applies_to in ("day", "plan_total"):
        c = translate.constraint(goal(applies_to=applies_to, must=True), "x")
        assert (c.add_day_guardrail, c.guardrail_weight) == (True, None)


def test_constraint_keys_count_the_goals_from_1():
    assert [translate.constraint_key(position) for position in range(3)] == ["goal 1", "goal 2", "goal 3"]


def test_goal_position_undoes_constraint_key():
    assert [translate.goal_position(translate.constraint_key(position)) for position in range(12)] == list(range(12))


@pytest.mark.parametrize("name", ["min_meals_per_day", "goal", "goal ", "goal 0", "goal 01", "goal x", "goal 1 (day guard-rail)"])
def test_goal_position_of_another_name_is_none(name):
    assert translate.goal_position(name) is None


def test_goal_names_say_the_scope():
    goals = [goal(PROTEIN), goal(PROTEIN, "plan_total"), goal(PROTEIN, "daily_average")]
    assert translate.goal_names(goals) == ["Protein per day", "Protein, plan total", "Protein, daily average"]


def test_a_repeated_name_gets_2_then_3_in_goal_order():
    goals = [goal(), goal(PROTEIN), goal(), goal(applies_to="plan_total"), goal()]
    assert translate.goal_names(goals) == [
        "Energy per day", "Protein per day", "Energy per day (2)", "Energy, plan total", "Energy per day (3)",
    ]


def test_a_typed_name_is_kept_and_the_generated_ones_are_numbered_around_it():
    goals = [goal(), goal(name="Energy per day"), goal(name="Fuel"), goal()]
    assert translate.goal_names(goals) == ["Energy per day (2)", "Energy per day", "Fuel", "Energy per day (3)"]


def test_a_number_taken_by_a_typed_name_moves_the_generated_name_on():
    goals = [goal(), goal(), goal(name="Energy per day (2)"), goal()]
    assert translate.goal_names(goals) == [
        "Energy per day", "Energy per day (3)", "Energy per day (2)", "Energy per day (4)",
    ]


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
        assert translate.needs_zero_reference(applies_to, must, True, min_, max_) is needed


def test_a_must_daily_average_without_its_guard_rail_needs_no_zero_reference():
    assert translate.needs_zero_reference("daily_average", True, False, Decimal(0), None) is False
    assert translate.needs_zero_reference("daily_average", False, False, Decimal(0), None) is True


def test_the_request_holds_the_goals_as_constraints_keyed_in_order():
    request = translate.plan_request(
        plan_with([goal(name="serving cap: Porridge"), goal(PROTEIN, "plan_total", must=True, max="50", min=None),
                   goal(name="goal 1 (day guard-rail)")]),
        [ENERGY, PROTEIN], [], [porridge()],
    )
    assert [(c.name, c.attribute, c.scope) for c in request.constraints] == [
        ("goal 1", "Energy", "day"),
        ("goal 2", "Protein", "horizon"),
        ("goal 3", "Energy", "day"),
    ]


def plan_with(goals) -> models.Plan:
    result = plan()
    result.goals = goals
    return result


# Recipe filters

NUTS = models.Tag(id=2, name="contains-nuts", derive="any")
QUICK = models.Tag(id=3, name="quick", derive="all")


def filtered(only=(), never=()) -> models.Plan:
    """A plan whose filters are `only` and `never`, tags in tag id order."""
    result = plan()
    modes = [(tag, "only") for tag in only] + [(tag, "never") for tag in never]
    modes.sort(key=lambda m: m[0].id)
    result.tag_filters = [models.PlanTagFilter(tag=tag, mode=mode) for tag, mode in modes]
    return result


def test_only_and_never_become_the_required_and_excluded_tags_by_name():
    vegan_oats = line(ingredient=oats(tags=[VEGAN]), amount=Decimal("60"))
    recipes = [porridge(items=[vegan_oats], extra_tags=[QUICK])]
    request = translate.plan_request(filtered(only=[VEGAN, QUICK], never=[NUTS]), [ENERGY], [VEGAN, NUTS, QUICK], recipes)
    assert request.require_tags == frozenset({"vegan", "quick"})
    assert request.exclude_tags == frozenset({"contains-nuts"})


def recipes_to_filter() -> list[models.Recipe]:
    """Vegan oats (vegan by its only ingredient, `all`), Oats with milk (not
    vegan, as the milk is not), Nut oats (nuts by one ingredient, `any`) and
    Quick oats (vegan, and quick by hand)."""
    milk = models.Ingredient(name="Milk", unit="ml", basis=Decimal("100"), values=[], tags=[])
    almonds = models.Ingredient(name="Almonds", unit="g", basis=Decimal("100"), values=[], tags=[VEGAN, NUTS])

    def made_of(name, *ingredients, extra_tags=()):
        items = [line(ingredient=i, amount=Decimal("10")) for i in ingredients]
        return porridge(name=name, items=items, extra_tags=list(extra_tags))

    return [
        made_of("Vegan oats", oats(tags=[VEGAN])),
        made_of("Oats with milk", oats(tags=[VEGAN]), milk),
        made_of("Nut oats", oats(tags=[VEGAN]), almonds),
        made_of("Quick oats", oats(tags=[VEGAN]), extra_tags=[QUICK]),
    ]


def usable(only=(), never=()) -> list[str]:
    rows = translate.usable_recipes(recipes_to_filter(), [VEGAN, NUTS, QUICK], only, never)
    return [row.name for row in rows]


def test_without_filters_every_recipe_is_usable():
    assert usable() == ["Vegan oats", "Oats with milk", "Nut oats", "Quick oats"]


def test_only_keeps_the_recipes_with_a_derived_tag_by_its_all_rule():
    assert usable(only=["vegan"]) == ["Vegan oats", "Nut oats", "Quick oats"]


def test_never_drops_the_recipes_with_a_derived_tag_by_its_any_rule():
    assert usable(never=["contains-nuts"]) == ["Vegan oats", "Oats with milk", "Quick oats"]


def test_only_keeps_the_recipes_with_a_tag_added_by_hand():
    assert usable(only=["quick"]) == ["Quick oats"]


def test_only_and_never_together_keep_the_recipes_with_every_only_tag_and_no_never_tag():
    assert usable(only=["vegan"], never=["contains-nuts"]) == ["Vegan oats", "Quick oats"]
    assert usable(only=["vegan", "quick"], never=["contains-nuts"]) == ["Quick oats"]
    assert usable(only=["quick"], never=["vegan"]) == []


@pytest.mark.parametrize(
    ("only", "never"),
    [((), ()), ((VEGAN,), ()), ((), (NUTS,)), ((QUICK,), ()), ((VEGAN,), (NUTS,)), ((VEGAN, QUICK), (NUTS,))],
)
def test_the_usable_recipes_are_the_librarys_eligible_ones(only, never):
    tags = [VEGAN, NUTS, QUICK]
    rows = recipes_to_filter()
    request = translate.plan_request(filtered(only, never), [ENERGY], tags, rows)
    usable = translate.usable_recipes(rows, tags, [t.name for t in only], [t.name for t in never])
    assert [row.name for row in usable] == [recipe.name for recipe in request.eligible_recipes()]


# Tag groups (equivalent tags)

FISH = models.Tag(id=10, name="Fish", derive="any", group_id=1)
SEAFOOD = models.Tag(id=11, name="Seafood", derive="any", group_id=1)
FISK = models.Tag(id=12, name="Fisk och skaldjur", derive="any", group_id=1)
GROUPED = [VEGAN, FISH, SEAFOOD, FISK]


def group_rule(rule):
    return [models.Tag(id=t.id, name=t.name, derive=rule, group_id=1) for t in (FISH, SEAFOOD, FISK)]


def test_without_groups_every_tag_keeps_its_name_and_def():
    library = translate.library_tags([VEGAN, NUTS])
    assert library.names == {"vegan": "vegan", "contains-nuts": "contains-nuts"}
    assert library.defs == (translate.tag(VEGAN), translate.tag(NUTS))


def test_a_group_is_one_library_tag_and_its_members_are_none():
    library = translate.library_tags(GROUPED)
    assert library.names == {"vegan": "vegan", "Fish": "group 1", "Seafood": "group 1", "Fisk och skaldjur": "group 1"}
    assert library.defs == (TagDef("vegan", "all"), TagDef("group 1", "any"))


def test_the_group_has_its_members_rule():
    library = translate.library_tags(group_rule("all"))
    assert library.defs == (TagDef("group 1", "all"),)


def test_two_groups_are_named_by_their_ids_after_the_ungrouped_tags():
    other = [models.Tag(id=20, name="A", derive="all", group_id=2), models.Tag(id=21, name="B", derive="all", group_id=2)]
    library = translate.library_tags([*other, *GROUPED])
    assert [d.name for d in library.defs] == ["vegan", "group 1", "group 2"]
    assert library.names["A"] == library.names["B"] == "group 2"


def test_a_group_name_is_checked_against_the_stored_names():
    clash = models.Tag(id=30, name="group 1", derive="all")
    assert translate.library_tags([clash, FISH, SEAFOOD]).names["Fish"] == "group 1*"
    clash2 = models.Tag(id=31, name="group 1*", derive="all")
    library = translate.library_tags([clash, clash2, FISH, SEAFOOD])
    assert library.names["Fish"] == "group 1**"
    assert [d.name for d in library.defs] == ["group 1", "group 1*", "group 1**"]


def test_map_gives_the_library_names_of_stored_names():
    library = translate.library_tags(GROUPED)
    assert library.map(["Fish", "Seafood", "vegan"]) == frozenset({"group 1", "vegan"})


def test_an_ingredients_tags_go_through_the_names():
    names = translate.library_tags(GROUPED).names
    assert translate.ingredient(oats(tags=[SEAFOOD]), names).tags == frozenset({"group 1"})
    assert translate.ingredient(oats(tags=[FISH, SEAFOOD]), names).tags == frozenset({"group 1"})
    assert translate.ingredient(oats(tags=[VEGAN, FISK]), names).tags == frozenset({"vegan", "group 1"})
    assert translate.ingredient(oats(tags=[SEAFOOD])).tags == frozenset({"Seafood"})


def test_a_recipes_extra_tags_go_through_the_names():
    names = translate.library_tags(GROUPED).names
    assert translate.recipe(porridge(extra_tags=[FISK, VEGAN]), names).extra_tags == frozenset({"group 1", "vegan"})
    assert translate.recipe(porridge(extra_tags=[FISK])).extra_tags == frozenset({"Fisk och skaldjur"})


def test_the_request_has_the_groups_as_tags_and_in_the_filters():
    seafood_oats = line(ingredient=oats(tags=[SEAFOOD]), amount=Decimal("60"))
    recipes = [porridge(items=[seafood_oats], extra_tags=[FISK])]
    setup = filtered(only=[FISH], never=[VEGAN])
    request = translate.plan_request(setup, [ENERGY], GROUPED, recipes)
    assert [(t.name, t.derive) for t in request.tags] == [("vegan", "all"), ("group 1", "any")]
    assert request.require_tags == frozenset({"group 1"})
    assert request.exclude_tags == frozenset({"vegan"})
    assert request.recipes[0].extra_tags == frozenset({"group 1"})
    assert request.recipes[0].items[0].ingredient.tags == frozenset({"group 1"})


def group_recipes() -> list[models.Recipe]:
    def made_of(name, *tag_sets):
        # One ingredient per recipe and tag set, as the library wants distinct names.
        ingredients = [oats(tags=tags) for tags in tag_sets]
        for i, ingredient in enumerate(ingredients):
            ingredient.name = f"{name} {i}"
        return porridge(name=name, items=[line(ingredient=i, amount=Decimal("10")) for i in ingredients])

    return [
        made_of("Seafood only", [SEAFOOD]),
        made_of("Fish and nothing", [FISH], []),
        made_of("Plain", []),
        made_of("Fisk", [FISK]),
    ]


def usable_in_group(tags, only=(), never=()) -> list[str]:
    return [r.name for r in translate.usable_recipes(group_recipes(), tags, only, never)]


def test_only_a_member_keeps_the_recipes_with_any_member():
    assert usable_in_group(GROUPED, only=["Fish"]) == ["Seafood only", "Fish and nothing", "Fisk"]


def test_never_a_member_drops_the_recipes_with_any_member():
    assert usable_in_group(GROUPED, never=["Fish"]) == ["Plain"]


def test_only_and_never_on_members_of_one_group_leave_nothing():
    assert usable_in_group(GROUPED, only=["Fish"], never=["Seafood"]) == []


def test_the_group_rule_decides_whether_a_recipe_has_the_group_tag():
    assert usable_in_group(group_rule("any"), only=["Fish"]) == ["Seafood only", "Fish and nothing", "Fisk"]
    assert usable_in_group(group_rule("all"), only=["Fish"]) == ["Seafood only", "Fisk"]


def test_the_usable_recipes_with_groups_are_the_librarys_eligible_ones():
    rows = group_recipes()
    request = translate.plan_request(filtered(only=[SEAFOOD], never=[]), [ENERGY], GROUPED, rows)
    usable = translate.usable_recipes(rows, GROUPED, ["Seafood"], [])
    assert [row.name for row in usable] == [recipe.name for recipe in request.eligible_recipes()]


# Line units (slice R3): every line is converted to its ingredient's unit.
DL_OF_OATS = models.IngredientConversion(unit="dl", factor=Decimal("40"), source="user")


def with_conversions(ingredient: models.Ingredient, *conversions: models.IngredientConversion) -> models.Ingredient:
    ingredient.conversions = list(conversions)
    return ingredient


def only(*lines: models.RecipeItem, **fields) -> Recipe:
    return translate.recipe(porridge(items=list(lines), **fields))


def test_a_line_in_a_stored_conversions_unit_is_converted():
    grain = with_conversions(oats(), DL_OF_OATS)
    assert only(line(ingredient=grain, amount=Decimal("2.5"), unit="dl")).items[0].quantity == 100


def test_a_line_in_a_catalogue_unit_is_converted_to_the_ingredients_unit():
    ounces = only(line(ingredient=oats(), amount=Decimal("2"), unit="oz")).items[0].quantity
    assert ounces == Decimal("56.69904625")
    milk = models.Ingredient(name="Milk", unit="dl", basis=Decimal("1"), values=[], tags=[])
    assert only(line(ingredient=milk, amount=Decimal("200"), unit="ml")).items[0].quantity == 2


def test_a_catalogue_step_can_go_through_a_conversion():
    grain = with_conversions(oats(), DL_OF_OATS)
    cup = only(line(ingredient=grain, amount=Decimal("1"), unit="US cup")).items[0].quantity
    assert abs(cup - Decimal("2.365882365") * 40) < Decimal("1e-20")


def test_a_stored_conversion_beats_a_catalogue_step():
    grain = with_conversions(oats(), DL_OF_OATS, models.IngredientConversion(unit="msk", factor=Decimal("10"), source="user"))
    assert only(line(ingredient=grain, amount=Decimal("2"), unit="msk")).items[0].quantity == 20


def test_lines_in_different_units_of_one_ingredient_are_summed_in_its_unit():
    grain = with_conversions(oats(), DL_OF_OATS)
    recipe = only(
        line(ingredient=grain, amount=Decimal("60")),
        line(ingredient=grain, amount=Decimal("1"), unit="dl"),
    )
    assert [(i.ingredient.name, i.quantity) for i in recipe.items] == [("Oats", 100)]


def test_servings_divide_after_the_conversion():
    grain = with_conversions(oats(), DL_OF_OATS)
    recipe = only(
        line(ingredient=grain, amount=Decimal("60")),
        line(ingredient=grain, amount=Decimal("1"), unit="dl"),
        servings=4,
    )
    assert recipe.items[0].quantity == 25


def test_only_own_unit_lines_give_the_same_numbers_as_before():
    row = porridge()
    oats_, milk = (translate.ingredient(item.ingredient) for item in row.lines)
    expected = Recipe(
        name="Porridge",
        items=(IngredientAmount(oats_, 60), IngredientAmount(milk, 200)),
        min_multiplier=Decimal("0.5"), max_multiplier=2, serving_cap_weight=1,
    )
    assert translate.recipe(row) == expected


def test_an_unconvertible_line_raises_naming_ingredient_and_unit():
    with pytest.raises(translate.UnconvertibleLine, match="Oats.*dl|dl.*Oats"):
        only(line(ingredient=oats(), amount=Decimal("1"), unit="dl"))
