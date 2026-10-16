"""Decision #24's reference scale. Opt-in: pytest -m benchmark -s"""

import time

import pytest

from meal_planner import SolveStatus, plan

from scenarios import random_request


@pytest.mark.benchmark
def test_reference_scale():
    request = random_request(seed=24, recipes=200, days=14, slots=3, time_limit=30.0)
    start = time.perf_counter()
    p = plan(request)
    elapsed = time.perf_counter() - start
    print(f"\nreference scale: {p.solve_status.value} in {elapsed:.1f}s, "
          f"objective {p.objective_value}")
    assert p.solve_status in (SolveStatus.OPTIMAL, SolveStatus.FEASIBLE)
