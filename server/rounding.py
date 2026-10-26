"""Rounding as the library rounds: half away from zero. The recipe totals
and the frozen plans both use it, so they always show the same numbers."""

from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction


def rounded(value: Decimal | Fraction, decimals: int) -> Decimal:
    """`value` to `decimals` places, half away from zero. A fraction is
    rounded exactly, so a tie rounds the right way."""
    if isinstance(value, Fraction):
        magnitude = abs(value)
        units = (2 * magnitude.numerator * 10**decimals + magnitude.denominator) // (2 * magnitude.denominator)
        return Decimal(-units if value < 0 else units).scaleb(-decimals)
    return value.quantize(Decimal(1).scaleb(-decimals), rounding=ROUND_HALF_UP)
