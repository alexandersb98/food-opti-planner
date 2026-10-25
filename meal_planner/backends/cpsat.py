"""OR-Tools CP-SAT backend: the only module that imports OR-Tools.

Solves deterministically (decision #25): one worker, a fixed seed, and the
request's time limit (decision #24).
"""

from dataclasses import dataclass

from ortools.sat.python import cp_model

from ..ir import LinConstraint, LinExpr, Model
from ..stopping import StopHandle

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
          optimize: bool = True, stop: StopHandle | None = None) -> SolveOutcome:
    """Solve ``model`` with the switches of guards ``assumed`` forced on.

    ``assumed`` lists guard indices; None means every guard. Switches not
    assumed are free, which turns their constraints off. With
    ``optimize=False`` the objective is dropped (feasibility check only).
    A ``stop`` that is stopped ends the search, or skips it, as a timeout
    would.
    """
    if stop is not None and stop.stopped:
        return SolveOutcome("UNKNOWN")
    cp = cp_model.CpModel()
    cp_vars = [cp.new_int_var(v.lb, v.ub, v.name) for v in model.variables]
    for c in model.constraints:
        _add_constraint(cp, cp_vars, c)
    if optimize and model.objective.terms:
        cp.minimize(_expr(cp_vars, model.objective))
    literal_to_guard = _assume_guards(cp, cp_vars, model, assumed)

    solver = _solver(time_limit)
    if stop is None:
        code = solver.solve(cp)
    elif not stop._attach(solver):
        return SolveOutcome("UNKNOWN")
    else:
        _stop_on_first_log(solver, stop)
        try:
            code = solver.solve(cp)
        finally:
            stop._detach()
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


def _expr(cp_vars, e: LinExpr):
    return sum((cp_vars[i] * c for i, c in e.terms.items()), e.constant)


def _add_constraint(cp, cp_vars, c: LinConstraint) -> None:
    if not c.expr.terms:
        # No variables: the bounds are decided here, not passed to CP-SAT as a bool.
        value = c.expr.constant
        holds = (c.lb is None or value >= c.lb) and (c.ub is None or value <= c.ub)
        if not holds:
            if c.enforced_by is not None:
                cp.add(cp_vars[c.enforced_by.index] == 0)
            else:
                cp.add_bool_or([])
        return
    target = _expr(cp_vars, c.expr)
    made = []
    if c.lb is not None:
        made.append(cp.add(target >= c.lb))
    if c.ub is not None:
        made.append(cp.add(target <= c.ub))
    if c.enforced_by is not None:
        for ct in made:
            ct.only_enforce_if(cp_vars[c.enforced_by.index])


def _assume_guards(cp, cp_vars, model: Model, assumed) -> dict[int, int]:
    """Force the assumed guard switches on; map each literal back to its guard."""
    guard_indices = range(len(model.guards)) if assumed is None else assumed
    literals = [cp_vars[model.guards[g].switch.index] for g in guard_indices]
    cp.add_assumptions(literals)
    return {literal.index: g for literal, g in zip(literals, guard_indices)}


def _stop_on_first_log(solver: cp_model.CpSolver, stop: StopHandle) -> None:
    """CP-SAT ignores stop_search() in the instant before its search starts,
    so a stop then would be lost. Its log starts once the search is under
    way: a stop already made by then is passed on there."""
    solver.parameters.log_search_progress = True
    solver.parameters.log_to_stdout = False

    def on_log(line: str) -> None:
        if stop.stopped:
            solver.stop_search()

    solver.log_callback = on_log


def _solver(time_limit: float) -> cp_model.CpSolver:
    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1
    solver.parameters.random_seed = SEED
    solver.parameters.max_time_in_seconds = time_limit
    return solver
