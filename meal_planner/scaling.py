"""Fixed-precision conversion between real numbers and integers (decision #15).

CP-SAT only works over integers, so every real quantity is held as an
integer count of 10**-precision units. Conversion goes through Decimal so
that a value such as 0.1 is read as exactly one tenth, not as its binary
float approximation.
"""

from decimal import ROUND_HALF_UP, Decimal

MULTIPLIER_PRECISION = 3
"""Serving multipliers are held in thousandths (decision #38)."""

INT64_MAX = 2**63 - 1


def to_decimal(value) -> Decimal:
    """Read an int, float, str or Decimal as an exact Decimal."""
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def to_int(value, precision: int) -> int:
    """Scale ``value`` to an integer count of 10**-precision units.

    Digits beyond ``precision`` are rounded once, half away from zero.
    """
    scaled = to_decimal(value).scaleb(precision)
    return int(scaled.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def from_int(units: int, precision: int) -> Decimal:
    """Inverse of :func:`to_int`: an exact Decimal."""
    return Decimal(units).scaleb(-precision)


def fits_int64(value: int) -> bool:
    return -INT64_MAX <= value <= INT64_MAX
