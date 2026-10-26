"""Stored data to library objects: the GUI's mapping rules, in one place.

Pure functions of model objects, with no database or HTTP, so each rule has
its own plain test. Later slices add goals and recipe filters to the
`PlanRequest`.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date

from meal_planner import AttributeDef, Day, Ingredient, IngredientAmount, PlanRequest, Recipe, Slot, TagDef

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


def plan_request(
    plan: models.Plan,
    attributes: Sequence[models.Attribute],
    tags: Sequence[models.Tag],
    recipes: Sequence[models.Recipe],
) -> PlanRequest:
    """The whole catalog and the schedule. No goals or recipe filters yet."""
    return PlanRequest(
        attributes=tuple(attribute(row) for row in attributes),
        tags=tuple(tag(row) for row in tags),
        recipes=tuple(recipe(row) for row in recipes),
        days=days(plan),
        solve_time_limit=plan.solve_time_limit,
    )


@dataclass(frozen=True)
class SolveInput:
    """What a solve needs, read before it starts: the library's request, and
    what the frozen plan keeps that the library doesn't know: the first
    day's date, the meals' names in the order of the day and each
    attribute's unit by name. Plain values, so they outlive the session."""

    request: PlanRequest
    start_date: date
    meal_names: tuple[str, ...]
    units: Mapping[str, str]


def solve_input(
    plan: models.Plan,
    attributes: Sequence[models.Attribute],
    tags: Sequence[models.Tag],
    recipes: Sequence[models.Recipe],
) -> SolveInput:
    return SolveInput(
        request=plan_request(plan, attributes, tags, recipes),
        start_date=plan.start_date,
        meal_names=tuple(meal.name for meal in sorted(plan.meals, key=lambda meal: meal.position)),
        units={attribute.name: attribute.unit for attribute in attributes},
    )
