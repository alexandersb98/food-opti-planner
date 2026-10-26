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


# A Must goal's day guard-rail without its own importance: importance 2. The
# goal's own importance is hidden while it is Must, so it must not set the
# guard-rail's weight (the library's default, half of it).
MUST_GUARD_RAIL_WEIGHT = IMPORTANCE_WEIGHTS[2]


def needs_zero_reference(
    applies_to: str, must: bool, day_guard_rail: bool, min: Decimal | None, max: Decimal | None
) -> bool:
    """Whether the library wants a reference: a bound is 0 or below and a soft
    penalty is built from it (without one the library uses the bound itself,
    and a negative bound would give the penalty a negative weight, a reward).
    That is a Prefer goal, or a daily average with its day guard-rail, which
    is soft also for a Must goal."""
    soft = not must or (applies_to == "daily_average" and day_guard_rail)
    return soft and any(bound is not None and bound <= 0 for bound in (min, max))


def _generated_name(goal: models.Goal) -> str:
    attribute = goal.attribute.name
    if goal.applies_to == "plan_total":
        return f"{attribute}, plan total"
    if goal.applies_to == "daily_average":
        return f"{attribute}, daily average"
    return f"{attribute} per day"


def goal_names(goals: Sequence[models.Goal]) -> list[str]:
    """Each goal's name, in goal order: the one the user typed, or "Protein
    per day", "Protein, plan total", "Protein, daily average". A generated
    name gets " (2)" on its second use, " (3)" on its third, and skips any
    number whose name is taken already, by a typed name or an earlier
    generated one. Typed names differ from each other (the API checks)."""
    taken = {goal.name for goal in goals if goal.name is not None}
    uses: dict[str, int] = {}
    names = []
    for goal in goals:
        if goal.name is not None:
            names.append(goal.name)
            continue
        generated = _generated_name(goal)
        n = uses.get(generated, 0)
        while True:
            n += 1
            name = generated if n == 1 else f"{generated} ({n})"
            if name not in taken:
                break
        uses[generated] = n
        taken.add(name)
        names.append(name)
    return names


def named_goals(goals: Sequence[models.Goal]) -> list[tuple[models.Goal, str]]:
    """Each goal with its name (`goal_names`), in goal order."""
    return list(zip(goals, goal_names(goals), strict=True))


def constraint_key(position: int) -> str:
    """The library's name for the goal at `position` (from 0): "goal 1",
    "goal 2", ... Not the goal's name, so no name a user types can clash
    with the library's own ("goal 1 (day guard-rail)", "serving cap: Oats");
    the key leads a violation back to its goal."""
    return f"goal {position + 1}"


def _weight(importance: int | None) -> Decimal | None:
    return None if importance is None else IMPORTANCE_WEIGHTS[importance]


def constraint(goal: models.Goal, key: str) -> Constraint:
    """`applies_to` becomes scope and aggregate, Must becomes hard and the
    importance the weight; the importance below and above, when given, the
    weight of each side. A daily average's day guard-rail is on or off; its
    weight is its own importance's, or else the library's default (half of
    each side's) for a Prefer goal and importance 2's for a Must goal. Other
    goals keep the library's defaults, which they don't use."""
    horizon = goal.applies_to != "day"
    aggregate = {"plan_total": "total", "daily_average": "average_per_day"}.get(goal.applies_to)
    guard_rail, guard_rail_weight = True, None
    if goal.applies_to == "daily_average":
        guard_rail = goal.day_guard_rail
        guard_rail_weight = _weight(goal.guard_rail_importance)
        if guard_rail and guard_rail_weight is None and goal.must:
            guard_rail_weight = MUST_GUARD_RAIL_WEIGHT
    return Constraint(
        name=key,
        attribute=goal.attribute.name,
        scope="horizon" if horizon else "day",
        aggregate=aggregate,
        min=goal.min,
        max=goal.max,
        hard=goal.must,
        weight=IMPORTANCE_WEIGHTS[goal.importance],
        weight_below=_weight(goal.importance_below),
        weight_above=_weight(goal.importance_above),
        normalization_reference=goal.zero_reference,
        add_day_guardrail=guard_rail,
        guardrail_weight=guard_rail_weight,
    )


def plan_request(
    plan: models.Plan,
    attributes: Sequence[models.Attribute],
    tags: Sequence[models.Tag],
    recipes: Sequence[models.Recipe],
) -> PlanRequest:
    """The whole catalog, the schedule and the goals, each keyed by its
    place (`constraint_key`). No recipe filters yet."""
    return PlanRequest(
        attributes=tuple(attribute(row) for row in attributes),
        tags=tuple(tag(row) for row in tags),
        recipes=tuple(recipe(row) for row in recipes),
        days=days(plan),
        constraints=tuple(constraint(goal, constraint_key(i)) for i, goal in enumerate(plan.goals)),
        solve_time_limit=plan.solve_time_limit,
    )
