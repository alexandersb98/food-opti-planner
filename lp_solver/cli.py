import argparse
import sys
from typing import Optional, Sequence

from .parser import parse_file
from .simplex import solve


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(
        prog="lp_solver",
        description="Solve a linear programming problem described in a structured text file.",
    )
    ap.add_argument("file", help="path to the problem file (see lp_solver/README.md for the format)")
    args = ap.parse_args(argv)

    try:
        problem = parse_file(args.file)
        solution = solve(problem)
    except (ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if solution.status == "optimal":
        print("status: optimal")
        print(f"objective ({problem.sense}): {solution.objective_value:.6g}")
        for v in problem.variables:
            print(f"  {v} = {solution.values[v]:.6g}")
        return 0
    elif solution.status == "infeasible":
        print("status: infeasible -- no assignment satisfies all constraints")
        return 1
    else:
        print("status: unbounded -- the objective can be improved without limit")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
