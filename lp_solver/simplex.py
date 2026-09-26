"""A small, dependency-free Big-M simplex solver.

Not built for speed or numerical robustness on large or ill-conditioned
problems -- it's meant for the small, well-scaled problems this sample app
targets. Every variable must have a finite lower bound (default 0).
"""

from typing import List

from .model import LPProblem, Solution

_EPS = 1e-9
_MAX_ITER = 5000


def solve(problem: LPProblem) -> Solution:
    variables = problem.variables
    n = len(variables)

    lower = {}
    upper = {}
    for v in variables:
        lo, hi = problem.bounds.get(v, [0.0, None])
        if lo is None:
            raise ValueError(
                f"variable {v!r} has no finite lower bound; every variable needs one "
                f"(the default is 0 unless a bound line overrides it)"
            )
        lower[v] = lo
        upper[v] = hi

    # Internal minimization objective, expressed against the *original* x.
    sign = 1.0 if problem.sense == "minimize" else -1.0
    c_min = {v: sign * problem.objective.get(v, 0.0) for v in variables}

    # Shift each variable so its lower bound becomes 0: x = x' + lower[v].
    rows: List[list] = []
    for con in problem.constraints:
        coeffs = [con.coeffs.get(v, 0.0) for v in variables]
        rhs = con.rhs - sum(con.coeffs.get(v, 0.0) * lower[v] for v in variables)
        rows.append([coeffs, con.sense, rhs])
    for i, v in enumerate(variables):
        if upper[v] is not None:
            if upper[v] < lower[v] - _EPS:
                raise ValueError(f"variable {v!r} has an upper bound below its lower bound")
            coeffs = [0.0] * n
            coeffs[i] = 1.0
            rows.append([coeffs, "<=", upper[v] - lower[v]])

    if not rows:
        if any(c_min[v] < -_EPS for v in variables):
            return Solution(status="unbounded", objective_value=None, values={})
        values = {v: lower[v] for v in variables}
        raw_min = sum(c_min[v] * values[v] for v in variables)
        objective_value = raw_min if problem.sense == "minimize" else -raw_min
        return Solution(status="optimal", objective_value=objective_value, values=values)

    for row in rows:
        coeffs, s, rhs = row
        if rhs < 0:
            row[0] = [-x for x in coeffs]
            row[2] = -rhs
            row[1] = {"<=": ">=", ">=": "<=", "=": "="}[s]

    m = len(rows)

    extra_cost: List[float] = []
    extra_is_artificial: List[bool] = []
    col_data: List[dict] = []
    basis = [0] * m
    for i, (coeffs, s, rhs) in enumerate(rows):
        if s == "<=":
            col_data.append({i: 1.0})
            extra_cost.append(0.0)
            extra_is_artificial.append(False)
            basis[i] = n + len(extra_cost) - 1
        elif s == ">=":
            col_data.append({i: -1.0})
            extra_cost.append(0.0)
            extra_is_artificial.append(False)
            col_data.append({i: 1.0})
            extra_cost.append(None)
            extra_is_artificial.append(True)
            basis[i] = n + len(extra_cost) - 1
        elif s == "=":
            col_data.append({i: 1.0})
            extra_cost.append(None)
            extra_is_artificial.append(True)
            basis[i] = n + len(extra_cost) - 1
        else:
            raise ValueError(f"unknown constraint sense {s!r}")

    ncols = n + len(extra_cost)
    max_abs = max(
        [abs(x) for coeffs, _, _ in rows for x in coeffs]
        + [abs(rhs) for _, _, rhs in rows]
        + [abs(v) for v in c_min.values()]
        + [1.0]
    )
    big_m = max_abs * 1e4 + 1e4
    extra_cost = [big_m if c is None else c for c in extra_cost]
    cost = [c_min[v] for v in variables] + extra_cost

    tableau = [[0.0] * (ncols + 1) for _ in range(m)]
    for i, (coeffs, _, rhs) in enumerate(rows):
        for j, val in enumerate(coeffs):
            tableau[i][j] = val
        tableau[i][ncols] = rhs
    for k, colmap in enumerate(col_data):
        j = n + k
        for i, val in colmap.items():
            tableau[i][j] = val

    for _ in range(_MAX_ITER):
        reduced = [
            cost[j] - sum(cost[basis[i]] * tableau[i][j] for i in range(m))
            for j in range(ncols)
        ]
        enter = min(range(ncols), key=lambda j: reduced[j])
        if reduced[enter] >= -_EPS:
            break

        leave = None
        best_ratio = None
        for i in range(m):
            a = tableau[i][enter]
            if a > _EPS:
                ratio = tableau[i][ncols] / a
                if best_ratio is None or ratio < best_ratio - _EPS:
                    best_ratio = ratio
                    leave = i
        if leave is None:
            return Solution(status="unbounded", objective_value=None, values={})

        pivot = tableau[leave][enter]
        tableau[leave] = [x / pivot for x in tableau[leave]]
        for i in range(m):
            if i != leave and abs(tableau[i][enter]) > _EPS:
                factor = tableau[i][enter]
                tableau[i] = [tableau[i][j] - factor * tableau[leave][j] for j in range(ncols + 1)]
        basis[leave] = enter
    else:
        raise RuntimeError("simplex did not converge within the iteration limit")

    for i in range(m):
        b = basis[i]
        if b >= n and extra_is_artificial[b - n] and tableau[i][ncols] > 1e-6:
            return Solution(status="infeasible", objective_value=None, values={})

    x_prime = [0.0] * n
    for i in range(m):
        if basis[i] < n:
            x_prime[basis[i]] = tableau[i][ncols]

    values = {v: x_prime[idx] + lower[v] for idx, v in enumerate(variables)}
    raw_min = sum(c_min[v] * values[v] for v in variables)
    objective_value = raw_min if problem.sense == "minimize" else -raw_min

    return Solution(status="optimal", objective_value=objective_value, values=values)
