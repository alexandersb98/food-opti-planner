"""What the builder produces: the model plus the bookkeeping to read it back.

Units: a recipe's attribute total is an integer at the attribute's
precision p. A multiplier is an integer number of thousandths (ticks). So
any slot, day or horizon total in the model is at scale 10**(p + 3).
"""

from dataclasses import dataclass, field

from ..ir import Model, Var
from ..recipe import Recipe
from ..scaling import MULTIPLIER_PRECISION


@dataclass(frozen=True)
class SlotChoice:
    """Recipe ``recipe`` in slot ``slot`` of day ``day``.

    The multiplier in ticks is ``amount * ticks_per_amount``: continuous
    recipes count single ticks, discrete ones count whole steps.
    """

    day: int
    slot: int
    recipe: Recipe
    used: Var
    amount: Var
    ticks_per_amount: int


@dataclass(frozen=True)
class SoftTerm:
    """One side of one soft bound, for tests and debugging."""

    constraint: str
    day: int | None
    side: str
    slack: Var
    coefficient: int


@dataclass
class BuiltModel:
    model: Model = field(default_factory=Model)
    choices: list[SlotChoice] = field(default_factory=list)
    recipe_units: dict[tuple[str, str], int] = field(default_factory=dict)  # at p
    soft_terms: list[SoftTerm] = field(default_factory=list)
    precision: dict[str, int] = field(default_factory=dict)  # attribute -> p

    def total_scale(self, attribute: str) -> int:
        """Decimal exponent of any slot, day or horizon total of ``attribute``."""
        return self.precision[attribute] + MULTIPLIER_PRECISION
