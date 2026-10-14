"""Catalog types: attributes, tags, ingredients and recipes.

Recipe attribute totals and tags are derived from ingredients (decisions
#22 and #37), never entered by hand.
"""

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Mapping

from .scaling import to_decimal

ACCRUES_ON = ("eaten", "purchase")
DERIVE_RULES = ("all", "any")
MIN_PRECISION = 0
MAX_PRECISION = 6


class PlanRequestError(ValueError):
    """Invalid input. ``problems`` lists every problem found, not just the first."""

    def __init__(self, problems):
        self.problems = tuple(problems)
        super().__init__("; ".join(self.problems))


def raise_if(problems) -> None:
    if problems:
        raise PlanRequestError(problems)


@dataclass(frozen=True)
class AttributeDef:
    """A user-defined tracked quantity (decision #7)."""

    name: str
    precision: int = 3
    accrues_on: str | None = None  # None: "purchase" for cost, else "eaten" (#28)

    def __post_init__(self):
        if self.accrues_on is None:
            object.__setattr__(
                self, "accrues_on", "purchase" if self.name == "cost" else "eaten"
            )
        problems = []
        if not self.name:
            problems.append("attribute name must not be empty")
        if not MIN_PRECISION <= self.precision <= MAX_PRECISION:
            problems.append(
                f"attribute {self.name!r}: precision {self.precision} outside "
                f"{MIN_PRECISION}..{MAX_PRECISION}"
            )
        if self.accrues_on not in ACCRUES_ON:
            problems.append(
                f"attribute {self.name!r}: accrues_on must be one of {ACCRUES_ON}"
            )
        raise_if(problems)


@dataclass(frozen=True)
class TagDef:
    """A yes/no label and how a recipe derives it from ingredients (decision #37)."""

    name: str
    derive: str

    def __post_init__(self):
        problems = []
        if not self.name:
            problems.append("tag name must not be empty")
        if self.derive not in DERIVE_RULES:
            problems.append(f"tag {self.name!r}: derive must be one of {DERIVE_RULES}")
        raise_if(problems)


@dataclass(frozen=True)
class Ingredient:
    """``attributes`` are per-unit values; an attribute left out counts as 0."""

    name: str
    unit: str
    attributes: Mapping[str, float] = field(default_factory=dict)
    tags: frozenset[str] = frozenset()

    def __post_init__(self):
        object.__setattr__(self, "tags", frozenset(self.tags))
        problems = []
        if not self.name:
            problems.append("ingredient name must not be empty")
        raise_if(problems)


@dataclass(frozen=True)
class IngredientAmount:
    """A quantity of an ingredient, in the ingredient's own unit."""

    ingredient: Ingredient
    quantity: float

    def __post_init__(self):
        if to_decimal(self.quantity) <= 0:
            raise PlanRequestError(
                [f"amount of {self.ingredient.name!r} must be positive"]
            )


@dataclass(frozen=True)
class Recipe:
    """A fixed list of ingredient amounts at 1x, scaled by a serving multiplier.

    ``multiplier_step=None`` means continuous (thousandths); otherwise the
    multiplier is a whole number of steps. ``max_multiplier`` is the soft
    serving cap (#16, #22); ``hard_max_multiplier`` defaults to 3x it (#38).
    """

    name: str
    items: tuple[IngredientAmount, ...]
    extra_tags: frozenset[str] = frozenset()
    multiplier_step: float | None = None
    min_multiplier: float = 0.5
    max_multiplier: float = 2.0
    hard_max_multiplier: float | None = None
    serving_cap_weight: float = 1.0

    def __post_init__(self):
        object.__setattr__(self, "items", tuple(self.items))
        object.__setattr__(self, "extra_tags", frozenset(self.extra_tags))
        if self.hard_max_multiplier is None:
            object.__setattr__(
                self, "hard_max_multiplier", 3 * to_decimal(self.max_multiplier)
            )
        problems = []
        if not self.name:
            problems.append("recipe name must not be empty")
        if not self.items:
            problems.append(f"recipe {self.name!r} has no ingredients")
        low = to_decimal(self.min_multiplier)
        soft = to_decimal(self.max_multiplier)
        hard = to_decimal(self.hard_max_multiplier)
        if not 0 < low <= soft <= hard:
            problems.append(
                f"recipe {self.name!r}: multipliers must satisfy "
                f"0 < min ({low}) <= max ({soft}) <= hard max ({hard})"
            )
        if self.multiplier_step is not None:
            step = to_decimal(self.multiplier_step)
            if step <= 0:
                problems.append(f"recipe {self.name!r}: multiplier_step must be positive")
            elif low % step != 0:
                problems.append(
                    f"recipe {self.name!r}: min multiplier {low} is not a "
                    f"multiple of step {step}"
                )
        if to_decimal(self.serving_cap_weight) < 0:
            problems.append(f"recipe {self.name!r}: serving_cap_weight is negative")
        raise_if(problems)

    def ingredients(self) -> tuple[Ingredient, ...]:
        return tuple(item.ingredient for item in self.items)

    def attribute_total(self, attribute: str) -> Decimal:
        """Exact sum of quantity times per-unit value at 1x."""
        return sum(
            (
                to_decimal(item.quantity)
                * to_decimal(item.ingredient.attributes.get(attribute, 0))
                for item in self.items
            ),
            Decimal(0),
        )

    def tags(self, tag_defs: Mapping[str, TagDef]) -> frozenset[str]:
        """Tags derived from ingredients per each tag's rule, plus ``extra_tags``."""
        derived = set()
        for tag in tag_defs.values():
            has = [tag.name in ing.tags for ing in self.ingredients()]
            if (tag.derive == "all" and all(has)) or (tag.derive == "any" and any(has)):
                derived.add(tag.name)
        return frozenset(derived) | self.extra_tags
