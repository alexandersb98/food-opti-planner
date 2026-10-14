"""Solver-neutral integer model (decision #15). No solver imports here.

The builder writes into a :class:`Model`; a backend translates it. All
coefficients and bounds are integers, already scaled.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Var:
    index: int
    name: str
    lb: int
    ub: int


@dataclass
class LinExpr:
    """``sum(coef * var) + constant``; ``terms`` maps var index to coefficient."""

    terms: dict[int, int] = field(default_factory=dict)
    constant: int = 0

    def add(self, var: Var, coef: int) -> "LinExpr":
        if coef:
            total = self.terms.get(var.index, 0) + coef
            if total:
                self.terms[var.index] = total
            else:
                self.terms.pop(var.index, None)
        return self

    def add_expr(self, other: "LinExpr", factor: int = 1) -> "LinExpr":
        for index, coef in other.terms.items():
            total = self.terms.get(index, 0) + coef * factor
            if total:
                self.terms[index] = total
            else:
                self.terms.pop(index, None)
        self.constant += other.constant * factor
        return self

    def copy(self) -> "LinExpr":
        return LinExpr(dict(self.terms), self.constant)


@dataclass(frozen=True)
class LinConstraint:
    """``lb <= expr <= ub``; a None bound is open. With ``enforced_by``, the
    constraint holds only when that 0/1 switch is 1 (decision #14)."""

    expr: LinExpr
    lb: int | None
    ub: int | None
    enforced_by: Var | None = None


@dataclass(frozen=True)
class Guard:
    """The switch on one hard constraint, and what to call it in a report."""

    switch: Var
    constraint: str
    day: int | None


@dataclass
class Model:
    variables: list[Var] = field(default_factory=list)
    constraints: list[LinConstraint] = field(default_factory=list)
    objective: LinExpr = field(default_factory=LinExpr)  # minimized
    guards: list[Guard] = field(default_factory=list)

    def new_var(self, name: str, lb: int, ub: int) -> Var:
        if lb > ub:
            raise ValueError(f"variable {name}: lb {lb} > ub {ub}")
        var = Var(len(self.variables), name, lb, ub)
        self.variables.append(var)
        return var

    def new_bool(self, name: str) -> Var:
        return self.new_var(name, 0, 1)

    def add(self, expr: LinExpr, lb: int | None = None, ub: int | None = None,
            enforced_by: Var | None = None) -> LinConstraint:
        constraint = LinConstraint(expr, lb, ub, enforced_by)
        self.constraints.append(constraint)
        return constraint

    def add_guard(self, constraint: str, day: int | None) -> Var:
        switch = self.new_bool(f"guard[{constraint}@{day}]")
        self.guards.append(Guard(switch, constraint, day))
        return switch

    def bounds(self, expr: LinExpr) -> tuple[int, int]:
        """Smallest and largest value ``expr`` can take within variable bounds."""
        low = high = expr.constant
        for index, coef in expr.terms.items():
            var = self.variables[index]
            a, b = coef * var.lb, coef * var.ub
            low += min(a, b)
            high += max(a, b)
        return low, high

    def magnitude(self, expr: LinExpr) -> int:
        """Upper bound on any partial sum the solver may form from ``expr``."""
        total = abs(expr.constant)
        for index, coef in expr.terms.items():
            var = self.variables[index]
            total += abs(coef) * max(abs(var.lb), abs(var.ub))
        return total
