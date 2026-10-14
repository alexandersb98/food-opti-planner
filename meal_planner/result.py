"""What a solve returns: the plan, its status and its reports."""

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Mapping


class SolveStatus(Enum):
    """Decision #24. TIMEOUT_NO_SOLUTION: the time limit hit before any plan."""

    OPTIMAL = "OPTIMAL"
    FEASIBLE = "FEASIBLE"
    INFEASIBLE = "INFEASIBLE"
    TIMEOUT_NO_SOLUTION = "TIMEOUT_NO_SOLUTION"


@dataclass(frozen=True)
class SlotAssignment:
    """``recipe`` and ``multiplier`` are None for absent or unserved slots."""

    day: int
    slot: int
    kind: str
    recipe: str | None
    multiplier: Decimal | None
    totals: Mapping[str, Decimal]


@dataclass(frozen=True)
class Violation:
    """A missed soft bound. ``side`` is "below" (min) or "above" (max).

    ``amount`` is how far ``actual`` misses ``bound``; ``percent`` is that
    amount as a percentage of the normalization reference (#17).
    """

    constraint: str
    day: int | None
    slot: int | None
    side: str
    bound: Decimal
    actual: Decimal
    amount: Decimal
    percent: Decimal


@dataclass(frozen=True)
class ViolationReport:
    violations: tuple[Violation, ...] = ()

    def __iter__(self):
        return iter(self.violations)

    def __len__(self):
        return len(self.violations)

    def for_constraint(self, name: str) -> tuple[Violation, ...]:
        return tuple(v for v in self.violations if v.constraint == name)


@dataclass(frozen=True)
class ConflictMember:
    """A hard constraint in the conflict; ``day`` is None for horizon scope."""

    constraint: str
    day: int | None


@dataclass(frozen=True)
class ConflictReport:
    """A minimal set of hard constraints that cannot all hold (#14)."""

    members: tuple[ConflictMember, ...]


@dataclass(frozen=True)
class Plan:
    solve_status: SolveStatus
    objective_value: Decimal | None = None
    slots: tuple[SlotAssignment, ...] = ()
    day_totals: tuple[Mapping[str, Decimal], ...] = ()
    horizon_totals: Mapping[str, Decimal] | None = None
    violations: ViolationReport = ViolationReport()
    conflicts: ConflictReport | None = None

    def slot(self, day: int, slot: int) -> SlotAssignment:
        for assignment in self.slots:
            if (assignment.day, assignment.slot) == (day, slot):
                return assignment
        raise KeyError((day, slot))
