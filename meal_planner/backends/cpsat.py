"""OR-Tools CP-SAT backend: the only module that imports OR-Tools.

Solves deterministically (decision #25): one worker, a fixed seed, and the
request's time limit (decision #24).
"""

from dataclasses import dataclass

from ortools.sat.python import cp_model

from ..ir import LinExpr, Model

SEED = 20251013

_STATUS = {
    cp_model.OPTIMAL: "OPTIMAL",
    cp_model.FEASIBLE: "FEASIBLE",
    cp_model.INFEASIBLE: "INFEASIBLE",
    cp_model.UNKNOWN: "UNKNOWN",
}


@dataclass(frozen=True)
class SolveOutcome:
    """``status`` is OPTIMAL, FEASIBLE, INFEASIBLE or UNKNOWN (time ran out
    before anything was found). ``values`` is indexed like
    ``Model.variables`` and is empty without a solution. ``core`` holds
    indices into ``Model.guards`` whose switches explain an INFEASIBLE
    result; it is not necessarily minimal."""

    status: str
    values: tuple[int, ...] = ()
    objective: int | None = None
    core: tuple[int, ...] = ()


def solve(model: Model, time_limit: float, assumed=None,
          optimize: bool = True) -> SolveOutcome:
    """Solve ``model`` with the switches of guards ``assumed`` forced on.

    ``assumed`` lists guard indices; None means every guard. Switches not
    assumed are free, which turns their constraints off. With
    ``optimize=False`` the objective is dropped (feasibility check only).
    """
    cp = cp_model.CpModel()
    cp_vars = [cp.new_int_var(v.lb, v.ub, v.name) for v in model.variables]

    def expr(e: LinExpr):
        return sum((cp_vars[i] * c for i, c in e.terms.items()), e.constant)

    for c in model.constraints:
        if not c.expr.terms:
            # No variables: the bounds are decided here, not passed to CP-SAT as a bool.
            value = c.expr.constant
            holds = (c.lb is None or value >= c.lb) and (c.ub is None or value <= c.ub)
            if not holds:
                if c.enforced_by is not None:
                    cp.add(cp_vars[c.enforced_by.index] == 0)
                else:
                    cp.add_bool_or([])
            continue
        target = expr(c.expr)
        made = []
        if c.lb is not None:
            made.append(cp.add(target >= c.lb))
        if c.ub is not None:
            made.append(cp.add(target <= c.ub))
        if c.enforced_by is not None:
            for ct in made:
                ct.only_enforce_if(cp_vars[c.enforced_by.index])
    if optimize and model.objective.terms:
        cp.minimize(expr(model.objective))

    guard_indices = range(len(model.guards)) if assumed is None else assumed
    literal_to_guard = {}
    for g in guard_indices:
        literal = cp_vars[model.guards[g].switch.index]
        literal_to_guard[literal.index] = g
    cp.add_assumptions([cp_vars[model.guards[g].switch.index] for g in guard_indices])

    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1
    solver.parameters.random_seed = SEED
    solver.parameters.max_time_in_seconds = time_limit
    code = solver.solve(cp)
    if code == cp_model.MODEL_INVALID:
        raise RuntimeError(f"CP-SAT rejected the model: {cp.validate()}")
    status = _STATUS[code]
    if status in ("OPTIMAL", "FEASIBLE"):
        values = tuple(solver.value(v) for v in cp_vars)
        objective = None
        if optimize:
            objective = model.objective.constant + sum(
                c * values[i] for i, c in model.objective.terms.items()
            )
        return SolveOutcome(status, values, objective)
    if status == "INFEASIBLE":
        core = sorted(
            literal_to_guard[i]
            for i in solver.sufficient_assumptions_for_infeasibility()
            if i in literal_to_guard
        )
        return SolveOutcome(status, core=tuple(core))
    return SolveOutcome(status)
