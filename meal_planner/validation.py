"""Input validation helpers shared by the catalog and request types.

Every type collects all of its problems before raising, so one
:class:`PlanRequestError` reports everything wrong with an input.
"""

from decimal import Decimal, InvalidOperation

from .scaling import MULTIPLIER_PRECISION, to_decimal


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


def thousandths_problem(label: str, value) -> str | None:
    """Multipliers are held in thousandths; finer values would be silently rounded."""
    scaled = to_decimal(value).scaleb(MULTIPLIER_PRECISION)
    if scaled != scaled.to_integral_value():
        return f"{label} {value} is not a whole number of thousandths"
    return None


def check_numbers(label: str, obj, fields, required=(),
                  thousandths=()) -> tuple[list[str], set[str]]:
    """Check that each of ``obj``'s ``fields`` is a finite number.

    None is allowed except for fields in ``required``. Fields in
    ``thousandths`` must also be a whole number of thousandths. Returns the
    problems and the names of the fields that failed, so later checks can
    skip values that cannot be read.
    """
    problems, bad = [], set()
    for name in fields:
        value = getattr(obj, name)
        if value is None and name not in required:
            continue
        problem = number_problem(f"{label}: {name}", value)
        if problem is None and name in thousandths:
            problem = thousandths_problem(f"{label}: {name}", value)
        if problem:
            bad.add(name)
            problems.append(problem)
    return problems, bad


def duplicate_problems(kind: str, names) -> list[str]:
    seen, dupes = set(), []
    for name in names:
        if name in seen and name not in dupes:
            dupes.append(name)
        seen.add(name)
    return [f"duplicate {kind} name {name!r}" for name in dupes]
