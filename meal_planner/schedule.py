"""The planning calendar: days made of meal slots."""

from dataclasses import dataclass

from .validation import PlanRequestError, raise_if

SLOT_KINDS = ("generated", "absent")


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
