"""The planning request: days and slots, constraints, and cross-checks."""

from dataclasses import dataclass

from .domain import AttributeDef, PlanRequestError, Recipe, TagDef, raise_if
from .scaling import to_decimal

SLOT_KINDS = ("generated", "absent")
SCOPES = ("day", "horizon")
AGGREGATES = ("total", "average_per_day")


@dataclass(frozen=True)
class Slot:
    kind: str = "generated"

    def __post_init__(self):
        if self.kind not in SLOT_KINDS:
            raise PlanRequestError(
                [f"slot kind {self.kind!r} not supported; use one of {SLOT_KINDS}"]
            )


@dataclass(frozen=True)
class Day:
    """``min_meals_per_day=None`` means every generated slot is served (#20)."""

    slots: tuple[Slot, ...]
    min_meals_per_day: int | None = None

    def __post_init__(self):
        object.__setattr__(self, "slots", tuple(self.slots))
        problems = []
        generated = self.generated_count()
        if self.min_meals_per_day is not None and not (
            0 <= self.min_meals_per_day <= generated
        ):
            problems.append(
                f"min_meals_per_day {self.min_meals_per_day} not within "
                f"0..{generated} generated slots"
            )
        raise_if(problems)

    def generated_count(self) -> int:
        return sum(1 for slot in self.slots if slot.kind == "generated")

    def meal_floor(self) -> int:
        if self.min_meals_per_day is None:
            return self.generated_count()
        return self.min_meals_per_day


@dataclass(frozen=True)
class Constraint:
    """A bound on an attribute total, per day or over the horizon.

    ``aggregate`` is required for horizon scope and must be None for day
    scope (#39). Weights are ignored for hard constraints. The guard-rail
    (#18) applies only to ``average_per_day`` and defaults to half weight.
    """

    name: str
    attribute: str
    scope: str = "day"
    aggregate: str | None = None
    min: float | None = None
    max: float | None = None
    hard: bool = False
    weight: float = 1.0
    weight_below: float | None = None
    weight_above: float | None = None
    normalization_reference: float | None = None
    add_day_guardrail: bool = True
    guardrail_weight: float | None = None
    relaxable: bool = True  # stored for RELAX mode (#14), unused in this slice

    def __post_init__(self):
        p = []
        label = f"constraint {self.name!r}"
        if not self.name:
            p.append("constraint name must not be empty")
        if self.scope not in SCOPES:
            p.append(f"{label}: scope must be one of {SCOPES}")
        if self.scope == "day" and self.aggregate is not None:
            p.append(f"{label}: aggregate applies to horizon scope only")
        if self.scope == "horizon" and self.aggregate not in AGGREGATES:
            p.append(f"{label}: horizon scope needs aggregate in {AGGREGATES}")
        if self.min is None and self.max is None:
            p.append(f"{label}: needs min, max or both")
        if (
            self.min is not None
            and self.max is not None
            and to_decimal(self.min) > to_decimal(self.max)
        ):
            p.append(f"{label}: min {self.min} greater than max {self.max}")
        for field_name in ("weight", "weight_below", "weight_above", "guardrail_weight"):
            value = getattr(self, field_name)
            if value is not None and to_decimal(value) < 0:
                p.append(f"{label}: {field_name} is negative")
        if self.normalization_reference is not None and (
            to_decimal(self.normalization_reference) <= 0
        ):
            p.append(f"{label}: normalization_reference must be positive")
        if self.needs_reference() and self.normalization_reference is None:
            for bound in (self.min, self.max):
                if bound is not None and to_decimal(bound) == 0:
                    p.append(
                        f"{label}: a zero bound needs normalization_reference (#17)"
                    )
                    break
        raise_if(p)

    def has_guardrail(self) -> bool:
        return self.aggregate == "average_per_day" and self.add_day_guardrail

    def needs_reference(self) -> bool:
        """True if any soft penalty is built from this constraint's bounds."""
        return not self.hard or self.has_guardrail()

    def side_weight(self, side: str):
        override = self.weight_below if side == "below" else self.weight_above
        return to_decimal(self.weight if override is None else override)

    def guardrail_side_weight(self, side: str):
        if self.guardrail_weight is not None:
            return to_decimal(self.guardrail_weight)
        return self.side_weight(side) / 2


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
        for name in ("exclude_tags", "require_tags"):
            object.__setattr__(self, name, frozenset(getattr(self, name)))
        raise_if(self._problems())

    def _problems(self) -> list[str]:
        p = []
        p += _duplicates("attribute", [a.name for a in self.attributes])
        p += _duplicates("tag", [t.name for t in self.tags])
        p += _duplicates("recipe", [r.name for r in self.recipes])
        p += _duplicates("constraint", [c.name for c in self.constraints])
        ingredients = {}
        for recipe in self.recipes:
            for ing in recipe.ingredients():
                if ingredients.setdefault(ing.name, ing) != ing:
                    p.append(f"two different ingredients named {ing.name!r}")
                    ingredients[ing.name] = ing
        attribute_names = {a.name for a in self.attributes}
        tag_names = {t.name for t in self.tags}
        for ing in ingredients.values():
            for attr in sorted(set(ing.attributes) - attribute_names):
                p.append(f"ingredient {ing.name!r}: unknown attribute {attr!r}")
            for tag in sorted(ing.tags - tag_names):
                p.append(f"ingredient {ing.name!r}: unknown tag {tag!r}")
        for recipe in self.recipes:
            for tag in sorted(recipe.extra_tags - tag_names):
                p.append(f"recipe {recipe.name!r}: unknown tag {tag!r}")
        for c in self.constraints:
            if c.attribute not in attribute_names:
                p.append(f"constraint {c.name!r}: unknown attribute {c.attribute!r}")
        for tag in sorted((self.exclude_tags | self.require_tags) - tag_names):
            p.append(f"unknown tag {tag!r} in exclude_tags/require_tags")
        if not self.days:
            p.append("the plan needs at least one day")
        if self.solve_time_limit <= 0:
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
        kept = []
        for recipe in self.recipes:
            tags = recipe.tags(defs)
            if tags & self.exclude_tags or not self.require_tags <= tags:
                continue
            kept.append(recipe)
        return tuple(kept)


def _duplicates(kind: str, names: list[str]) -> list[str]:
    seen, dupes = set(), []
    for name in names:
        if name in seen and name not in dupes:
            dupes.append(name)
        seen.add(name)
    return [f"duplicate {kind} name {name!r}" for name in dupes]
