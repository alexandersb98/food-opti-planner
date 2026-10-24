"""Stored data to library objects: the GUI's mapping rules, in one place.

Pure functions of model objects, with no database or HTTP, so each rule has
its own plain test. Later slices add recipes, the plan and goals, up to the
whole `PlanRequest`.
"""

from meal_planner import Ingredient

from . import models


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
