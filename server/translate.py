"""Stored data to library objects: the GUI's mapping rules, in one place.

Pure functions of model objects, with no database or HTTP, so each rule has
its own plain test. Later slices add the plan and goals, up to the
whole `PlanRequest`.
"""

from meal_planner import Ingredient, IngredientAmount, Recipe, TagDef

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
