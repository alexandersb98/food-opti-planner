"""Catalog types: attributes, tags, ingredients and recipes.

Recipe attribute totals and tags are derived from ingredients (decisions
#22 and #37), never entered by hand.
"""

from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Mapping

from .scaling import MULTIPLIER_PRECISION, to_decimal

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


def number_problem(label: str, value) -> str | None:
    """A problem string unless ``value`` is a finite real number, else None.

    Accepts int, float, Decimal and numeric str; rejects bool, NaN, infinities
    and anything ``to_decimal`` cannot read.
    """
    message = f"{label} must be a finite number, got {value!r}"
    if isinstance(value, bool) or not isinstance(value, (int, float, str, Decimal)):
        return message
    try:
        if not to_decimal(value).is_finite():
            return message
    except InvalidOperation:
        return message
    return None


def _thousandths_problem(label: str, value) -> str | None:
    """Multipliers are held in thousandths; finer values would be silently rounded."""
    scaled = to_decimal(value).scaleb(MULTIPLIER_PRECISION)
    if scaled != scaled.to_integral_value():
        return f"{label} {value} is not a whole number of thousandths"
    return None


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
        problems = []
        label = f"recipe {self.name!r}"
        bad = set()
        for field_name in ("min_multiplier", "max_multiplier", "hard_max_multiplier",
                           "multiplier_step", "serving_cap_weight"):
            value = getattr(self, field_name)
            if value is None and field_name in ("hard_max_multiplier", "multiplier_step"):
                continue
            problem = number_problem(f"{label}: {field_name}", value)
            if problem is None and field_name != "serving_cap_weight":
                problem = _thousandths_problem(f"{label}: {field_name}", value)
            if problem:
                bad.add(field_name)
                problems.append(problem)
        if self.hard_max_multiplier is None and "max_multiplier" not in bad:
            object.__setattr__(
                self, "hard_max_multiplier", 3 * to_decimal(self.max_multiplier)
            )
        if not self.name:
            problems.append("recipe name must not be empty")
        if not self.items:
            problems.append(f"recipe {self.name!r} has no ingredients")
        if not bad & {"min_multiplier", "max_multiplier", "hard_max_multiplier"}:
            low = to_decimal(self.min_multiplier)
            soft = to_decimal(self.max_multiplier)
            hard = to_decimal(self.hard_max_multiplier)
            if not 0 < low <= soft <= hard:
                problems.append(
                    f"recipe {self.name!r}: multipliers must satisfy "
                    f"0 < min ({low}) <= max ({soft}) <= hard max ({hard})"
                )
            if self.multiplier_step is not None and "multiplier_step" not in bad:
                step = to_decimal(self.multiplier_step)
                if step <= 0:
                    problems.append(
                        f"recipe {self.name!r}: multiplier_step must be positive"
                    )
                elif low % step != 0:
                    problems.append(
                        f"recipe {self.name!r}: min multiplier {low} is not a "
                        f"multiple of step {step}"
                    )
        if "serving_cap_weight" not in bad and to_decimal(self.serving_cap_weight) < 0:
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
