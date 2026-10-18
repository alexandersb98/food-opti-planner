"""Constraints: bounds on an attribute total, per day or over the horizon."""

from dataclasses import dataclass

from .scaling import to_decimal
from .validation import check_numbers, raise_if

SCOPES = ("day", "horizon")
AGGREGATES = ("total", "average_per_day")
NUMBER_FIELDS = ("min", "max", "weight", "weight_below", "weight_above",
                 "guardrail_weight", "normalization_reference")
WEIGHT_FIELDS = ("weight", "weight_below", "weight_above", "guardrail_weight")


@dataclass(frozen=True)
class Constraint:
    """A bound on an attribute total, per day or over the horizon.

    ``aggregate`` is required for horizon scope and must be None for day
    scope (#39). Weights are ignored for hard constraints. The guard-rail
    (#18) applies only to ``average_per_day`` and defaults to half weight.
    How a constraint unfolds over the days is in :mod:`.bounds`.
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
        label = f"constraint {self.name!r}"
        p = self._shape_problems(label)
        number_problems, bad = check_numbers(label, self, NUMBER_FIELDS)
        p += number_problems
        if not bad & {"min", "max"} and None not in (self.min, self.max) and (
            to_decimal(self.min) > to_decimal(self.max)
        ):
            p.append(f"{label}: min {self.min} greater than max {self.max}")
        for name in WEIGHT_FIELDS:
            value = getattr(self, name)
            if value is not None and name not in bad and to_decimal(value) < 0:
                p.append(f"{label}: {name} is negative")
        reference = self.normalization_reference
        if reference is not None and "normalization_reference" not in bad:
            if to_decimal(reference) <= 0:
                p.append(f"{label}: normalization_reference must be positive")
        elif reference is None and self.needs_reference() and any(
            value is not None and name not in bad and to_decimal(value) == 0
            for name, value in (("min", self.min), ("max", self.max))
        ):
            p.append(f"{label}: a zero bound needs normalization_reference (#17)")
        raise_if(p)

    def _shape_problems(self, label: str) -> list[str]:
        p = []
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
        return p

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
