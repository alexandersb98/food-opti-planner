"""Catalog types: attributes, tags and ingredients.

Recipes (see :mod:`.recipe`) derive their attribute totals and tags from
these (decisions #22 and #37), never entered by hand.
"""

from dataclasses import dataclass, field
from typing import Iterable, Mapping

from .scaling import to_decimal
from .validation import PlanRequestError, number_problem, raise_if

ACCRUES_ON = ("eaten", "purchase")
DERIVE_RULES = ("all", "any")
MIN_PRECISION = 0
MAX_PRECISION = 6


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
        if isinstance(self.precision, bool) or not isinstance(self.precision, int):
            problems.append(
                f"attribute {self.name!r}: precision must be an integer, "
                f"got {self.precision!r}"
            )
        elif not MIN_PRECISION <= self.precision <= MAX_PRECISION:
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

    def holds_for(self, ingredients: Iterable["Ingredient"]) -> bool:
        """True if a dish of ``ingredients`` gets this tag under its rule."""
        has = [self.name in ing.tags for ing in ingredients]
        return all(has) if self.derive == "all" else any(has)


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
        for attr, value in self.attributes.items():
            problem = number_problem(f"ingredient {self.name!r}: attribute {attr!r}", value)
            if problem:
                problems.append(problem)
        raise_if(problems)


@dataclass(frozen=True)
class IngredientAmount:
    """A quantity of an ingredient, in the ingredient's own unit."""

    ingredient: Ingredient
    quantity: float

    def __post_init__(self):
        problem = number_problem(f"amount of {self.ingredient.name!r}", self.quantity)
        if problem:
            raise PlanRequestError([problem])
        if to_decimal(self.quantity) <= 0:
            raise PlanRequestError(
                [f"amount of {self.ingredient.name!r} must be positive"]
            )
