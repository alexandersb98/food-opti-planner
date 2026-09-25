import math
import os
import subprocess
import sys
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

from lp_solver import parse_text, solve  # noqa: E402
from lp_solver.parser import parse_linear_expression  # noqa: E402

EXAMPLES = os.path.join(REPO_ROOT, "examples")


def close(a, b, tol=1e-6):
    return math.isclose(a, b, abs_tol=tol)


class ParseLinearExpressionTests(unittest.TestCase):
    def test_simple_terms(self):
        self.assertEqual(parse_linear_expression("3x + 2y - z"), {"x": 3.0, "y": 2.0, "z": -1.0})

    def test_implicit_coefficient(self):
        self.assertEqual(parse_linear_expression("x"), {"x": 1.0})
        self.assertEqual(parse_linear_expression("-x"), {"x": -1.0})

    def test_decimal_and_star(self):
        self.assertEqual(parse_linear_expression("2.5*x1 - 0.5*x2"), {"x1": 2.5, "x2": -0.5})

    def test_repeated_variable_sums(self):
        self.assertEqual(parse_linear_expression("x + x"), {"x": 2.0})

    def test_garbage_raises(self):
        with self.assertRaises(ValueError):
            parse_linear_expression("3x + ??")


class ParserTests(unittest.TestCase):
    def test_single_variable_line_becomes_a_bound_not_a_constraint(self):
        problem = parse_text("maximize: x\nx <= 4\n")
        self.assertEqual(problem.constraints, [])
        self.assertEqual(problem.bounds["x"], [0.0, 4.0])

    def test_negative_coefficient_bound_flips_direction(self):
        problem = parse_text("minimize: x\n-x <= 4\n")
        # -x <= 4  =>  x >= -4
        self.assertEqual(problem.bounds["x"], [-4.0, None])

    def test_multi_variable_line_is_a_constraint(self):
        problem = parse_text("maximize: x + y\nx + y <= 4\n")
        self.assertEqual(len(problem.constraints), 1)

    def test_rejects_missing_objective(self):
        with self.assertRaises(ValueError):
            parse_text("x + y <= 4\n")

    def test_rejects_variable_rhs(self):
        with self.assertRaises(ValueError):
            parse_text("maximize: x\nx <= y\n")


class SolveTests(unittest.TestCase):
    def test_furniture_example_known_optimum(self):
        with open(os.path.join(EXAMPLES, "furniture.lp")) as f:
            problem = parse_text(f.read())
        solution = solve(problem)
        self.assertEqual(solution.status, "optimal")
        self.assertTrue(close(solution.objective_value, 36.0))
        self.assertTrue(close(solution.values["x"], 2.0))
        self.assertTrue(close(solution.values["y"], 6.0))

    def test_diet_example_meets_constraints_at_known_cost(self):
        with open(os.path.join(EXAMPLES, "diet.lp")) as f:
            problem = parse_text(f.read())
        solution = solve(problem)
        self.assertEqual(solution.status, "optimal")
        self.assertTrue(close(solution.objective_value, 12.0))
        x, y = solution.values["x"], solution.values["y"]
        self.assertGreaterEqual(4 * x + 6 * y, 24 - 1e-6)
        self.assertGreaterEqual(200 * x + 100 * y, 800 - 1e-6)

    def test_infeasible_example(self):
        with open(os.path.join(EXAMPLES, "infeasible.lp")) as f:
            problem = parse_text(f.read())
        solution = solve(problem)
        self.assertEqual(solution.status, "infeasible")

    def test_unbounded_example(self):
        with open(os.path.join(EXAMPLES, "unbounded.lp")) as f:
            problem = parse_text(f.read())
        solution = solve(problem)
        self.assertEqual(solution.status, "unbounded")

    def test_equality_constraint(self):
        problem = parse_text("minimize: x + y\nx + y = 10\nx <= 4\n")
        solution = solve(problem)
        self.assertEqual(solution.status, "optimal")
        self.assertTrue(close(solution.values["x"] + solution.values["y"], 10.0))

    def test_free_lower_bound_rejected(self):
        problem = parse_text("minimize: x\nx <= 4\n")
        problem.bounds["x"] = [None, 4.0]
        with self.assertRaises(ValueError):
            solve(problem)


class CliTests(unittest.TestCase):
    def run_cli(self, filename):
        return subprocess.run(
            [sys.executable, "-m", "lp_solver", os.path.join(EXAMPLES, filename)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )

    def test_optimal_exit_code_and_output(self):
        result = self.run_cli("furniture.lp")
        self.assertEqual(result.returncode, 0)
        self.assertIn("status: optimal", result.stdout)
        self.assertIn("objective (maximize): 36", result.stdout)

    def test_infeasible_exit_code(self):
        result = self.run_cli("infeasible.lp")
        self.assertEqual(result.returncode, 1)
        self.assertIn("infeasible", result.stdout)

    def test_unbounded_exit_code(self):
        result = self.run_cli("unbounded.lp")
        self.assertEqual(result.returncode, 1)
        self.assertIn("unbounded", result.stdout)

    def test_missing_file_reports_error(self):
        result = subprocess.run(
            [sys.executable, "-m", "lp_solver", "does-not-exist.lp"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("error:", result.stderr)


if __name__ == "__main__":
    unittest.main()
