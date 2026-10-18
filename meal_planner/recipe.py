"""Recipes: a fixed list of ingredient amounts scaled by a serving multiplier."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Mapping

from .domain import Ingredient, IngredientAmount, TagDef
from .scaling import to_decimal
from .validation import check_numbers, raise_if

MULTIPLIERS = ("min_multiplier", "max_multiplier", "hard_max_multiplier")
NUMBER_FIELDS = MULTIPLIERS + ("multiplier_step", "serving_cap_weight")


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
        problems, bad = check_numbers(
            f"recipe {self.name!r}", self, NUMBER_FIELDS,
            required=("min_multiplier", "max_multiplier", "serving_cap_weight"),
            thousandths=MULTIPLIERS + ("multiplier_step",),
        )
        if self.hard_max_multiplier is None and "max_multiplier" not in bad:
            object.__setattr__(
                self, "hard_max_multiplier", 3 * to_decimal(self.max_multiplier)
            )
        if not self.name:
            problems.append("recipe name must not be empty")
        if not self.items:
            problems.append(f"recipe {self.name!r} has no ingredients")
        if not bad & set(MULTIPLIERS):
            problems += self._multiplier_problems(bad)
        if "serving_cap_weight" not in bad and to_decimal(self.serving_cap_weight) < 0:
            problems.append(f"recipe {self.name!r}: serving_cap_weight is negative")
        raise_if(problems)

    def _multiplier_problems(self, bad: set[str]) -> list[str]:
        problems = []
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
                problems.append(f"recipe {self.name!r}: multiplier_step must be positive")
            elif low % step != 0:
                problems.append(
                    f"recipe {self.name!r}: min multiplier {low} is not a "
                    f"multiple of step {step}"
                )
        return problems

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
        ingredients = self.ingredients()
        derived = {tag.name for tag in tag_defs.values() if tag.holds_for(ingredients)}
        return frozenset(derived) | self.extra_tags
