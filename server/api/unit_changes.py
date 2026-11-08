"""What the unit-change preview answers and how a refused change is reported,
shared by the attribute and ingredient routes."""

from typing import Literal

from pydantic import BaseModel

from .. import unit_change
from .errors import FieldError, FieldErrors, invalid_fields


class UnitChangeRefusal(BaseModel):
    type: Literal[
        "conversion_needs_decimals", "conversion_too_large",
        "conversion_rounds_to_zero", "unit_not_for_ingredient",
    ]
    msg: str
    # The number that can't be converted: "goal", "ingredient_value",
    # "basis" or "recipe_amount"; its owner's name and its field.
    kind: str | None = None
    name: str | None = None
    field: str | None = None
    number: str | None = None  # as stored, in the old unit
    converted: str | None = None  # what the conversion would give
    decimals_needed: int | None = None  # null: no number of decimals fits


class UnitChange(BaseModel):
    # same: the same unit in another spelling; convert: the numbers change;
    # no_convert: another category or free text, only the unit changes.
    kind: Literal["same", "convert", "no_convert"]
    factor: str | None  # "1000"; null unless kind is "convert"
    counts: dict[str, int]  # the numbers stored in the old unit, by kind of number
    rounded: int  # how many converted numbers lose digits
    refusal: UnitChangeRefusal | None


UNIT_CHANGE_REFUSED = {
    422: {"model": FieldErrors, "description": "The conversion would lose precision or a number's range"}
}


def answer(change: unit_change.Change) -> UnitChange:
    refusal = change.refusal
    return UnitChange(
        kind=change.kind,
        factor=change.factor,
        counts=change.counts,
        rounded=change.rounded,
        refusal=None if refusal is None else UnitChangeRefusal(**vars(refusal)),
    )


def refuse(change: unit_change.Change) -> None:
    """Answer 422 on the unit field if the change is refused."""
    if change.refusal is not None:
        error = FieldError(loc=["body", "unit"], type=change.refusal.type, msg=change.refusal.msg)
        raise invalid_fields([error])
