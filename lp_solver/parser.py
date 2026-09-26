"""Parser for the small structured-text LP format.

See README.md in this directory for the format spec.
"""

import re
from typing import Dict, List, Optional, Tuple

from .model import Constraint, LPProblem

_TERM_RE = re.compile(r"([+-])(\d*\.?\d*)\*?([A-Za-z_]\w*)")
_OBJECTIVE_RE = re.compile(r"^(maximize|minimize|max|min)\s*:?\s*(.*)$", re.IGNORECASE)
_OP_RE = re.compile(r"(<=|>=|=)")


def parse_linear_expression(expr: str) -> Dict[str, float]:
    text = expr.replace(" ", "")
    if not text:
        return {}
    if text[0] not in "+-":
        text = "+" + text

    coeffs: Dict[str, float] = {}
    pos = 0
    for m in _TERM_RE.finditer(text):
        if m.start() != pos:
            raise ValueError(f"could not parse expression near {text[pos:m.start()]!r} in {expr!r}")
        sign, digits, var = m.groups()
        coeff = float(digits) if digits not in ("", ".") else 1.0
        if sign == "-":
            coeff = -coeff
        coeffs[var] = coeffs.get(var, 0.0) + coeff
        pos = m.end()
    if pos != len(text):
        raise ValueError(f"could not parse expression near {text[pos:]!r} in {expr!r}")
    return coeffs


def _parse_objective(line: str) -> Tuple[str, Dict[str, float]]:
    m = _OBJECTIVE_RE.match(line)
    if not m:
        raise ValueError(f"first line must be 'maximize: <expr>' or 'minimize: <expr>', got: {line!r}")
    word, expr = m.groups()
    sense = "maximize" if word.lower().startswith("max") else "minimize"
    coeffs = parse_linear_expression(expr)
    if not coeffs:
        raise ValueError("objective has no terms")
    return sense, coeffs


def _parse_constraint_line(line: str) -> Tuple[Dict[str, float], str, float]:
    m = _OP_RE.search(line)
    if not m:
        raise ValueError(f"constraint line is missing a comparison operator (<=, >=, =): {line!r}")
    op = m.group(1)
    lhs, rhs = line[: m.start()], line[m.end() :]
    coeffs = parse_linear_expression(lhs)
    if not coeffs:
        raise ValueError(f"constraint has no variable terms: {line!r}")
    rhs = rhs.strip()
    try:
        rhs_value = float(rhs)
    except ValueError:
        raise ValueError(
            f"right-hand side of a constraint must be a plain number, got {rhs!r} in: {line!r}"
        ) from None
    return coeffs, op, rhs_value


def parse_text(text: str) -> LPProblem:
    lines = []
    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if line:
            lines.append(line)
    if not lines:
        raise ValueError("empty problem: no objective line found")

    sense, objective = _parse_objective(lines[0])

    variables: List[str] = list(objective.keys())
    constraints: List[Constraint] = []
    bounds: Dict[str, List[Optional[float]]] = {}

    def register(names) -> None:
        for name in names:
            if name not in variables:
                variables.append(name)

    for line in lines[1:]:
        coeffs, op, rhs = _parse_constraint_line(line)
        register(coeffs.keys())

        if len(coeffs) == 1:
            (var, coef), = coeffs.items()
            if coef == 0:
                raise ValueError(f"zero coefficient in bound line: {line!r}")
            value = rhs / coef
            effective_op = op
            if coef < 0:
                effective_op = {"<=": ">=", ">=": "<=", "=": "="}[op]

            lo, hi = bounds.get(var, [None, None])
            if effective_op == "<=":
                hi = value if hi is None else min(hi, value)
            elif effective_op == ">=":
                lo = value if lo is None else max(lo, value)
            else:
                lo = hi = value
            bounds[var] = [lo, hi]
        else:
            constraints.append(Constraint(coeffs=coeffs, sense=op, rhs=rhs))

    # Any bound never explicitly given a lower value defaults to 0, matching
    # ordinary LP convention (x >= 0). A line that *did* set one (even to a
    # negative value) is left as the user wrote it.
    for var in variables:
        lo, hi = bounds.get(var, [None, None])
        if lo is None:
            lo = 0.0
        bounds[var] = [lo, hi]

    return LPProblem(
        sense=sense,
        objective=objective,
        constraints=constraints,
        bounds=bounds,
        variables=variables,
    )


def parse_file(path: str) -> LPProblem:
    with open(path, "r", encoding="utf-8") as f:
        return parse_text(f.read())
