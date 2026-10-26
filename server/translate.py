"""Stored data to library objects: the GUI's mapping rules, in one place.

Pure functions of model objects, with no database or HTTP, so each rule has
its own plain test. Later slices add recipe filters to the
`PlanRequest`.
"""

from collections.abc import Sequence
from decimal import Decimal

from meal_planner import AttributeDef, Constraint, Day, Ingredient, IngredientAmount, PlanRequest, Recipe, Slot, TagDef

from . import models


def attribute(row: models.Attribute) -> AttributeDef:
    """`decimals` is the library's precision; `unit` is GUI-only."""
    return AttributeDef(name=row.name, precision=row.decimals)


def ingredient(row: models.Ingredient) -> Ingredient:
    """Values are typed per `basis` units ("per 100 g"); the library's are per
    one unit, so each is divided by the basis. An attribute with no value is
    left out, which the library counts as 0."""
    return Ingredient(
        name=row.name,
        unit=row.unit,
        attributes={v.attribute.name: v.value / row.basis for v in row.values},
        tags=frozenset(tag.name for tag in row.tags),
    )


def tag(row: models.Tag) -> TagDef:
    return TagDef(name=row.name, derive=row.derive)


def recipe(row: models.Recipe) -> Recipe:
    """Amounts are per portion, in each ingredient's unit, as the library's.
    Tags added by hand become `extra_tags`; the others the library derives.
    No hard upper limit means the library's default, 3 times the soft one."""
    return Recipe(
        name=row.name,
        items=tuple(IngredientAmount(ingredient(item.ingredient), item.amount) for item in row.items),
        extra_tags=frozenset(tag.name for tag in row.extra_tags),
        multiplier_step=row.step,
        min_multiplier=row.min_multiplier,
        max_multiplier=row.max_multiplier,
        hard_max_multiplier=row.hard_max_multiplier,
        serving_cap_weight=row.serving_cap_weight,
    )


def days(plan: models.Plan) -> tuple[Day, ...]:
    """One `Day` per row of the grid, with a slot per meal in meal order:
    planned is `Slot("generated")`, skipped `Slot("absent")`. A day without
    a minimum serves all its planned meals (`min_meals_per_day=None`)."""
    meals = sorted(plan.meals, key=lambda meal: meal.position)
    skipped = [{skip.day for skip in meal.skips} for meal in meals]
    minimums = {minimum.day: minimum.at_least for minimum in plan.minimums}
    return tuple(
        Day(
            slots=tuple(Slot("absent" if day in cells else "generated") for cells in skipped),
            min_meals_per_day=minimums.get(day),
        )
        for day in range(plan.days)
    )


# A Prefer goal's importance (1-5) as the library's weight.
IMPORTANCE_WEIGHTS = {
    1: Decimal("0.25"),
    2: Decimal("0.5"),
    3: Decimal(1),
    4: Decimal(2),
    5: Decimal(4),
}


def needs_zero_reference(applies_to: str, must: bool, min: Decimal | None, max: Decimal | None) -> bool:
    """Whether the library wants a reference: a bound is 0 or below and a soft
    penalty is built from it (without one the library uses the bound itself,
    and a negative bound would give the penalty a negative weight, a reward).
    That is a Prefer goal, or a daily average, whose day guard-rail is soft
    also for a Must goal."""
    soft = not must or applies_to == "daily_average"
    return soft and any(bound is not None and bound <= 0 for bound in (min, max))


def _generated_name(goal: models.Goal) -> str:
    attribute = goal.attribute.name
    if goal.applies_to == "plan_total":
        return f"{attribute}, plan total"
    if goal.applies_to == "daily_average":
        return f"{attribute}, daily average"
    return f"{attribute} per day"


def goal_names(goals: Sequence[models.Goal]) -> list[str]:
    """Each goal's name, in goal order: the one it was given, or "Protein per
    day", "Protein, plan total", "Protein, daily average". A name that came
    before gets " (2)" on its second use, " (3)" on its third."""
    base = [goal.name or _generated_name(goal) for goal in goals]
    seen: dict[str, int] = {}
    names = []
    for name in base:
        seen[name] = seen.get(name, 0) + 1
        names.append(name if seen[name] == 1 else f"{name} ({seen[name]})")
    return names


def named_goals(goals: Sequence[models.Goal]) -> list[tuple[models.Goal, str]]:
    """Each goal with its name (`goal_names`), in goal order."""
    return list(zip(goals, goal_names(goals), strict=True))


def constraint(goal: models.Goal, name: str) -> Constraint:
    """`applies_to` becomes scope and aggregate, Must becomes hard and the
    importance the weight. The guard-rail stays the library's default."""
    horizon = goal.applies_to != "day"
    aggregate = {"plan_total": "total", "daily_average": "average_per_day"}.get(goal.applies_to)
    return Constraint(
        name=name,
        attribute=goal.attribute.name,
        scope="horizon" if horizon else "day",
        aggregate=aggregate,
        min=goal.min,
        max=goal.max,
        hard=goal.must,
        weight=IMPORTANCE_WEIGHTS[goal.importance],
        normalization_reference=goal.zero_reference,
    )


def plan_request(
    plan: models.Plan,
    attributes: Sequence[models.Attribute],
    tags: Sequence[models.Tag],
    recipes: Sequence[models.Recipe],
) -> PlanRequest:
    """The whole catalog, the schedule and the goals. No recipe filters yet."""
    return PlanRequest(
        attributes=tuple(attribute(row) for row in attributes),
        tags=tuple(tag(row) for row in tags),
        recipes=tuple(recipe(row) for row in recipes),
        days=days(plan),
        constraints=tuple(constraint(goal, name) for goal, name in named_goals(plan.goals)),
        solve_time_limit=plan.solve_time_limit,
    )
