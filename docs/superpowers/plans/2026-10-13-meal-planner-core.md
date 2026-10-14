# Meal Planner Core (slice A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `meal_planner` library: catalog and request types, a
solver-neutral integer model, a CP-SAT backend, and `plan(request) -> Plan`
in STRICT mode with violation and conflict reports.

**Architecture:** Frozen dataclasses (`domain.py`, `request.py`) validate
input and derive recipe totals and tags. `builder.py` turns a `PlanRequest`
into an `ir.Model` (integers only, no solver imports). `backends/cpsat.py`
is the only OR-Tools importer. `planner.py` solves, minimizes the
infeasibility core, and decodes values into a `Plan` (`result.py`).

**Tech Stack:** Python 3.11+, OR-Tools CP-SAT (`ortools>=9.12,<10`),
pytest 8+. Standard library `decimal` and `fractions` for exact arithmetic.

**Spec:** [`docs/superpowers/specs/2026-10-13-meal-planner-core-design.md`](../specs/2026-10-13-meal-planner-core-design.md),
which builds on decisions #1-#39 in
[`docs/superpowers/specs/2026-09-15-meal-optimizer-design.md`](../specs/2026-09-15-meal-optimizer-design.md).

**Prototype status:** Every code block below was run before the plan was
written: 84 new tests pass in under a second on Python 3.13 with
OR-Tools 9.15, and the existing 21 `lp_solver` tests still pass under
pytest. The reference-scale benchmark returned `FEASIBLE` (not proven
optimal) after 29.4 s.

## Global Constraints

- Library only (decision #12): no CLI, no persistence, no UI.
- New package `meal_planner/` beside `lp_solver/`; never import from or change `lp_solver/`.
- Tests live in `tests/meal_planner/` and run with pytest.
- `pyproject.toml` declares `ortools` (runtime) and `pytest` (dev). No other third-party dependency.
- `backends/cpsat.py` is the only module that imports OR-Tools. `ir.py` has no solver imports.
- All domain, request and result types are frozen dataclasses validated at construction.
- Invalid input raises `PlanRequestError` (a `ValueError`) listing every problem found. Infeasible and timeout are `Plan` statuses, not exceptions. The only other exception is `ModelTooLargeError`.
- Determinism (decision #25): CP-SAT with one worker, a fixed seed, and the request's `solve_time_limit` (default 30 s).
- Multipliers are held in thousandths. Defaults: `min_multiplier=0.5`, `max_multiplier=2.0` (soft cap), hard ceiling 3x the soft cap (decision #38).
- Out of scope, do not build: RELAX mode, variety and tag-count constraints, `external`/`consumed` slots, pantry, products, unit conversion, `accrues_on` behaviour other than "eaten".
- Commit messages follow `CLAUDE.md`: every decision number gets a short description on first mention, e.g. "decision #17 (normalized weights)".

## Interpretations made in this plan

The spec leaves these open. The plan picks one answer each; change them
before execution if they are wrong.

1. An ingredient that leaves out an attribute counts as 0 for it. Naming an undeclared attribute is an error.
2. The "zero bound needs `normalization_reference`" check only applies where a penalty divides by the bound: soft constraints, and `average_per_day` constraints with a guard-rail (hard or not).
3. The day floor (decision #20) is a guarded hard constraint, so it can appear in a conflict report as `min_meals_per_day`.
4. `aggregate` has no default: a horizon constraint must set it, a day constraint must leave it `None`.
5. The spec says the hard ceiling and serving-cap weight are overridable without naming fields. They are `Recipe.hard_max_multiplier` (default `3 * max_multiplier`) and `Recipe.serving_cap_weight` (default 1.0).
6. For `average_per_day`, `normalization_reference` is a per-day figure, multiplied by the number of days like the bounds.
7. The violation report lists soft constraints, guard-rails (named `"<name> (day guard-rail)"`) and serving-cap overages (named `"serving cap: <recipe>"`). Hard constraints never appear, since they always hold.
8. `PlanRequestError` lives in `domain.py` and `ModelTooLargeError` in `builder.py`, so the spec's module dependencies stay as drawn.
9. Penalty coefficients are rounded once after multiplying by `OBJECTIVE_SCALE = 10**12`. A positive weight never rounds to zero. `Plan.objective_value` is therefore accurate to about six significant digits.
10. Core minimization re-solves once per core member, each with the full time limit. A re-solve that times out keeps the member.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `pyproject.toml` | Dependencies, pytest config (`pythonpath`, importlib mode, `benchmark` marker) | 1 |
| `meal_planner/__init__.py` | Public exports, grown task by task | 1-7 |
| `meal_planner/scaling.py` | Real number to integer and back, int64 check | 1 |
| `meal_planner/domain.py` | `AttributeDef`, `TagDef`, `Ingredient`, `IngredientAmount`, `Recipe`, `PlanRequestError` | 2 |
| `meal_planner/request.py` | `Slot`, `Day`, `Constraint`, `PlanRequest` and cross-checks | 3 |
| `meal_planner/ir.py` | `Var`, `LinExpr`, `LinConstraint`, `Guard`, `Model` | 4 |
| `meal_planner/backends/cpsat.py` | `solve()` and `SolveOutcome` | 5 |
| `meal_planner/builder.py` | `build()`, `penalty_coefficient()`, `ModelTooLargeError` | 6 |
| `meal_planner/result.py` | `SolveStatus`, `SlotAssignment`, `Violation(Report)`, `Conflict(Member/Report)`, `Plan` | 7 |
| `meal_planner/planner.py` | `plan()`, `minimize_core()`, decoding and violation report | 7 |
| `tests/meal_planner/test_*.py` | One test file per layer, matching the spec's test table | 1-8 |
| `tests/meal_planner/scenarios.py`, `conftest.py` | Seeded random requests shared by property tests and the benchmark | 8 |

## Units cheat sheet (read before Tasks 6-7)

- Attribute with precision `p`: a recipe's 1x total is held as `to_int(total, p)`.
- A multiplier is held in ticks: thousandths, so 1.5x is 1500 ticks.
- Continuous recipe: the `amount` variable counts ticks (`ticks_per_amount = 1`). Discrete recipe with step 0.5: `amount` counts steps (`ticks_per_amount = 500`).
- Slot, day and horizon totals in the model are therefore at scale `10**(p + 3)`. Bounds are scaled the same way: kcal (p=0) min 1800 becomes `1_800_000`.
- A soft miss of `slack` units costs `weight * slack / (10**(p+3) * reference)`, times `OBJECTIVE_SCALE`, rounded: see `penalty_coefficient`.

---

### Task 1: Project setup and scaling

**Files:**
- Create: `pyproject.toml`
- Create: `meal_planner/__init__.py`
- Create: `meal_planner/scaling.py`
- Test: `tests/meal_planner/test_scaling.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `to_decimal(value) -> Decimal`, `to_int(value, precision: int) -> int`, `from_int(units: int, precision: int) -> Decimal`, `fits_int64(value: int) -> bool`, constants `MULTIPLIER_PRECISION = 3`, `INT64_MAX`.

- [ ] **Step 1: Install dependencies**

Run: `python3 -m pip install 'ortools>=9.12,<10' 'pytest>=8'`
Expected: both install. (`python3 -c "import ortools; print(ortools.__version__)"` prints 9.12 or later.)

- [ ] **Step 2: Create `pyproject.toml`**

```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "meal-planner"
version = "0.1.0"
description = "Optimization-based meal planner (library only)"
requires-python = ">=3.11"
dependencies = ["ortools>=9.12,<10"]

[project.optional-dependencies]
dev = ["pytest>=8"]

[tool.setuptools.packages.find]
include = ["meal_planner*"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
addopts = "--import-mode=importlib -m 'not benchmark'"
markers = ["benchmark: slow reference-scale run (decision #24); opt in with -m benchmark"]
```

`pythonpath = ["."]` makes `meal_planner` importable without installing it. `--import-mode=importlib` avoids clashes between test files with the same base name in different folders. The benchmark is skipped unless asked for.

- [ ] **Step 3: Check the existing tests still run under pytest**

Run: `python3 -m pytest -q`
Expected: `21 passed` (the `lp_solver` unittest suite).

- [ ] **Step 4: Write the failing test** in `tests/meal_planner/test_scaling.py`

```python
from decimal import Decimal

from meal_planner.scaling import INT64_MAX, fits_int64, from_int, to_decimal, to_int


def test_to_int_scales_by_precision():
    assert to_int(1.5, 3) == 1500
    assert to_int(2, 0) == 2
    assert to_int("0.125", 3) == 125


def test_float_is_read_as_its_decimal_text():
    assert to_int(0.1, 1) == 1
    assert to_decimal(0.1) == Decimal("0.1")


def test_round_trip_within_precision_is_exact():
    for text in ("0", "1", "12.345", "-7.5", "1000000.001"):
        assert from_int(to_int(text, 3), 3) == Decimal(text)


def test_digits_beyond_precision_round_once_half_up():
    assert to_int("1.2345", 3) == 1235
    assert to_int("1.2344", 3) == 1234
    assert to_int("-1.2345", 3) == -1235
    assert from_int(to_int("1.2345", 3), 3) == Decimal("1.235")


def test_overflow_guard():
    assert fits_int64(INT64_MAX)
    assert fits_int64(-INT64_MAX)
    assert not fits_int64(INT64_MAX + 1)
```

- [ ] **Step 5: Run it to verify it fails**

Run: `python3 -m pytest tests/meal_planner/test_scaling.py -q`
Expected: collection error, `ModuleNotFoundError: No module named 'meal_planner'`.

- [ ] **Step 6: Implement.** Create `meal_planner/__init__.py` with only the docstring for now:

```python
"""Meal planner core (slice A): data model, model builder, CP-SAT solve."""
```

and `meal_planner/scaling.py`:

```python
"""Fixed-precision conversion between real numbers and integers (decision #15).

CP-SAT only works over integers, so every real quantity is held as an
integer count of 10**-precision units. Conversion goes through Decimal so
that a value such as 0.1 is read as exactly one tenth, not as its binary
float approximation.
"""

from decimal import ROUND_HALF_UP, Decimal

MULTIPLIER_PRECISION = 3
"""Serving multipliers are held in thousandths (decision #38)."""

INT64_MAX = 2**63 - 1


def to_decimal(value) -> Decimal:
    """Read an int, float, str or Decimal as an exact Decimal."""
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def to_int(value, precision: int) -> int:
    """Scale ``value`` to an integer count of 10**-precision units.

    Digits beyond ``precision`` are rounded once, half away from zero.
    """
    scaled = to_decimal(value).scaleb(precision)
    return int(scaled.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def from_int(units: int, precision: int) -> Decimal:
    """Inverse of :func:`to_int`: an exact Decimal."""
    return Decimal(units).scaleb(-precision)


def fits_int64(value: int) -> bool:
    return -INT64_MAX <= value <= INT64_MAX
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `python3 -m pytest tests/meal_planner/test_scaling.py -q`
Expected: `5 passed`.

- [ ] **Step 8: Commit**

```bash
git add pyproject.toml meal_planner/__init__.py meal_planner/scaling.py tests/meal_planner/test_scaling.py
git commit -m "meal_planner: project setup and fixed-precision scaling

Integer scaling per decision #15 (CP-SAT backend with integer-scaled
quantities)."
```

---

### Task 2: Domain types

**Files:**
- Create: `meal_planner/domain.py`
- Modify: `meal_planner/__init__.py`
- Test: `tests/meal_planner/test_domain.py`

**Interfaces:**
- Consumes: `to_decimal` from `scaling`.
- Produces:
  - `PlanRequestError(ValueError)` with `.problems: tuple[str, ...]`; `raise_if(problems: list[str]) -> None`.
  - `AttributeDef(name, precision=3, accrues_on=None)`; precision must be 0..6; `accrues_on` resolves to `"purchase"` for `cost`, else `"eaten"`.
  - `TagDef(name, derive)`, `derive` in `("all", "any")`.
  - `Ingredient(name, unit, attributes: Mapping[str, float] = {}, tags: frozenset[str] = frozenset())`.
  - `IngredientAmount(ingredient, quantity)`, quantity > 0.
  - `Recipe(name, items, extra_tags=frozenset(), multiplier_step=None, min_multiplier=0.5, max_multiplier=2.0, hard_max_multiplier=None, serving_cap_weight=1.0)` with methods `ingredients()`, `attribute_total(attribute) -> Decimal` (exact, unrounded), `tags(tag_defs: Mapping[str, TagDef]) -> frozenset[str]`.

- [ ] **Step 1: Write the failing test** in `tests/meal_planner/test_domain.py`

```python
from decimal import Decimal

import pytest

from meal_planner import AttributeDef, Ingredient, IngredientAmount, PlanRequestError, Recipe, TagDef

VEGAN = TagDef("vegan", "all")
NUTS = TagDef("contains-nuts", "any")
TAGS = {"vegan": VEGAN, "contains-nuts": NUTS}

basil = Ingredient("basil", "g", {"kcal": 0.2, "cost": 0.1}, {"vegan"})
pine_nuts = Ingredient("pine nuts", "g", {"kcal": 6.7}, {"vegan", "contains-nuts"})
cheese = Ingredient("parmesan", "g", {"kcal": 4.3, "cost": 0.25})


def test_attribute_defaults():
    assert AttributeDef("protein").precision == 3
    assert AttributeDef("protein").accrues_on == "eaten"
    assert AttributeDef("cost").accrues_on == "purchase"


def test_recipe_attribute_total_is_exact_sum():
    pesto = Recipe("pesto", [IngredientAmount(basil, 30), IngredientAmount(cheese, 20)])
    assert pesto.attribute_total("kcal") == Decimal("92.0")  # 30*0.2 + 20*4.3
    assert pesto.attribute_total("cost") == Decimal("8.0")


def test_missing_ingredient_attribute_counts_as_zero():
    nuts_only = Recipe("nuts", [IngredientAmount(pine_nuts, 10)])
    assert nuts_only.attribute_total("cost") == 0


def test_all_tag_needs_every_ingredient():
    vegan_pesto = Recipe("vegan pesto", [IngredientAmount(basil, 30), IngredientAmount(pine_nuts, 20)])
    pesto = Recipe("pesto", [IngredientAmount(basil, 30), IngredientAmount(cheese, 20)])
    assert "vegan" in vegan_pesto.tags(TAGS)
    assert "vegan" not in pesto.tags(TAGS)


def test_any_tag_needs_one_ingredient():
    vegan_pesto = Recipe("vegan pesto", [IngredientAmount(basil, 30), IngredientAmount(pine_nuts, 20)])
    assert "contains-nuts" in vegan_pesto.tags(TAGS)
    assert "contains-nuts" not in Recipe("b", [IngredientAmount(basil, 1)]).tags(TAGS)


def test_extra_tags_are_added():
    pesto = Recipe("pesto", [IngredientAmount(basil, 30)], extra_tags={"italian"})
    assert pesto.tags(TAGS) == {"vegan", "italian"}


def test_multiplier_defaults():
    r = Recipe("b", [IngredientAmount(basil, 1)])
    assert (r.min_multiplier, r.max_multiplier, r.hard_max_multiplier) == (0.5, 2.0, Decimal("6.0"))
    assert r.multiplier_step is None


@pytest.mark.parametrize(
    "kwargs, message",
    [
        ({"items": []}, "has no ingredients"),
        ({"min_multiplier": 3}, "multipliers must satisfy"),
        ({"hard_max_multiplier": 1.5}, "multipliers must satisfy"),
        ({"multiplier_step": 0.4}, "not a multiple of step"),
        ({"multiplier_step": 0}, "multiplier_step must be positive"),
        ({"serving_cap_weight": -1}, "serving_cap_weight is negative"),
    ],
)
def test_recipe_validation(kwargs, message):
    args = {"name": "r", "items": [IngredientAmount(basil, 1)], **kwargs}
    with pytest.raises(PlanRequestError, match=message):
        Recipe(**args)


def test_recipe_collects_every_problem():
    with pytest.raises(PlanRequestError) as err:
        Recipe("r", [], min_multiplier=3)
    assert len(err.value.problems) == 2


@pytest.mark.parametrize(
    "make, message",
    [
        (lambda: AttributeDef("x", precision=9), "precision 9 outside"),
        (lambda: AttributeDef("x", accrues_on="later"), "accrues_on"),
        (lambda: TagDef("x", "some"), "derive must be one of"),
        (lambda: IngredientAmount(basil, 0), "must be positive"),
    ],
)
def test_other_validation(make, message):
    with pytest.raises(PlanRequestError, match=message):
        make()


def test_plan_request_error_is_a_value_error():
    assert issubclass(PlanRequestError, ValueError)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python3 -m pytest tests/meal_planner/test_domain.py -q`
Expected: `ImportError: cannot import name 'AttributeDef' from 'meal_planner'`.

- [ ] **Step 3: Implement** `meal_planner/domain.py`

```python
"""Catalog types: attributes, tags, ingredients and recipes.

Recipe attribute totals and tags are derived from ingredients (decisions
#22 and #37), never entered by hand.
"""

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Mapping

from .scaling import to_decimal

ACCRUES_ON = ("eaten", "purchase")
DERIVE_RULES = ("all", "any")
MIN_PRECISION = 0
MAX_PRECISION = 6


class PlanRequestError(ValueError):
    """Invalid input. ``problems`` lists every problem found, not just the first."""

    def __init__(self, problems):
        self.problems = tuple(problems)
        super().__init__("; ".join(self.problems))


def raise_if(problems) -> None:
    if problems:
        raise PlanRequestError(problems)


@dataclass(frozen=True)
class AttributeDef:
    """A user-defined tracked quantity (decision #7)."""

    name: str
    precision: int = 3
    accrues_on: str | None = None  # None: "purchase" for cost, else "eaten" (#28)

    def __post_init__(self):
        if self.accrues_on is None:
            object.__setattr__(
                self, "accrues_on", "purchase" if self.name == "cost" else "eaten"
            )
        problems = []
        if not self.name:
            problems.append("attribute name must not be empty")
        if not MIN_PRECISION <= self.precision <= MAX_PRECISION:
            problems.append(
                f"attribute {self.name!r}: precision {self.precision} outside "
                f"{MIN_PRECISION}..{MAX_PRECISION}"
            )
        if self.accrues_on not in ACCRUES_ON:
            problems.append(
                f"attribute {self.name!r}: accrues_on must be one of {ACCRUES_ON}"
            )
        raise_if(problems)


@dataclass(frozen=True)
class TagDef:
    """A yes/no label and how a recipe derives it from ingredients (decision #37)."""

    name: str
    derive: str

    def __post_init__(self):
        problems = []
        if not self.name:
            problems.append("tag name must not be empty")
        if self.derive not in DERIVE_RULES:
            problems.append(f"tag {self.name!r}: derive must be one of {DERIVE_RULES}")
        raise_if(problems)


@dataclass(frozen=True)
class Ingredient:
    """``attributes`` are per-unit values; an attribute left out counts as 0."""

    name: str
    unit: str
    attributes: Mapping[str, float] = field(default_factory=dict)
    tags: frozenset[str] = frozenset()

    def __post_init__(self):
        object.__setattr__(self, "tags", frozenset(self.tags))
        problems = []
        if not self.name:
            problems.append("ingredient name must not be empty")
        raise_if(problems)


@dataclass(frozen=True)
class IngredientAmount:
    """A quantity of an ingredient, in the ingredient's own unit."""

    ingredient: Ingredient
    quantity: float

    def __post_init__(self):
        if to_decimal(self.quantity) <= 0:
            raise PlanRequestError(
                [f"amount of {self.ingredient.name!r} must be positive"]
            )


@dataclass(frozen=True)
class Recipe:
    """A fixed list of ingredient amounts at 1x, scaled by a serving multiplier.

    ``multiplier_step=None`` means continuous (thousandths); otherwise the
    multiplier is a whole number of steps. ``max_multiplier`` is the soft
    serving cap (#16, #22); ``hard_max_multiplier`` defaults to 3x it (#38).
    """

    name: str
    items: tuple[IngredientAmount, ...]
    extra_tags: frozenset[str] = frozenset()
    multiplier_step: float | None = None
    min_multiplier: float = 0.5
    max_multiplier: float = 2.0
    hard_max_multiplier: float | None = None
    serving_cap_weight: float = 1.0

    def __post_init__(self):
        object.__setattr__(self, "items", tuple(self.items))
        object.__setattr__(self, "extra_tags", frozenset(self.extra_tags))
        if self.hard_max_multiplier is None:
            object.__setattr__(
                self, "hard_max_multiplier", 3 * to_decimal(self.max_multiplier)
            )
        problems = []
        if not self.name:
            problems.append("recipe name must not be empty")
        if not self.items:
            problems.append(f"recipe {self.name!r} has no ingredients")
        low = to_decimal(self.min_multiplier)
        soft = to_decimal(self.max_multiplier)
        hard = to_decimal(self.hard_max_multiplier)
        if not 0 < low <= soft <= hard:
            problems.append(
                f"recipe {self.name!r}: multipliers must satisfy "
                f"0 < min ({low}) <= max ({soft}) <= hard max ({hard})"
            )
        if self.multiplier_step is not None:
            step = to_decimal(self.multiplier_step)
            if step <= 0:
                problems.append(f"recipe {self.name!r}: multiplier_step must be positive")
            elif low % step != 0:
                problems.append(
                    f"recipe {self.name!r}: min multiplier {low} is not a "
                    f"multiple of step {step}"
                )
        if to_decimal(self.serving_cap_weight) < 0:
            problems.append(f"recipe {self.name!r}: serving_cap_weight is negative")
        raise_if(problems)

    def ingredients(self) -> tuple[Ingredient, ...]:
        return tuple(item.ingredient for item in self.items)

    def attribute_total(self, attribute: str) -> Decimal:
        """Exact sum of quantity times per-unit value at 1x."""
        return sum(
            (
                to_decimal(item.quantity)
                * to_decimal(item.ingredient.attributes.get(attribute, 0))
                for item in self.items
            ),
            Decimal(0),
        )

    def tags(self, tag_defs: Mapping[str, TagDef]) -> frozenset[str]:
        """Tags derived from ingredients per each tag's rule, plus ``extra_tags``."""
        derived = set()
        for tag in tag_defs.values():
            has = [tag.name in ing.tags for ing in self.ingredients()]
            if (tag.derive == "all" and all(has)) or (tag.derive == "any" and any(has)):
                derived.add(tag.name)
        return frozenset(derived) | self.extra_tags
```

Append to `meal_planner/__init__.py`:

```python
from .domain import AttributeDef, Ingredient, IngredientAmount, PlanRequestError, Recipe, TagDef
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m pytest tests/meal_planner -q`
Expected: `24 passed`.

- [ ] **Step 5: Commit**

```bash
git add meal_planner/domain.py meal_planner/__init__.py tests/meal_planner/test_domain.py
git commit -m "meal_planner: attributes, tags, ingredients and recipes

Recipe totals derive from ingredients (decision #22, recipes as the meal
unit); tags derive by all/any rules (decision #37, ingredient tags);
multiplier defaults per decision #38 (multiplier bounds)."
```

---

### Task 3: Request types and validation

**Files:**
- Create: `meal_planner/request.py`
- Modify: `meal_planner/__init__.py`
- Test: `tests/meal_planner/test_request.py`

**Interfaces:**
- Consumes: everything in `domain`; `to_decimal`.
- Produces:
  - `Slot(kind="generated")`, kind in `("generated", "absent")`.
  - `Day(slots, min_meals_per_day=None)` with `generated_count() -> int` and `meal_floor() -> int` (None means all generated slots).
  - `Constraint(name, attribute, scope="day", aggregate=None, min=None, max=None, hard=False, weight=1.0, weight_below=None, weight_above=None, normalization_reference=None, add_day_guardrail=True, guardrail_weight=None, relaxable=True)` with `has_guardrail() -> bool`, `needs_reference() -> bool`, `side_weight(side) -> Decimal`, `guardrail_side_weight(side) -> Decimal`. `side` is `"below"` or `"above"`.
  - `PlanRequest(attributes, tags, recipes, days, constraints=(), exclude_tags=frozenset(), require_tags=frozenset(), solve_time_limit=30.0)` with `tag_defs()`, `attribute_defs()`, `eligible_recipes() -> tuple[Recipe, ...]` (catalog order kept).

- [ ] **Step 1: Write the failing test** in `tests/meal_planner/test_request.py`

```python
from decimal import Decimal

import pytest

from meal_planner import (
    AttributeDef, Constraint, Day, Ingredient, IngredientAmount, PlanRequest,
    PlanRequestError, Recipe, Slot, TagDef,
)

KCAL = AttributeDef("kcal", precision=0)
VEGAN = TagDef("vegan", "all")
NUTS = TagDef("contains-nuts", "any")
basil = Ingredient("basil", "g", {"kcal": 0.2}, {"vegan"})
pine_nuts = Ingredient("pine nuts", "g", {"kcal": 6.7}, {"vegan", "contains-nuts"})
cheese = Ingredient("parmesan", "g", {"kcal": 4.3})
salad = Recipe("salad", [IngredientAmount(basil, 100)])
vegan_pesto = Recipe("vegan pesto", [IngredientAmount(basil, 30), IngredientAmount(pine_nuts, 20)])
pesto = Recipe("pesto", [IngredientAmount(basil, 30), IngredientAmount(cheese, 20)])
ONE_DAY = [Day([Slot()])]


def make(**kwargs):
    args = dict(attributes=[KCAL], tags=[VEGAN, NUTS], recipes=[salad, vegan_pesto, pesto],
                days=ONE_DAY)
    args.update(kwargs)
    return PlanRequest(**args)


def test_valid_request_builds():
    request = make(constraints=[Constraint("energy", "kcal", min=1800, max=2200)])
    assert request.solve_time_limit == 30.0
    assert len(request.eligible_recipes()) == 3


def test_exclude_tags_removes_recipes_with_any_excluded_tag():
    names = [r.name for r in make(exclude_tags={"contains-nuts"}).eligible_recipes()]
    assert names == ["salad", "pesto"]


def test_require_tags_keeps_recipes_with_every_required_tag():
    names = [r.name for r in make(require_tags={"vegan"}).eligible_recipes()]
    assert names == ["salad", "vegan pesto"]


def test_no_recipe_left_after_filters():
    with pytest.raises(PlanRequestError, match="no recipes left"):
        make(require_tags={"vegan"}, exclude_tags={"vegan"})


def test_cross_reference_problems_are_collected_together():
    stray = Ingredient("stray", "g", {"sugar": 1}, {"keto"})
    with pytest.raises(PlanRequestError) as err:
        make(
            attributes=[KCAL, KCAL],
            recipes=[salad, salad, Recipe("odd", [IngredientAmount(stray, 1)], extra_tags={"x"})],
            constraints=[Constraint("c", "fat", max=1), Constraint("c", "kcal", max=1)],
            exclude_tags={"nope"},
        )
    problems = err.value.problems
    assert "duplicate attribute name 'kcal'" in problems
    assert "duplicate recipe name 'salad'" in problems
    assert "duplicate constraint name 'c'" in problems
    assert "ingredient 'stray': unknown attribute 'sugar'" in problems
    assert "ingredient 'stray': unknown tag 'keto'" in problems
    assert "recipe 'odd': unknown tag 'x'" in problems
    assert "constraint 'c': unknown attribute 'fat'" in problems
    assert "unknown tag 'nope' in exclude_tags/require_tags" in problems


def test_two_ingredients_with_one_name():
    other_basil = Ingredient("basil", "bunch", {"kcal": 5})
    with pytest.raises(PlanRequestError, match="two different ingredients named 'basil'"):
        make(recipes=[salad, Recipe("r", [IngredientAmount(other_basil, 1)])])


def test_day_meal_floor_defaults_to_all_generated_slots():
    day = Day([Slot(), Slot("absent"), Slot()])
    assert day.meal_floor() == 2
    assert Day([Slot(), Slot()], min_meals_per_day=0).meal_floor() == 0


def test_day_meal_floor_cannot_exceed_generated_slots():
    with pytest.raises(PlanRequestError, match="min_meals_per_day 2 not within 0..1"):
        Day([Slot(), Slot("absent")], min_meals_per_day=2)


def test_unsupported_slot_kind():
    with pytest.raises(PlanRequestError, match="slot kind 'external' not supported"):
        Slot("external")


@pytest.mark.parametrize(
    "kwargs, message",
    [
        ({}, "needs min, max or both"),
        ({"min": 5, "max": 4}, "min 5 greater than max 4"),
        ({"max": 4, "weight": -1}, "weight is negative"),
        ({"max": 4, "weight_above": -1}, "weight_above is negative"),
        ({"max": 4, "scope": "week"}, "scope must be one of"),
        ({"max": 4, "aggregate": "total"}, "aggregate applies to horizon scope only"),
        ({"max": 4, "scope": "horizon"}, "horizon scope needs aggregate"),
        ({"max": 0}, "a zero bound needs normalization_reference"),
        ({"max": 4, "normalization_reference": 0}, "normalization_reference must be positive"),
    ],
)
def test_constraint_validation(kwargs, message):
    with pytest.raises(PlanRequestError, match=message):
        Constraint("c", "kcal", **kwargs)


def test_zero_bound_is_fine_when_no_penalty_uses_it():
    Constraint("c", "kcal", max=0, hard=True)
    Constraint("c", "kcal", max=0, normalization_reference=10)


def test_hard_average_with_guardrail_still_needs_a_reference_for_zero():
    with pytest.raises(PlanRequestError, match="zero bound"):
        Constraint("c", "kcal", scope="horizon", aggregate="average_per_day", max=0, hard=True)


def test_side_and_guardrail_weights():
    c = Constraint("c", "kcal", scope="horizon", aggregate="average_per_day",
                   min=1, max=2, weight=4, weight_above=6)
    assert (c.side_weight("below"), c.side_weight("above")) == (4, 6)
    assert (c.guardrail_side_weight("below"), c.guardrail_side_weight("above")) == (2, 3)
    explicit = Constraint("c", "kcal", scope="horizon", aggregate="average_per_day",
                          min=1, guardrail_weight=0.25)
    assert explicit.guardrail_side_weight("below") == Decimal("0.25")
    assert explicit.has_guardrail()
    assert not Constraint("c", "kcal", scope="horizon", aggregate="total", min=1).has_guardrail()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python3 -m pytest tests/meal_planner/test_request.py -q`
Expected: `ImportError: cannot import name 'Constraint' from 'meal_planner'`.

- [ ] **Step 3: Implement** `meal_planner/request.py`

```python
"""The planning request: days and slots, constraints, and cross-checks."""

from dataclasses import dataclass

from .domain import AttributeDef, PlanRequestError, Recipe, TagDef, raise_if
from .scaling import to_decimal

SLOT_KINDS = ("generated", "absent")
SCOPES = ("day", "horizon")
AGGREGATES = ("total", "average_per_day")


@dataclass(frozen=True)
class Slot:
    kind: str = "generated"

    def __post_init__(self):
        if self.kind not in SLOT_KINDS:
            raise PlanRequestError(
                [f"slot kind {self.kind!r} not supported; use one of {SLOT_KINDS}"]
            )


@dataclass(frozen=True)
class Day:
    """``min_meals_per_day=None`` means every generated slot is served (#20)."""

    slots: tuple[Slot, ...]
    min_meals_per_day: int | None = None

    def __post_init__(self):
        object.__setattr__(self, "slots", tuple(self.slots))
        problems = []
        generated = self.generated_count()
        if self.min_meals_per_day is not None and not (
            0 <= self.min_meals_per_day <= generated
        ):
            problems.append(
                f"min_meals_per_day {self.min_meals_per_day} not within "
                f"0..{generated} generated slots"
            )
        raise_if(problems)

    def generated_count(self) -> int:
        return sum(1 for slot in self.slots if slot.kind == "generated")

    def meal_floor(self) -> int:
        if self.min_meals_per_day is None:
            return self.generated_count()
        return self.min_meals_per_day


@dataclass(frozen=True)
class Constraint:
    """A bound on an attribute total, per day or over the horizon.

    ``aggregate`` is required for horizon scope and must be None for day
    scope (#39). Weights are ignored for hard constraints. The guard-rail
    (#18) applies only to ``average_per_day`` and defaults to half weight.
    """

    name: str
    attribute: str
    scope: str = "day"
    aggregate: str | None = None
    min: float | None = None
    max: float | None = None
    hard: bool = False
    weight: float = 1.0
    weight_below: float | None = None
    weight_above: float | None = None
    normalization_reference: float | None = None
    add_day_guardrail: bool = True
    guardrail_weight: float | None = None
    relaxable: bool = True  # stored for RELAX mode (#14), unused in this slice

    def __post_init__(self):
        p = []
        label = f"constraint {self.name!r}"
        if not self.name:
            p.append("constraint name must not be empty")
        if self.scope not in SCOPES:
            p.append(f"{label}: scope must be one of {SCOPES}")
        if self.scope == "day" and self.aggregate is not None:
            p.append(f"{label}: aggregate applies to horizon scope only")
        if self.scope == "horizon" and self.aggregate not in AGGREGATES:
            p.append(f"{label}: horizon scope needs aggregate in {AGGREGATES}")
        if self.min is None and self.max is None:
            p.append(f"{label}: needs min, max or both")
        if (
            self.min is not None
            and self.max is not None
            and to_decimal(self.min) > to_decimal(self.max)
        ):
            p.append(f"{label}: min {self.min} greater than max {self.max}")
        for field_name in ("weight", "weight_below", "weight_above", "guardrail_weight"):
            value = getattr(self, field_name)
            if value is not None and to_decimal(value) < 0:
                p.append(f"{label}: {field_name} is negative")
        if self.normalization_reference is not None and (
            to_decimal(self.normalization_reference) <= 0
        ):
            p.append(f"{label}: normalization_reference must be positive")
        if self.needs_reference() and self.normalization_reference is None:
            for bound in (self.min, self.max):
                if bound is not None and to_decimal(bound) == 0:
                    p.append(
                        f"{label}: a zero bound needs normalization_reference (#17)"
                    )
                    break
        raise_if(p)

    def has_guardrail(self) -> bool:
        return self.aggregate == "average_per_day" and self.add_day_guardrail

    def needs_reference(self) -> bool:
        """True if any soft penalty is built from this constraint's bounds."""
        return not self.hard or self.has_guardrail()

    def side_weight(self, side: str):
        override = self.weight_below if side == "below" else self.weight_above
        return to_decimal(self.weight if override is None else override)

    def guardrail_side_weight(self, side: str):
        if self.guardrail_weight is not None:
            return to_decimal(self.guardrail_weight)
        return self.side_weight(side) / 2


@dataclass(frozen=True)
class PlanRequest:
    attributes: tuple[AttributeDef, ...]
    tags: tuple[TagDef, ...]
    recipes: tuple[Recipe, ...]
    days: tuple[Day, ...]
    constraints: tuple[Constraint, ...] = ()
    exclude_tags: frozenset[str] = frozenset()
    require_tags: frozenset[str] = frozenset()
    solve_time_limit: float = 30.0

    def __post_init__(self):
        for name in ("attributes", "tags", "recipes", "days", "constraints"):
            object.__setattr__(self, name, tuple(getattr(self, name)))
        for name in ("exclude_tags", "require_tags"):
            object.__setattr__(self, name, frozenset(getattr(self, name)))
        raise_if(self._problems())

    def _problems(self) -> list[str]:
        p = []
        p += _duplicates("attribute", [a.name for a in self.attributes])
        p += _duplicates("tag", [t.name for t in self.tags])
        p += _duplicates("recipe", [r.name for r in self.recipes])
        p += _duplicates("constraint", [c.name for c in self.constraints])
        ingredients = {}
        for recipe in self.recipes:
            for ing in recipe.ingredients():
                if ingredients.setdefault(ing.name, ing) != ing:
                    p.append(f"two different ingredients named {ing.name!r}")
                    ingredients[ing.name] = ing
        attribute_names = {a.name for a in self.attributes}
        tag_names = {t.name for t in self.tags}
        for ing in ingredients.values():
            for attr in sorted(set(ing.attributes) - attribute_names):
                p.append(f"ingredient {ing.name!r}: unknown attribute {attr!r}")
            for tag in sorted(ing.tags - tag_names):
                p.append(f"ingredient {ing.name!r}: unknown tag {tag!r}")
        for recipe in self.recipes:
            for tag in sorted(recipe.extra_tags - tag_names):
                p.append(f"recipe {recipe.name!r}: unknown tag {tag!r}")
        for c in self.constraints:
            if c.attribute not in attribute_names:
                p.append(f"constraint {c.name!r}: unknown attribute {c.attribute!r}")
        for tag in sorted((self.exclude_tags | self.require_tags) - tag_names):
            p.append(f"unknown tag {tag!r} in exclude_tags/require_tags")
        if not self.days:
            p.append("the plan needs at least one day")
        if self.solve_time_limit <= 0:
            p.append("solve_time_limit must be positive")
        if not p and not self.eligible_recipes():
            p.append("no recipes left after exclude_tags and require_tags")
        return p

    def tag_defs(self) -> dict[str, TagDef]:
        return {t.name: t for t in self.tags}

    def attribute_defs(self) -> dict[str, AttributeDef]:
        return {a.name: a for a in self.attributes}

    def eligible_recipes(self) -> tuple[Recipe, ...]:
        """Recipes with no excluded tag and every required tag (#37)."""
        defs = self.tag_defs()
        kept = []
        for recipe in self.recipes:
            tags = recipe.tags(defs)
            if tags & self.exclude_tags or not self.require_tags <= tags:
                continue
            kept.append(recipe)
        return tuple(kept)


def _duplicates(kind: str, names: list[str]) -> list[str]:
    seen, dupes = set(), []
    for name in names:
        if name in seen and name not in dupes:
            dupes.append(name)
        seen.add(name)
    return [f"duplicate {kind} name {name!r}" for name in dupes]
```

Append to `meal_planner/__init__.py`:

```python
from .request import Constraint, Day, PlanRequest, Slot
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m pytest tests/meal_planner -q`
Expected: `45 passed`.

- [ ] **Step 5: Commit**

```bash
git add meal_planner/request.py meal_planner/__init__.py tests/meal_planner/test_request.py
git commit -m "meal_planner: days, slots, constraints and request validation

Generated and absent slots (decision #19, per-day slot kinds), the day
meal floor (decision #20), min/max ranges (decision #21) and horizon
aggregate (decision #39, total or average per day). All problems are
collected into one PlanRequestError."
```

---

### Task 4: Solver-neutral model (IR)

**Files:**
- Create: `meal_planner/ir.py`
- Test: `tests/meal_planner/test_ir.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Var(index, name, lb, ub)` (frozen).
  - `LinExpr(terms: dict[int, int] = {}, constant: int = 0)`; `add(var, coef) -> self`, `add_expr(other, factor=1) -> self`, `copy()`. Terms are keyed by `Var.index`; zero coefficients are dropped.
  - `LinConstraint(expr, lb, ub, enforced_by: Var | None)`.
  - `Guard(switch: Var, constraint: str, day: int | None)`.
  - `Model` with lists `variables`, `constraints`, `guards`, a minimized `objective: LinExpr`, and `new_var(name, lb, ub)`, `new_bool(name)`, `add(expr, lb=None, ub=None, enforced_by=None)`, `add_guard(constraint, day) -> Var`, `bounds(expr) -> (min, max)`, `magnitude(expr) -> int`.

- [ ] **Step 1: Write the failing test** in `tests/meal_planner/test_ir.py`

```python
import pytest

from meal_planner.ir import LinExpr, Model


def test_new_vars_are_indexed_in_order():
    m = Model()
    x = m.new_var("x", 0, 5)
    b = m.new_bool("b")
    assert (x.index, b.index) == (0, 1)
    assert (b.lb, b.ub) == (0, 1)


def test_new_var_rejects_empty_domain():
    with pytest.raises(ValueError):
        Model().new_var("x", 3, 2)


def test_lin_expr_merges_and_cancels_terms():
    m = Model()
    x, y = m.new_var("x", 0, 5), m.new_var("y", 0, 5)
    e = LinExpr().add(x, 2).add(y, 3).add(x, -2)
    assert e.terms == {y.index: 3}
    e.add_expr(LinExpr({x.index: 1}, 4), factor=2)
    assert e.terms == {y.index: 3, x.index: 2}
    assert e.constant == 8


def test_bounds_and_magnitude():
    m = Model()
    x, y = m.new_var("x", -2, 5), m.new_var("y", 0, 3)
    e = LinExpr({x.index: 2, y.index: -1}, 1)
    assert m.bounds(e) == (-2 * 2 - 3 + 1, 2 * 5 + 1)
    assert m.magnitude(e) == 1 + 2 * 5 + 1 * 3


def test_guard_creates_a_named_switch():
    m = Model()
    switch = m.add_guard("energy", 3)
    assert m.guards[0].switch == switch
    assert (m.guards[0].constraint, m.guards[0].day) == ("energy", 3)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python3 -m pytest tests/meal_planner/test_ir.py -q`
Expected: `ModuleNotFoundError: No module named 'meal_planner.ir'`.

- [ ] **Step 3: Implement** `meal_planner/ir.py`

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m pytest tests/meal_planner/test_ir.py -q`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add meal_planner/ir.py tests/meal_planner/test_ir.py
git commit -m "meal_planner: solver-neutral integer model

Keeps the backend swappable per decision #15 (CP-SAT behind a swappable
interface). Guards are the per-constraint switches STRICT mode needs
(decision #14, infeasibility handling)."
```

---

### Task 5: CP-SAT backend

**Files:**
- Create: `meal_planner/backends/__init__.py` (empty)
- Create: `meal_planner/backends/cpsat.py`
- Test: `tests/meal_planner/test_backend.py`

**Interfaces:**
- Consumes: `Model`, `LinExpr` from `ir`.
- Produces: `SolveOutcome(status: str, values: tuple[int, ...] = (), objective: int | None = None, core: tuple[int, ...] = ())` and `solve(model, time_limit: float, assumed: Sequence[int] | None = None, optimize: bool = True) -> SolveOutcome`. `status` is `"OPTIMAL"`, `"FEASIBLE"`, `"INFEASIBLE"` or `"UNKNOWN"`. `assumed` holds indices into `model.guards` (None means all). `core` holds guard indices and is not necessarily minimal. `objective` is computed exactly from the integer values.

CP-SAT API notes (verified on OR-Tools 9.15): `cp.add_assumptions(literals)` forces literals true; after an `INFEASIBLE` result, `solver.sufficient_assumptions_for_infeasibility()` returns the variable indices of a subset of them. That subset can contain irrelevant members, which is why Task 7 minimizes it. `solver.parameters.num_workers = 1` and `random_seed` pin determinism.

- [ ] **Step 1: Write the failing test** in `tests/meal_planner/test_backend.py`

```python
from meal_planner.backends.cpsat import solve
from meal_planner.ir import LinExpr, Model


def test_minimizes_a_tiny_model():
    m = Model()
    x, y = m.new_var("x", 0, 10), m.new_var("y", 0, 10)
    m.add(LinExpr().add(x, 1).add(y, 1), lb=7)  # x + y >= 7
    m.add(LinExpr().add(x, 1), ub=3)  # x <= 3
    m.objective.add(x, 1).add(y, 2)  # cheapest: x=3, y=4
    out = solve(m, time_limit=5)
    assert out.status == "OPTIMAL"
    assert (out.values[x.index], out.values[y.index]) == (3, 4)
    assert out.objective == 11


def test_guarded_constraints_and_core():
    m = Model()
    x = m.new_var("x", 0, 10)
    low = m.add_guard("low", 0)
    high = m.add_guard("high", 0)
    m.add_guard("loose", None)
    m.add(LinExpr().add(x, 1), lb=8, enforced_by=low)
    m.add(LinExpr().add(x, 1), ub=3, enforced_by=high)
    out = solve(m, time_limit=5)
    assert out.status == "INFEASIBLE"
    assert {0, 1} <= set(out.core)  # may also hold the irrelevant guard 2


def test_unassumed_guards_switch_their_constraint_off():
    m = Model()
    x = m.new_var("x", 0, 10)
    low, high = m.add_guard("low", 0), m.add_guard("high", 0)
    m.add(LinExpr().add(x, 1), lb=8, enforced_by=low)
    m.add(LinExpr().add(x, 1), ub=3, enforced_by=high)
    m.objective.add(x, 1)
    out = solve(m, time_limit=5, assumed=[0])
    assert out.status == "OPTIMAL"
    assert out.values[x.index] == 8


def test_feasibility_only_skips_objective():
    m = Model()
    x = m.new_var("x", 0, 10)
    m.objective.add(x, 1)
    out = solve(m, time_limit=5, optimize=False)
    assert out.status in ("OPTIMAL", "FEASIBLE")
    assert out.objective is None
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python3 -m pytest tests/meal_planner/test_backend.py -q`
Expected: `ModuleNotFoundError: No module named 'meal_planner.backends'`.

- [ ] **Step 3: Implement.** Create an empty `meal_planner/backends/__init__.py`, then `meal_planner/backends/cpsat.py`:

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m pytest tests/meal_planner/test_backend.py -q`
Expected: `4 passed`.

- [ ] **Step 5: Check the import boundary**

Run: `grep -rn "ortools" meal_planner/`
Expected: matches only in `meal_planner/backends/cpsat.py`.

- [ ] **Step 6: Commit**

```bash
git add meal_planner/backends tests/meal_planner/test_backend.py
git commit -m "meal_planner: CP-SAT backend with assumptions and cores

Single worker and a fixed seed per decision #25 (deterministic solving);
time limit per decision #24 (solve budget and status)."
```

---

### Task 6: Model builder

**Files:**
- Create: `meal_planner/builder.py`
- Modify: `meal_planner/__init__.py`
- Test: `tests/meal_planner/test_builder.py`

**Interfaces:**
- Consumes: `PlanRequest`, `Constraint`, `Recipe`; `Model`, `LinExpr`, `Var`; `to_int`, `to_decimal`, `MULTIPLIER_PRECISION`.
- Produces:
  - `build(request) -> BuiltModel`.
  - `BuiltModel(model: Model, choices: list[SlotChoice], recipe_units: dict[(recipe_name, attribute), int], soft_terms: list[SoftTerm])`.
  - `SlotChoice(day, slot, recipe: Recipe, used: Var, amount: Var, ticks_per_amount: int)`; the multiplier in ticks is `value(amount) * ticks_per_amount`.
  - `SoftTerm(constraint: str, day: int | None, side: str, slack: Var, coefficient: int)`.
  - `penalty_coefficient(weight, reference, scale_exp: int) -> int`.
  - `guardrail_name(c: Constraint) -> str` returning `f"{c.name} (day guard-rail)"`.
  - Constants `OBJECTIVE_SCALE = 10**12`, `HEADROOM = 2**62`, `MEAL_FLOOR = "min_meals_per_day"`; exception `ModelTooLargeError(ValueError)`.

What the builder emits, mapped to spec section 3:

| Spec item | Model content |
|---|---|
| 2. Variables | Per generated slot and eligible recipe: `used` (0/1), `amount` in `[0, ceiling]`; `amount >= min * used`, `amount <= ceiling * used`; `sum(used) <= 1` per slot |
| 3. Day floor | `sum(used over the day) >= floor`, enforced by guard `(MEAL_FLOOR, day)`; skipped when the floor is 0 |
| 4-5. Hard constraints | One guarded `lb <= total <= ub` per day (day scope) or one for the horizon; `average_per_day` bounds times the number of days |
| 6. Soft constraints | Per side with nonzero weight that can be missed: slack in `[0, reach]`, `total + slack >= min` or `total - slack <= max`, objective coefficient from `penalty_coefficient` |
| 7. Guard-rail | For `average_per_day` with `add_day_guardrail`: a soft copy per day with `guardrail_side_weight`, even when the horizon constraint is hard |
| 8. Serving cap | Per choice: excess in `[0, ceiling - soft max]`, `ticks - excess <= soft max`, coefficient `penalty_coefficient(serving_cap_weight, max_multiplier, 3)` |
| 6. Headroom | Largest `magnitude()` of the objective and every constraint, and every bound, must be at most `HEADROOM`, else `ModelTooLargeError` |

- [ ] **Step 1: Write the failing test** in `tests/meal_planner/test_builder.py`

```python
import pytest

from meal_planner import (
    AttributeDef, Constraint, Day, Ingredient, IngredientAmount, ModelTooLargeError,
    PlanRequest, Recipe, Slot,
)
from meal_planner.builder import MEAL_FLOOR, OBJECTIVE_SCALE, build, penalty_coefficient

KCAL = AttributeDef("kcal", precision=0)
oats = Ingredient("oats", "g", {"kcal": 4})
porridge = Recipe("porridge", [IngredientAmount(oats, 100)])  # 400 kcal at 1x
eggs = Recipe("eggs", [IngredientAmount(oats, 50)], multiplier_step=0.5)  # 200 kcal


def request(days, constraints=(), recipes=(porridge, eggs)):
    return PlanRequest([KCAL], [], recipes, days, constraints)


def test_one_choice_per_generated_slot_and_recipe():
    built = build(request([Day([Slot(), Slot("absent")])]))
    assert [(c.day, c.slot, c.recipe.name) for c in built.choices] == [
        (0, 0, "porridge"), (0, 0, "eggs"),
    ]
    assert built.recipe_units[("porridge", "kcal")] == 400


def test_multiplier_variables_in_ticks_or_steps():
    by_name = {c.recipe.name: c for c in build(request([Day([Slot()])])).choices}
    cont, disc = by_name["porridge"], by_name["eggs"]
    assert (cont.ticks_per_amount, cont.amount.ub) == (1, 6000)  # thousandths up to 6x
    assert (disc.ticks_per_amount, disc.amount.ub) == (500, 12)  # half steps up to 6x
    assert (cont.used.lb, cont.used.ub) == (0, 1)


def test_at_most_one_recipe_per_slot():
    built = build(request([Day([Slot()])]))
    used = {c.used.index for c in built.choices}
    assert any(set(c.expr.terms) == used and c.ub == 1 for c in built.model.constraints)


def test_meal_floor_is_a_guarded_hard_constraint():
    built = build(request([Day([Slot(), Slot()]), Day([Slot()], min_meals_per_day=0)]))
    guards = [(g.constraint, g.day) for g in built.model.guards]
    assert guards == [(MEAL_FLOOR, 0)]
    floor = [c for c in built.model.constraints if c.enforced_by is not None]
    assert floor[0].lb == 2


def test_hard_day_constraint_gets_one_guard_per_day():
    c = Constraint("energy", "kcal", min=1800, hard=True)
    built = build(request([Day([Slot()]), Day([Slot()])], [c]))
    assert [(g.constraint, g.day) for g in built.model.guards if g.constraint == "energy"] == [
        ("energy", 0), ("energy", 1),
    ]
    guarded = [k for k in built.model.constraints if k.lb == 1800 * 10**3]
    assert len(guarded) == 2  # kcal precision 0 plus multiplier precision 3


def test_average_per_day_bound_is_multiplied_by_days_including_absent_ones():
    c = Constraint("energy", "kcal", scope="horizon", aggregate="average_per_day",
                   max=2000, hard=True, add_day_guardrail=False)
    days = [Day([Slot()]), Day([Slot("absent")]), Day([Slot()])]
    built = build(request(days, [c]))
    assert [g.day for g in built.model.guards if g.constraint == "energy"] == [None]
    assert any(k.ub == 3 * 2000 * 10**3 for k in built.model.constraints)


def test_soft_range_has_one_slack_per_side_with_normalized_coefficient():
    c = Constraint("energy", "kcal", min=1200, max=1500, weight_above=3)
    built = build(request([Day([Slot()])], [c]))
    terms = {(t.side): t for t in built.soft_terms}
    assert terms["below"].coefficient == round(OBJECTIVE_SCALE / (10**3 * 1200))
    assert terms["above"].coefficient == round(OBJECTIVE_SCALE * 3 / (10**3 * 1500))
    assert built.model.objective.terms[terms["below"].slack.index] == terms["below"].coefficient


def test_unreachable_side_gets_no_slack():
    c = Constraint("energy", "kcal", max=10**6)  # 6x of 400 kcal can never exceed it
    assert build(request([Day([Slot()])], [c])).soft_terms == []


def test_guardrail_adds_soft_day_copies_even_for_hard_horizon_constraints():
    c = Constraint("energy", "kcal", scope="horizon", aggregate="average_per_day",
                   min=1800, hard=True, weight=4)
    built = build(request([Day([Slot()]), Day([Slot()])], [c]))
    rails = [(t.constraint, t.day, t.side) for t in built.soft_terms]
    assert rails == [("energy (day guard-rail)", 0, "below"), ("energy (day guard-rail)", 1, "below")]
    assert built.soft_terms[0].coefficient == penalty_coefficient(2, 1800, 3)


def test_serving_cap_penalizes_excess_ticks():
    built = build(request([Day([Slot()])], recipes=[porridge]))
    (excess_coef,) = built.model.objective.terms.values()
    assert excess_coef == OBJECTIVE_SCALE // (10**3 * 2)  # weight 1, per tick, / max 2.0


def test_penalty_coefficient_never_rounds_a_positive_weight_to_zero():
    assert penalty_coefficient(1e-9, 10**6, 6) == 1
    assert penalty_coefficient(0, 5, 3) == 0


def test_model_too_large():
    huge = AttributeDef("huge", precision=6)
    heavy = Ingredient("heavy", "g", {"huge": 10**9})
    r = Recipe("r", [IngredientAmount(heavy, 1000)])
    req = PlanRequest([huge], [], [r], [Day([Slot()])], [Constraint("c", "huge", max=1, hard=True)])
    with pytest.raises(ModelTooLargeError):
        build(req)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python3 -m pytest tests/meal_planner/test_builder.py -q`
Expected: `ImportError: cannot import name 'ModelTooLargeError' from 'meal_planner'`.

- [ ] **Step 3: Implement** `meal_planner/builder.py`

```python
"""Turn a PlanRequest into a solver-neutral ir.Model (spec section 3).

Units: a recipe's attribute total is an integer at the attribute's
precision p. A multiplier is an integer number of thousandths (ticks). So
any slot, day or horizon total in the model is at scale 10**(p + 3).
"""

from dataclasses import dataclass
from fractions import Fraction

from .domain import Recipe
from .ir import LinExpr, Model, Var
from .request import Constraint, PlanRequest
from .scaling import MULTIPLIER_PRECISION, to_decimal, to_int

OBJECTIVE_SCALE = 10**12
"""Penalty fractions (#17) are multiplied by this before rounding to int."""

HEADROOM = 2**62
"""Largest magnitude any constraint or the objective may reach (int64 / 2)."""

MEAL_FLOOR = "min_meals_per_day"


class ModelTooLargeError(ValueError):
    """Scaled values would overflow the solver's 64-bit integers."""


@dataclass(frozen=True)
class SlotChoice:
    """Recipe ``recipe`` in slot ``slot`` of day ``day``.

    The multiplier in ticks is ``amount * ticks_per_amount``: continuous
    recipes count single ticks, discrete ones count whole steps.
    """

    day: int
    slot: int
    recipe: Recipe
    used: Var
    amount: Var
    ticks_per_amount: int


@dataclass(frozen=True)
class SoftTerm:
    """One side of one soft bound, for tests and debugging."""

    constraint: str
    day: int | None
    side: str
    slack: Var
    coefficient: int


@dataclass
class BuiltModel:
    model: Model
    choices: list[SlotChoice]
    recipe_units: dict[tuple[str, str], int]  # (recipe, attribute) -> int at p
    soft_terms: list[SoftTerm]


def build(request: PlanRequest) -> BuiltModel:
    return _Builder(request).run()


def penalty_coefficient(weight, reference, scale_exp: int) -> int:
    """Objective coefficient for one unit of slack at scale 10**scale_exp.

    The real penalty is ``weight * slack / reference`` (#17). A positive
    weight never rounds down to zero.
    """
    exact = (
        Fraction(OBJECTIVE_SCALE)
        * Fraction(to_decimal(weight))
        / (Fraction(10) ** scale_exp * Fraction(to_decimal(reference)))
    )
    coefficient = round(exact)
    if coefficient == 0 and exact > 0:
        coefficient = 1
    return coefficient


class _Builder:
    def __init__(self, request: PlanRequest):
        self.request = request
        self.model = Model()
        self.choices: list[SlotChoice] = []
        self.soft_terms: list[SoftTerm] = []
        self.precision = {a.name: a.precision for a in request.attributes}
        self.recipes = request.eligible_recipes()
        self.recipe_units = {
            (r.name, a): to_int(r.attribute_total(a), p)
            for r in self.recipes
            for a, p in self.precision.items()
        }

    def run(self) -> BuiltModel:
        self._choices()
        for c in self.request.constraints:
            self._constraint(c)
        self._serving_caps()
        self._check_headroom()
        return BuiltModel(self.model, self.choices, self.recipe_units, self.soft_terms)

    # Variables, one recipe per slot, day floor (spec items 2-3).

    def _choices(self) -> None:
        m = self.model
        for d, day in enumerate(self.request.days):
            served = LinExpr()
            for s, slot in enumerate(day.slots):
                if slot.kind != "generated":
                    continue
                per_slot = LinExpr()
                for r in self.recipes:
                    choice = self._choice(d, s, r)
                    per_slot.add(choice.used, 1)
                m.add(per_slot, ub=1)
                served.add_expr(per_slot)
            floor = day.meal_floor()
            if floor > 0:
                switch = m.add_guard(MEAL_FLOOR, d)
                m.add(served, lb=floor, enforced_by=switch)

    def _choice(self, d: int, s: int, r: Recipe) -> SlotChoice:
        m = self.model
        low = to_int(r.min_multiplier, MULTIPLIER_PRECISION)
        high = to_int(r.hard_max_multiplier, MULTIPLIER_PRECISION)
        step = 1
        if r.multiplier_step is not None:
            step = to_int(r.multiplier_step, MULTIPLIER_PRECISION)
            low, high = low // step, high // step
        tag = f"[{d},{s},{r.name}]"
        used = m.new_bool(f"used{tag}")
        amount = m.new_var(f"amount{tag}", 0, high)
        m.add(LinExpr().add(amount, 1).add(used, -low), lb=0)
        m.add(LinExpr().add(amount, 1).add(used, -high), ub=0)
        choice = SlotChoice(d, s, r, used, amount, step)
        self.choices.append(choice)
        return choice

    # Totals (spec item 4).

    def _total(self, attribute: str, day: int | None) -> LinExpr:
        expr = LinExpr()
        for ch in self.choices:
            if day is None or ch.day == day:
                units = self.recipe_units[(ch.recipe.name, attribute)]
                expr.add(ch.amount, units * ch.ticks_per_amount)
        return expr

    def _scale_exp(self, attribute: str) -> int:
        return self.precision[attribute] + MULTIPLIER_PRECISION

    # Constraints (spec items 5-7).

    def _constraint(self, c: Constraint) -> None:
        days = len(self.request.days)
        factor = days if c.aggregate == "average_per_day" else 1
        if c.scope == "day":
            targets = [(d, self._total(c.attribute, d)) for d in range(days)]
        else:
            targets = [(None, self._total(c.attribute, None))]
        for day, expr in targets:
            if c.hard:
                self._hard(c, day, expr, factor)
            else:
                self._soft(c, c.name, day, expr, factor, c.side_weight)
        if c.has_guardrail():
            for d in range(days):
                self._soft(c, guardrail_name(c), d, self._total(c.attribute, d), 1,
                           c.guardrail_side_weight)

    def _bound(self, c: Constraint, value, factor: int) -> int:
        return to_int(to_decimal(value) * factor, self._scale_exp(c.attribute))

    def _hard(self, c: Constraint, day, expr: LinExpr, factor: int) -> None:
        lb = None if c.min is None else self._bound(c, c.min, factor)
        ub = None if c.max is None else self._bound(c, c.max, factor)
        switch = self.model.add_guard(c.name, day)
        self.model.add(expr, lb=lb, ub=ub, enforced_by=switch)

    def _soft(self, c: Constraint, name: str, day, expr: LinExpr, factor: int,
              weight_of) -> None:
        m = self.model
        low, high = m.bounds(expr)
        for side, value in (("below", c.min), ("above", c.max)):
            weight = weight_of(side)
            if value is None or weight == 0:
                continue
            bound = self._bound(c, value, factor)
            reach = bound - low if side == "below" else high - bound
            if reach <= 0:
                continue  # this side can never be missed
            reference = to_decimal(
                c.normalization_reference if c.normalization_reference is not None
                else value
            ) * factor
            slack = m.new_var(f"slack[{name}@{day},{side}]", 0, reach)
            if side == "below":
                m.add(expr.copy().add(slack, 1), lb=bound)
            else:
                m.add(expr.copy().add(slack, -1), ub=bound)
            coef = penalty_coefficient(weight, reference, self._scale_exp(c.attribute))
            m.objective.add(slack, coef)
            self.soft_terms.append(SoftTerm(name, day, side, slack, coef))

    # Serving cap (spec item 8).

    def _serving_caps(self) -> None:
        m = self.model
        for ch in self.choices:
            r = ch.recipe
            soft = to_int(r.max_multiplier, MULTIPLIER_PRECISION)
            hard = ch.amount.ub * ch.ticks_per_amount
            if hard <= soft or to_decimal(r.serving_cap_weight) == 0:
                continue
            excess = m.new_var(f"excess[{ch.day},{ch.slot},{r.name}]", 0, hard - soft)
            m.add(LinExpr().add(ch.amount, ch.ticks_per_amount).add(excess, -1), ub=soft)
            coef = penalty_coefficient(r.serving_cap_weight, r.max_multiplier,
                                       MULTIPLIER_PRECISION)
            m.objective.add(excess, coef)

    def _check_headroom(self) -> None:
        m = self.model
        worst = max(
            [m.magnitude(m.objective)]
            + [m.magnitude(c.expr) for c in m.constraints]
            + [abs(b) for c in m.constraints for b in (c.lb, c.ub) if b is not None]
        )
        if worst > HEADROOM:
            raise ModelTooLargeError(
                f"scaled model reaches {worst}, above the int64 headroom {HEADROOM}; "
                "lower an attribute precision or shrink the request"
            )


def guardrail_name(c: Constraint) -> str:
    return f"{c.name} (day guard-rail)"
```

Append to `meal_planner/__init__.py`:

```python
from .builder import ModelTooLargeError
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m pytest tests/meal_planner -q`
Expected: `66 passed`.

- [ ] **Step 5: Commit**

```bash
git add meal_planner/builder.py meal_planner/__init__.py tests/meal_planner/test_builder.py
git commit -m "meal_planner: build the integer model from a PlanRequest

Guarded hard constraints (decision #14, STRICT mode), normalized soft
penalties (decision #17, percent of the violated bound), day guard-rails
for averages (decision #18) and the soft serving cap (decision #16,
retargeted to recipe multipliers by #22). Checks int64 headroom."
```

---

### Task 7: Results and `plan()`, with exact end-to-end scenarios

**Files:**
- Create: `meal_planner/result.py`
- Create: `meal_planner/planner.py`
- Modify: `meal_planner/__init__.py` (final form below)
- Test: `tests/meal_planner/test_plan_exact.py`

**Interfaces:**
- Consumes: `build`, `BuiltModel`, `OBJECTIVE_SCALE`, `guardrail_name` from `builder`; `cpsat.solve`; `PlanRequest`, `Constraint`; `from_int`, `to_decimal`, `MULTIPLIER_PRECISION`.
- Produces:
  - `SolveStatus` enum: `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, `TIMEOUT_NO_SOLUTION`.
  - `SlotAssignment(day, slot, kind, recipe: str | None, multiplier: Decimal | None, totals: Mapping[str, Decimal])`.
  - `Violation(constraint, day, slot, side, bound, actual, amount, percent)`; `ViolationReport(violations)` iterable, with `len()` and `for_constraint(name)`.
  - `ConflictMember(constraint, day)`; `ConflictReport(members)`.
  - `Plan(solve_status, objective_value: Decimal | None, slots, day_totals, horizon_totals, violations, conflicts)` with `slot(day, slot) -> SlotAssignment`.
  - `plan(request) -> Plan`; `minimize_core(built, core, time_limit) -> tuple[int, ...]`.

Every scenario below has a unique optimum. The comment above each test
gives the arithmetic, so a failing assertion can be checked by hand.

- [ ] **Step 1: Write the failing test** in `tests/meal_planner/test_plan_exact.py`

```python
"""Small, tie-free scenarios with hand-computed answers (decision #25)."""

from decimal import Decimal

import pytest

from meal_planner import (
    AttributeDef, ConflictMember, Constraint, Day, Ingredient, IngredientAmount,
    PlanRequest, Recipe, Slot, SolveStatus, TagDef, plan,
)

KCAL = AttributeDef("kcal", precision=0)
PROTEIN = AttributeDef("protein", precision=1)
COST = AttributeDef("cost", precision=2)
VEGAN = TagDef("vegan", "all")
NUTS = TagDef("contains-nuts", "any")

oats = Ingredient("oats", "g", {"kcal": 5})
porridge = Recipe("porridge", [IngredientAmount(oats, 100)])  # 500 kcal at 1x


def solve(recipes, days, constraints, attributes=(KCAL,), tags=(), **kw):
    return plan(PlanRequest(attributes, tags, recipes, days, constraints, **kw))


def test_soft_minimum_stops_at_the_serving_cap():
    # Shortfall costs 500/1200 per 1x; past the 2x cap each 1x costs 1/2. Stop at 2x.
    p = solve([porridge], [Day([Slot()])], [Constraint("energy", "kcal", min=1200)])
    assert p.solve_status is SolveStatus.OPTIMAL
    assert (p.slot(0, 0).recipe, p.slot(0, 0).multiplier) == ("porridge", Decimal(2))
    assert p.day_totals[0]["kcal"] == 1000
    (v,) = p.violations
    assert (v.constraint, v.day, v.side, v.bound, v.actual, v.amount) == (
        "energy", 0, "below", 1200, 1000, 200)
    assert v.percent == pytest.approx(Decimal(200) / 12)
    assert float(p.objective_value) == pytest.approx(200 / 1200, rel=1e-5)


def test_cheaper_serving_cap_lets_the_multiplier_pass_it():
    # Cap weight 0.5 costs 1/4 per 1x, less than the shortfall's 5/12: reach 1200 at 2.4x.
    loose = Recipe("porridge", [IngredientAmount(oats, 100)], serving_cap_weight=0.5)
    p = solve([loose], [Day([Slot()])], [Constraint("energy", "kcal", min=1200)])
    assert p.slot(0, 0).multiplier == Decimal("2.4")
    (v,) = p.violations
    assert (v.constraint, v.slot, v.amount, v.percent) == (
        "serving cap: porridge", 0, Decimal("0.4"), 20)


def test_asymmetric_range_weights_pick_the_cheaper_side():
    # 1x = 500 kcal, discrete whole servings: 2x misses min 1100 by 100, 3x passes max
    # 1400 by 100. Below weight 1 costs 100/1100; above weight 3 costs 300/1400. Pick 2x.
    whole = Recipe("porridge", [IngredientAmount(oats, 100)], multiplier_step=1, min_multiplier=1,
                   max_multiplier=4)
    c = Constraint("energy", "kcal", min=1100, max=1400, weight_above=3)
    p = solve([whole], [Day([Slot()])], [c])
    assert p.slot(0, 0).multiplier == 2
    (v,) = p.violations
    assert (v.side, v.amount) == ("below", 100)


def test_discrete_multiplier_lands_on_a_whole_step():
    # 6 g protein per egg. 3 eggs miss min 20 by 2 (2/20); 4 pass max 22 by 2 (2/22).
    egg = Ingredient("egg", "piece", {"protein": 6})
    eggs = Recipe("eggs", [IngredientAmount(egg, 1)], multiplier_step=1, min_multiplier=1,
                  max_multiplier=4)
    p = solve([eggs], [Day([Slot()])], [Constraint("protein", "protein", min=20, max=22)],
              attributes=[PROTEIN])
    assert p.slot(0, 0).multiplier == 4
    (v,) = p.violations
    assert (v.side, v.amount) == ("above", 2)
    assert v.percent == pytest.approx(Decimal(200) / 22)


def test_strict_mode_reports_a_minimal_conflict():
    # 1x pasta = 500 kcal for 5.00. 2000 kcal needs 4x = 20.00, over the budget of 10.
    pasta_i = Ingredient("pasta", "g", {"kcal": 5, "cost": 0.05})
    pasta = Recipe("pasta", [IngredientAmount(pasta_i, 100)])
    constraints = [
        Constraint("energy", "kcal", min=2000, hard=True),
        Constraint("budget", "cost", max=10, hard=True),
        Constraint("sanity", "kcal", max=100000, hard=True),
    ]
    p = solve([pasta], [Day([Slot()])], constraints, attributes=[KCAL, COST])
    assert p.solve_status is SolveStatus.INFEASIBLE
    assert set(p.conflicts.members) == {ConflictMember("energy", 0), ConflictMember("budget", 0)}
    assert p.slots == ()


def test_conflict_can_name_the_meal_floor_and_a_horizon_constraint():
    # Two served meals of at least 0.5x each are at least 500 kcal; the horizon max is 400.
    c = Constraint("cap", "kcal", scope="horizon", aggregate="total", max=400, hard=True)
    p = solve([porridge], [Day([Slot(), Slot()])], [c])
    assert set(p.conflicts.members) == {ConflictMember("min_meals_per_day", 0),
                                        ConflictMember("cap", None)}


def test_guardrail_reports_a_forced_one_day_spike():
    # Day 1 has no meal, so day 0 alone must carry the 2-day average of 80 g: 160 g = 4 shakes.
    # Moving day 0 from 80 to 160 g saves 1/160 per g on the horizon and costs only
    # 0.25/80 per g on the guard-rail, so the full spike wins.
    powder = Ingredient("whey", "scoop", {"protein": 40})
    shake = Recipe("shake", [IngredientAmount(powder, 1)], multiplier_step=1, min_multiplier=1,
                   max_multiplier=4)
    c = Constraint("protein", "protein", scope="horizon", aggregate="average_per_day",
                   min=80, max=80, guardrail_weight=0.25)
    p = solve([shake], [Day([Slot()]), Day([Slot("absent")])], [c], attributes=[PROTEIN])
    assert p.slot(0, 0).multiplier == 4
    assert p.horizon_totals["protein"] == 160
    rails = [(v.day, v.side, v.amount, v.percent) for v in p.violations]
    assert rails == [(0, "above", 80, 100), (1, "below", 80, 100)]
    assert float(p.objective_value) == pytest.approx(0.5, rel=1e-6)


def test_guardrail_spreads_an_average_evenly():
    # Without the guard-rail any split of 4 shakes over 2 days is free. With it only 2 + 2 is.
    powder = Ingredient("whey", "scoop", {"protein": 40})
    shake = Recipe("shake", [IngredientAmount(powder, 1)], multiplier_step=1, min_multiplier=1,
                   max_multiplier=3)
    c = Constraint("protein", "protein", scope="horizon", aggregate="average_per_day",
                   min=80, max=80)
    p = solve([shake], [Day([Slot()]), Day([Slot()])], [c], attributes=[PROTEIN])
    assert [p.slot(d, 0).multiplier for d in (0, 1)] == [2, 2]
    assert len(p.violations) == 0


def test_day_floor_forces_every_slot_to_be_served():
    # Both slots must hold at least 0.5x (250 kcal), so 500 kcal against a max of 300.
    p = solve([porridge], [Day([Slot(), Slot()])], [Constraint("light", "kcal", max=300)])
    assert [p.slot(0, s).multiplier for s in (0, 1)] == [Decimal("0.5"), Decimal("0.5")]
    (v,) = p.violations
    assert (v.side, v.amount) == ("above", 200)


def test_day_floor_of_zero_allows_an_empty_day():
    p = solve([porridge], [Day([Slot(), Slot()], min_meals_per_day=0)],
              [Constraint("light", "kcal", max=300)])
    assert [p.slot(0, s).recipe for s in (0, 1)] == [None, None]
    assert p.day_totals[0]["kcal"] == 0
    assert p.objective_value == 0


def test_absent_slot_stays_empty_and_adds_nothing():
    small = Recipe("snack", [IngredientAmount(oats, 50)])  # 250 kcal at 1x
    p = solve([small], [Day([Slot(), Slot("absent")])], [Constraint("energy", "kcal", min=500)])
    assert (p.slot(0, 0).recipe, p.slot(0, 0).multiplier) == ("snack", 2)
    absent = p.slot(0, 1)
    assert (absent.kind, absent.recipe, absent.totals["kcal"]) == ("absent", None, 0)
    assert len(p.violations) == 0


def test_tag_exclusion_removes_the_best_recipe():
    basil = Ingredient("basil", "g", {"kcal": 2}, {"vegan"})
    nuts = Ingredient("pine nuts", "g", {"kcal": 7}, {"vegan", "contains-nuts"})
    pesto = Recipe("pesto", [IngredientAmount(basil, 20), IngredientAmount(nuts, 80)])  # 600
    salad = Recipe("salad", [IngredientAmount(basil, 100)])  # 200
    c = Constraint("energy", "kcal", min=600, max=600)
    kw = dict(tags=[VEGAN, NUTS])
    assert solve([pesto, salad], [Day([Slot()])], [c], **kw).slot(0, 0).recipe == "pesto"
    p = solve([pesto, salad], [Day([Slot()])], [c], exclude_tags={"contains-nuts"}, **kw)
    # Salad shortfall costs 200/600 per 1x, the cap 1/2 per 1x: stop at 2x, 400 kcal.
    assert (p.slot(0, 0).recipe, p.slot(0, 0).multiplier) == ("salad", 2)
    (v,) = p.violations
    assert (v.side, v.amount) == ("below", 200)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python3 -m pytest tests/meal_planner/test_plan_exact.py -q`
Expected: `ImportError: cannot import name 'ConflictMember' from 'meal_planner'`.

- [ ] **Step 3: Implement** `meal_planner/result.py`

```python
"""What a solve returns: the plan, its status and its reports."""

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Mapping


class SolveStatus(Enum):
    """Decision #24. TIMEOUT_NO_SOLUTION: the time limit hit before any plan."""

    OPTIMAL = "OPTIMAL"
    FEASIBLE = "FEASIBLE"
    INFEASIBLE = "INFEASIBLE"
    TIMEOUT_NO_SOLUTION = "TIMEOUT_NO_SOLUTION"


@dataclass(frozen=True)
class SlotAssignment:
    """``recipe`` and ``multiplier`` are None for absent or unserved slots."""

    day: int
    slot: int
    kind: str
    recipe: str | None
    multiplier: Decimal | None
    totals: Mapping[str, Decimal]


@dataclass(frozen=True)
class Violation:
    """A missed soft bound. ``side`` is "below" (min) or "above" (max).

    ``amount`` is how far ``actual`` misses ``bound``; ``percent`` is that
    amount as a percentage of the normalization reference (#17).
    """

    constraint: str
    day: int | None
    slot: int | None
    side: str
    bound: Decimal
    actual: Decimal
    amount: Decimal
    percent: Decimal


@dataclass(frozen=True)
class ViolationReport:
    violations: tuple[Violation, ...] = ()

    def __iter__(self):
        return iter(self.violations)

    def __len__(self):
        return len(self.violations)

    def for_constraint(self, name: str) -> tuple[Violation, ...]:
        return tuple(v for v in self.violations if v.constraint == name)


@dataclass(frozen=True)
class ConflictMember:
    """A hard constraint in the conflict; ``day`` is None for horizon scope."""

    constraint: str
    day: int | None


@dataclass(frozen=True)
class ConflictReport:
    """A minimal set of hard constraints that cannot all hold (#14)."""

    members: tuple[ConflictMember, ...]


@dataclass(frozen=True)
class Plan:
    solve_status: SolveStatus
    objective_value: Decimal | None = None
    slots: tuple[SlotAssignment, ...] = ()
    day_totals: tuple[Mapping[str, Decimal], ...] = ()
    horizon_totals: Mapping[str, Decimal] | None = None
    violations: ViolationReport = ViolationReport()
    conflicts: ConflictReport | None = None

    def slot(self, day: int, slot: int) -> SlotAssignment:
        for assignment in self.slots:
            if (assignment.day, assignment.slot) == (day, slot):
                return assignment
        raise KeyError((day, slot))
```

- [ ] **Step 4: Implement** `meal_planner/planner.py`

```python
"""``plan(request) -> Plan``: the one public entry point (STRICT mode, #14)."""

from decimal import Decimal

from .backends import cpsat
from .builder import OBJECTIVE_SCALE, BuiltModel, build, guardrail_name
from .request import Constraint, PlanRequest
from .result import (
    ConflictMember,
    ConflictReport,
    Plan,
    SlotAssignment,
    SolveStatus,
    Violation,
    ViolationReport,
)
from .scaling import MULTIPLIER_PRECISION, from_int, to_decimal

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
    return _decode(request, built, outcome, status)


def minimize_core(built: BuiltModel, core, time_limit: float) -> tuple[int, ...]:
    """Drop each member in turn; keep it only if the rest become feasible.

    A re-solve that times out counts as feasible, so the member is kept.
    """
    members = list(core)
    for guard in list(members):
        trial = [g for g in members if g != guard]
        outcome = cpsat.solve(built.model, time_limit, assumed=trial, optimize=False)
        if outcome.status == "INFEASIBLE":
            members = trial
    return tuple(members)


def _decode(request: PlanRequest, built: BuiltModel, outcome, status) -> Plan:
    values = outcome.values
    precision = {a.name: a.precision for a in request.attributes}
    chosen = {}
    for ch in built.choices:
        if values[ch.used.index]:
            chosen[(ch.day, ch.slot)] = (ch, values[ch.amount.index] * ch.ticks_per_amount)
    zero = {a: Decimal(0) for a in precision}
    slots, day_totals = [], []
    for d, day in enumerate(request.days):
        day_total = dict(zero)
        for s, slot in enumerate(day.slots):
            if (d, s) not in chosen:
                slots.append(SlotAssignment(d, s, slot.kind, None, None, dict(zero)))
                continue
            ch, ticks = chosen[(d, s)]
            totals = {
                a: from_int(built.recipe_units[(ch.recipe.name, a)] * ticks,
                            p + MULTIPLIER_PRECISION)
                for a, p in precision.items()
            }
            for a in totals:
                day_total[a] += totals[a]
            multiplier = from_int(ticks, MULTIPLIER_PRECISION)
            slots.append(SlotAssignment(d, s, slot.kind, ch.recipe.name, multiplier, totals))
        day_totals.append(day_total)
    horizon = {a: sum((t[a] for t in day_totals), Decimal(0)) for a in precision}
    report = ViolationReport(tuple(_violations(request, slots, day_totals, horizon)))
    objective = Decimal(outcome.objective) / OBJECTIVE_SCALE
    return Plan(status, objective, tuple(slots), tuple(day_totals), horizon, report)


def _violations(request, slots, day_totals, horizon):
    days = len(request.days)
    for c in request.constraints:
        factor = days if c.aggregate == "average_per_day" else 1
        if not c.hard:
            if c.scope == "day":
                for d, totals in enumerate(day_totals):
                    yield from _misses(c, c.name, d, totals[c.attribute], 1, c.side_weight)
            else:
                yield from _misses(c, c.name, None, horizon[c.attribute], factor,
                                   c.side_weight)
        if c.has_guardrail():
            for d, totals in enumerate(day_totals):
                yield from _misses(c, guardrail_name(c), d, totals[c.attribute], 1,
                                   c.guardrail_side_weight)
    for a in slots:
        if a.recipe is None:
            continue
        recipe = next(r for r in request.recipes if r.name == a.recipe)
        cap = to_decimal(recipe.max_multiplier)
        if a.multiplier > cap and to_decimal(recipe.serving_cap_weight) > 0:
            excess = a.multiplier - cap
            yield Violation(f"serving cap: {recipe.name}", a.day, a.slot, "above",
                            cap, a.multiplier, excess, excess * 100 / cap)


def _misses(c: Constraint, name, day, actual, factor, weight_of):
    for side, value in (("below", c.min), ("above", c.max)):
        if value is None or weight_of(side) == 0:
            continue
        bound = to_decimal(value) * factor
        amount = bound - actual if side == "below" else actual - bound
        if amount <= 0:
            continue
        reference = to_decimal(
            c.normalization_reference if c.normalization_reference is not None else value
        ) * factor
        yield Violation(name, day, None, side, bound, actual, amount,
                        amount * 100 / reference)
```

- [ ] **Step 5: Replace `meal_planner/__init__.py`** with its final form

```python
"""Meal planner core (slice A): data model, model builder, CP-SAT solve."""

from .builder import ModelTooLargeError
from .domain import AttributeDef, Ingredient, IngredientAmount, PlanRequestError, Recipe, TagDef
from .planner import plan
from .request import Constraint, Day, PlanRequest, Slot
from .result import (
    ConflictMember,
    ConflictReport,
    Plan,
    SlotAssignment,
    SolveStatus,
    Violation,
    ViolationReport,
)

__all__ = [
    "AttributeDef", "ConflictMember", "ConflictReport", "Constraint", "Day",
    "Ingredient", "IngredientAmount", "ModelTooLargeError", "Plan", "PlanRequest",
    "PlanRequestError", "Recipe", "SlotAssignment", "Slot", "SolveStatus", "TagDef",
    "Violation", "ViolationReport", "plan",
]
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `python3 -m pytest -q`
Expected: `99 passed` (78 new plus the 21 `lp_solver` tests).

- [ ] **Step 7: Commit**

```bash
git add meal_planner/result.py meal_planner/planner.py meal_planner/__init__.py tests/meal_planner/test_plan_exact.py
git commit -m "meal_planner: plan() with violation and conflict reports

STRICT mode with a minimized conflict set (decision #14, infeasibility
handling) and solve_status (decision #24, OPTIMAL/FEASIBLE/INFEASIBLE/
timeout). Exact tie-free scenarios per decision #25 (deterministic
solving and test styles)."
```

---

### Task 8: Property tests, reference-scale benchmark, README

**Files:**
- Create: `tests/meal_planner/conftest.py`
- Create: `tests/meal_planner/scenarios.py`
- Create: `tests/meal_planner/test_plan_properties.py`
- Create: `tests/meal_planner/test_benchmark.py`
- Modify: `README.md`

**Interfaces:**
- Consumes: the public API from Task 7.
- Produces: `random_request(seed, recipes=10, days=3, slots=3, time_limit=30.0) -> PlanRequest` in `scenarios.py`.

The property test recomputes day totals from the ingredient definitions in
`Fraction` arithmetic, independent of the builder, then checks every hard
rule and that the reported objective equals the penalties recomputed from
scratch. Ingredient values are chosen so recipe totals are exact at each
attribute's precision; otherwise the builder's one rounding would make the
two computations differ.

- [ ] **Step 1: Write the shared scenarios.** `tests/meal_planner/conftest.py`:

```python
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))  # for the shared scenarios module
```

`tests/meal_planner/scenarios.py`:

```python
"""Seeded random catalogs for property tests and the benchmark."""

import random

from meal_planner import AttributeDef, Constraint, Day, Ingredient, IngredientAmount, PlanRequest, Recipe, Slot

ATTRIBUTES = [AttributeDef("kcal", precision=0), AttributeDef("protein", precision=1),
              AttributeDef("cost", precision=2)]


def random_request(seed, recipes=10, days=3, slots=3, time_limit=30.0):
    rng = random.Random(seed)
    ingredients = [
        Ingredient(f"ing{i}", "g", {"kcal": rng.randint(1, 9), "protein": rng.randint(0, 3) / 10,
                                    "cost": rng.randint(1, 20) / 100})
        for i in range(12)
    ]
    catalog = []
    for r in range(recipes):
        items = [IngredientAmount(ing, rng.randint(2, 20) * 10)
                 for ing in rng.sample(ingredients, rng.randint(1, 4))]
        step = rng.choice([None, 0.5, 1])
        low = 1 if step == 1 else 0.5
        catalog.append(Recipe(f"recipe{r}", items, multiplier_step=step, min_multiplier=low))
    plan_days = []
    for _ in range(days):
        kinds = ["generated" if rng.random() < 0.85 else "absent" for _ in range(slots)]
        if "generated" not in kinds:
            kinds[0] = "generated"
        generated = kinds.count("generated")
        plan_days.append(Day([Slot(k) for k in kinds], min_meals_per_day=rng.randint(1, generated)))
    constraints = [
        Constraint("energy", "kcal", min=1800, max=2400),
        Constraint("protein", "protein", scope="horizon", aggregate="average_per_day",
                   min=60, weight=2),
        Constraint("budget", "cost", scope="horizon", aggregate="total", max=60 * days,
                   hard=True),
        Constraint("cheap days", "cost", max=80, hard=True),
    ]
    return PlanRequest(ATTRIBUTES, [], catalog, plan_days, constraints,
                       solve_time_limit=time_limit)
```

- [ ] **Step 2: Write the property test** in `tests/meal_planner/test_plan_properties.py`

```python
"""Larger seeded scenarios checked against an independent exact recomputation."""

from fractions import Fraction

import pytest

from meal_planner import SolveStatus, plan

from scenarios import random_request


def exact(value):
    return Fraction(str(value))


def recompute_totals(request, p):
    """Day totals from the ingredient definitions, not from the planner's numbers."""
    recipes = {r.name: r for r in request.recipes}
    names = [a.name for a in request.attributes]
    days = [{a: Fraction(0) for a in names} for _ in request.days]
    for a in p.slots:
        if a.recipe is None:
            continue
        for item in recipes[a.recipe].items:
            for attr in names:
                per_unit = exact(item.ingredient.attributes.get(attr, 0))
                days[a.day][attr] += exact(item.quantity) * per_unit * exact(a.multiplier)
    return days


def penalty(c, actual, factor, weight_of):
    total = Fraction(0)
    for side, bound in (("below", c.min), ("above", c.max)):
        if bound is None:
            continue
        b = exact(bound) * factor
        miss = b - actual if side == "below" else actual - b
        if miss > 0:
            ref = exact(c.normalization_reference or bound) * factor
            total += exact(weight_of(side)) * miss / ref
    return total


def expected_objective(request, p, days):
    n = len(request.days)
    total = Fraction(0)
    for c in request.constraints:
        factor = n if c.aggregate == "average_per_day" else 1
        if not c.hard:
            if c.scope == "day":
                total += sum(penalty(c, d[c.attribute], 1, c.side_weight) for d in days)
            else:
                horizon = sum(d[c.attribute] for d in days)
                total += penalty(c, horizon, factor, c.side_weight)
        if c.has_guardrail():
            total += sum(penalty(c, d[c.attribute], 1, c.guardrail_side_weight) for d in days)
    recipes = {r.name: r for r in request.recipes}
    for a in p.slots:
        if a.recipe is not None:
            r = recipes[a.recipe]
            excess = exact(a.multiplier) - exact(r.max_multiplier)
            if excess > 0:
                total += exact(r.serving_cap_weight) * excess / exact(r.max_multiplier)
    return total


@pytest.mark.parametrize("seed", range(6))
def test_random_plans_hold_every_hard_rule(seed):
    request = random_request(seed)
    p = plan(request)
    assert p.solve_status is SolveStatus.OPTIMAL
    days = recompute_totals(request, p)
    for d, day in enumerate(request.days):
        assert days[d] == {k: exact(v) for k, v in p.day_totals[d].items()}
        served = [a for a in p.slots if a.day == d and a.recipe is not None]
        assert len(served) >= day.meal_floor()
        assert all(day.slots[a.slot].kind == "generated" for a in served)
        assert days[d]["cost"] <= 80
    assert sum(d["cost"] for d in days) <= 60 * len(request.days)
    recipes = {r.name: r for r in request.recipes}
    for a in p.slots:
        if a.recipe is not None:
            r = recipes[a.recipe]
            assert exact(r.min_multiplier) <= exact(a.multiplier) <= exact(r.hard_max_multiplier)
            if r.multiplier_step is not None:
                assert exact(a.multiplier) % exact(r.multiplier_step) == 0
    assert float(p.objective_value) == pytest.approx(
        float(expected_objective(request, p, days)), rel=1e-4, abs=1e-6)
```

- [ ] **Step 3: Run it**

Run: `python3 -m pytest tests/meal_planner/test_plan_properties.py -q`
Expected: `6 passed`. These test code from Tasks 1-7, so they should pass at once. If one fails, treat it as a bug in the planner, not in the test: use superpowers:systematic-debugging.

- [ ] **Step 4: Write the benchmark** in `tests/meal_planner/test_benchmark.py`

```python
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
```

- [ ] **Step 5: Run the default suite and the benchmark**

Run: `python3 -m pytest -q`
Expected: `105 passed, 1 deselected`.

Run: `python3 -m pytest -m benchmark -s -q`
Expected: passes in about 30 s and prints a line such as `reference scale: FEASIBLE in 29.4s`. Record the printed status in the commit message. `FEASIBLE` means a usable plan that was not proven optimal within 30 s; the spec left this open until measured.

- [ ] **Step 6: Update `README.md`.** Replace the status paragraph

```markdown
**Status:** Early design phase. No implementation yet — the core
optimization logic is being designed before any UI is built.
```

with

```markdown
**Status:** First slice implemented as the `meal_planner` library:
recipes, tags, day and horizon constraints (hard and soft), serving
multipliers, and STRICT solving with violation and conflict reports.
No CLI or UI yet.

Run the tests with `python3 -m pip install 'ortools>=9.12,<10' 'pytest>=8'`
and then `python3 -m pytest`. The reference-scale benchmark is opt-in:
`python3 -m pytest -m benchmark -s`.
```

- [ ] **Step 7: Commit**

```bash
git add tests/meal_planner README.md
git commit -m "meal_planner: property tests and reference-scale benchmark

Property tests per decision #25 (exact and property test styles). The
benchmark runs decision #24's reference scale (200 recipes, 14 days,
3 slots): <status> in <seconds>s, from the step 5 output."
```

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| Section 1 package layout, `pyproject.toml`, pytest | 1, 4, 5, 6, 7 |
| `AttributeDef` precision and stored `accrues_on` | 2 |
| `TagDef` all/any derivation, `extra_tags` | 2 |
| `Ingredient`, `IngredientAmount`, derived recipe totals | 2 |
| Multiplier step, bounds and defaults (#38) | 2, 6 |
| `Slot`, `Day`, `min_meals_per_day` | 3, 6 |
| `Constraint` fields, `aggregate`, weights, guard-rail defaults | 3, 6 |
| `PlanRequest`, `exclude_tags`, `require_tags`, `solve_time_limit` | 3, 6 |
| Validation list (section 4), collected into one error | 2, 3 |
| Scaling, rounding once, thousandths | 1, 6 |
| Variables, at most one recipe per slot, day floor | 6 |
| Day and horizon totals, `average_per_day` times days | 6 |
| Hard constraints with switches, STRICT, minimized core | 5, 6, 7 |
| Soft constraints, normalization, int64 headroom | 6 |
| Guard-rail, soft even for hard horizon constraints | 6, 7 |
| Serving cap | 6, 7 |
| Deterministic CP-SAT, time limit, four statuses | 5, 7 |
| Output: assignments, day and horizon totals, violation report | 7 |
| Test table: scaling, domain, builder, backend, exact, property, reference scale | 1-8 |
