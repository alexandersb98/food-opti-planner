"""The planning request, and the checks that span its parts."""

from collections.abc import Set
from dataclasses import dataclass

from .constraint import Constraint
from .domain import AttributeDef, TagDef
from .recipe import Recipe
from .scaling import to_decimal
from .schedule import Day
from .validation import duplicate_problems, number_problem, raise_if

TAG_FILTERS = ("exclude_tags", "require_tags")


def recipe_passes(tags: Set[str], require: Set[str], exclude: Set[str]) -> bool:
    """Whether a recipe with these tags (derived ones too) passes the tag
    filters: it has every tag in `require` and none in `exclude` (#37)."""
    return require <= tags and not tags & exclude


@dataclass(frozen=True)
class PlanRequest:
    attributes: tuple[AttributeDef, ...]
    tags: tuple[TagDef, ...]
    recipes: tuple[Recipe, ...]
    days: tuple[Day, ...]
    constraints: tuple[Constraint, ...] = ()
    exclude_tags: frozenset[str] = frozenset()
    require_tags: frozenset[str] = frozenset()
    solve_time_limit: float = 30.0

    def __post_init__(self):
        for name in ("attributes", "tags", "recipes", "days", "constraints"):
            object.__setattr__(self, name, tuple(getattr(self, name)))
        filter_problems = []
        for name in TAG_FILTERS:
            value = getattr(self, name)
            if isinstance(value, str):
                filter_problems.append(
                    f"{name} must be a collection of tag names, not a single string "
                    f"{value!r}"
                )
                value = ()
            object.__setattr__(self, name, frozenset(value))
        raise_if(filter_problems + self._problems())

    def _problems(self) -> list[str]:
        p = _duplicate_names(self) + _reference_problems(self)
        if not self.days:
            p.append("the plan needs at least one day")
        limit_problem = number_problem("solve_time_limit", self.solve_time_limit)
        if limit_problem:
            p.append(limit_problem)
        elif to_decimal(self.solve_time_limit) <= 0:
            p.append("solve_time_limit must be positive")
        if not p and not self.eligible_recipes():
            p.append("no recipes left after exclude_tags and require_tags")
        return p

    def tag_defs(self) -> dict[str, TagDef]:
        return {t.name: t for t in self.tags}

    def attribute_defs(self) -> dict[str, AttributeDef]:
        return {a.name: a for a in self.attributes}

    def eligible_recipes(self) -> tuple[Recipe, ...]:
        """Recipes with no excluded tag and every required tag (#37)."""
        defs = self.tag_defs()
        return tuple(
            recipe for recipe in self.recipes
            if recipe_passes(recipe.tags(defs), self.require_tags, self.exclude_tags)
        )


def _duplicate_names(r: PlanRequest) -> list[str]:
    p = duplicate_problems("attribute", [a.name for a in r.attributes])
    p += duplicate_problems("tag", [t.name for t in r.tags])
    p += duplicate_problems("recipe", [x.name for x in r.recipes])
    p += duplicate_problems("constraint", [c.name for c in r.constraints])
    return p


def _reference_problems(r: PlanRequest) -> list[str]:
    """Names used by ingredients, recipes, constraints and filters must be defined."""
    p = []
    ingredients = {}
    for recipe in r.recipes:
        for ing in recipe.ingredients():
            if ingredients.setdefault(ing.name, ing) != ing:
                p.append(f"two different ingredients named {ing.name!r}")
                ingredients[ing.name] = ing
    attribute_names = {a.name for a in r.attributes}
    tag_names = {t.name for t in r.tags}
    for ing in ingredients.values():
        for attr in sorted(set(ing.attributes) - attribute_names):
            p.append(f"ingredient {ing.name!r}: unknown attribute {attr!r}")
        for tag in sorted(ing.tags - tag_names):
            p.append(f"ingredient {ing.name!r}: unknown tag {tag!r}")
    for recipe in r.recipes:
        for tag in sorted(recipe.extra_tags - tag_names):
            p.append(f"recipe {recipe.name!r}: unknown tag {tag!r}")
    for c in r.constraints:
        if c.attribute not in attribute_names:
            p.append(f"constraint {c.name!r}: unknown attribute {c.attribute!r}")
    for tag in sorted((r.exclude_tags | r.require_tags) - tag_names):
        p.append(f"unknown tag {tag!r} in exclude_tags/require_tags")
    return p
