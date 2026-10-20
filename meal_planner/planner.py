"""``plan(request) -> Plan``: the one public entry point (STRICT mode, #14)."""

from .backends import cpsat
from .builder import BuiltModel, build
from .decoding import decode
from .request import PlanRequest
from .result import ConflictMember, ConflictReport, Plan, SolveStatus

_STATUS = {
    "OPTIMAL": SolveStatus.OPTIMAL,
    "FEASIBLE": SolveStatus.FEASIBLE,
    "INFEASIBLE": SolveStatus.INFEASIBLE,
    "UNKNOWN": SolveStatus.TIMEOUT_NO_SOLUTION,
}


def plan(request: PlanRequest) -> Plan:
    built = build(request)
    outcome = cpsat.solve(built.model, request.solve_time_limit)
    status = _STATUS[outcome.status]
    if status is SolveStatus.INFEASIBLE:
        core = minimize_core(built, outcome.core, request.solve_time_limit)
        guards = built.model.guards
        members = tuple(ConflictMember(guards[g].constraint, guards[g].day) for g in core)
        return Plan(status, conflicts=ConflictReport(members))
    if status is SolveStatus.TIMEOUT_NO_SOLUTION:
        return Plan(status)
    return decode(request, built, outcome, status)


def minimize_core(built: BuiltModel, core, time_limit: float) -> tuple[int, ...]:
    """Drop each member in turn; keep it only if the rest become feasible.

    A re-solve that times out counts as feasible, so the member is kept.
    Worst case is ``len(core) + 1`` solves (the initial one plus one per
    member), each allowed the full ``time_limit`` (plan interpretation 10).
    """
    members = list(core)
    for guard in list(members):
        trial = [g for g in members if g != guard]
        outcome = cpsat.solve(built.model, time_limit, assumed=trial, optimize=False)
        if outcome.status == "INFEASIBLE":
            members = trial
    return tuple(members)
