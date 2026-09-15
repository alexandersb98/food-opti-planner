# Meal Plan Optimizer — Design Notes (IN PROGRESS)

**Status:** All architectural decisions made, but a design review turned
up open holes/questions that should be resolved during the next step —
see [`open-questions.md`](open-questions.md). Next up: the concrete data
model / constraint DSL, then the full architectural design doc — see
"Next steps below."

**Path:** Architectural (new project, no existing code to change).

## Purpose

An app that generates a multi-day eating plan (which foods, in what
quantities, per meal, per day) that satisfies a set of user-defined
constraints (e.g. "protein ≥ 120g/day", "cost ≤ $15/day") as well as
possible. Constraints may conflict or be jointly infeasible — the app
should not simply fail in that case, but produce a "good enough"
compromise and be transparent about what was sacrificed and by how much.

The core optimization logic is the priority. No UI, persistence, or CLI
until the logic is solid.

## Decisions made so far

1. **Meal composition (v1): buckets, not recipes.** The optimizer picks
   raw-food quantities and assigns them into meal-time slots (breakfast /
   lunch / dinner / etc.) within a day. There is no notion of a named
   "dish" or recipe in v1. A future recipe-based mode (picking from a
   recipe library instead of raw foods) is a known future extension —
   keep the meal-composition step swappable so it doesn't require a
   rewrite of the core engine.

2. **Multi-day horizon.** The number of days in a plan is a configurable
   input to each plan-generation run (not fixed).

3. **Meals per day: configurable.** The number of meal slots per day
   (e.g. 3, or 4 with a snack) is also a configurable input per run, not
   hardcoded to 3.

4. **No per-meal constraints in v1.** Constraints apply at the **day**
   level (must hold for each individual day) or the **horizon** level
   (total/average across the whole plan) — not to individual meal slots.
   Meals are purely how the day's foods are grouped for output/display.

5. **Constraint scope: both day and horizon.** A constraint can require,
   e.g., "≥120g protein every day" (day-scoped) or "average ≤ 50g sugar
   per day over the week" / "total cost ≤ $100 for the week"
   (horizon-scoped). Both kinds must be supported.

6. **Compromise strategy: weighted penalties (goal programming).** Every
   constraint has a weight. Some constraints can be marked **hard**
   (must never be violated — e.g. a budget cap) while the rest are soft.
   The optimizer minimizes the total weighted violation of soft
   constraints, subject to all hard constraints holding. Example:

   ```
   Cost ≤ $15/day        [HARD]
   Protein ≥ 120g/day    weight 5
   Calories 1800-2200/day weight 3
   Sugar ≤ 50g/day       weight 1

   minimize: 5×(protein shortfall) + 3×(calorie deviation) + 1×(sugar excess)
   subject to: cost ≤ $15 always
   ```

7. **Food attributes are fully user-definable.** There is no fixed
   nutrient list baked into the app. A food carries an arbitrary set of
   named attributes (protein, calories, sugar, cost, glycemic index,
   caffeine — whatever the user wants to track), each with a per-unit
   value. Constraints are written against attribute names, so adding a
   new trackable attribute never requires a data-model or engine change.

8. **Food data source: user-maintained local database only (v1).** No
   external nutrition API / public dataset integration yet. The user
   enters their own foods (name, per-unit attribute values, per-unit
   price). An importer from a public dataset (USDA FoodData Central,
   Open Food Facts, etc.) is a clean later addition and must not require
   changing the optimizer itself.

9. **Quantity granularity is per-food, not global.** Each food declares
   its own granularity:
   - **continuous** — any gram amount (e.g. rice, oil), or
   - **discrete** — must be an integer multiple of a defined unit size
     (e.g. "1 egg = 50g", "1 can = 400g").

   This means the solver must handle a genuine **mixed-integer** linear
   program (continuous variables for some foods, integer variables for
   others) — not a pure LP.

10. **Variety is encouraged, via the same generic mechanism.** Rather
    than a special-cased "variety" feature, repetition is discouraged
    using the same weighted-constraint machinery as everything else —
    e.g. a default soft rule like "using the same food more than N times
    across the horizon costs W per excess use," with sensible defaults
    that the user can override or disable like any other constraint.

11. **Tech stack: Python.** Reason: mature, free, well-documented
    mixed-integer solvers exist for Python (OR-Tools, PuLP+CBC); the
    JS/TS ecosystem's MILP support is comparatively weak and risky for a
    problem that structurally requires integer variables (see #9).

12. **Interface for v1: library only, driven by tests.** No CLI, no
    persistence layer, no UI. The deliverable is a well-tested Python
    package/API that a future CLI, API service, or UI can import. Manual
    poking-around happens through the test suite, not a REPL/CLI.

13. **Optimization structure: single MILP model per plan-generation
    call.** One optimization problem covers everything: quantity
    variables per food per meal-slot per day (mixed continuous/integer
    per food's granularity), binary "is this food used here" indicators
    (needed for unit-linking and for detecting repeats for variety), and
    goal-programming slack variables for every soft constraint at
    whatever scope (day/horizon) it's defined at. Objective = weighted
    sum of all slack/violation terms + variety penalty, subject to hard
    constraints. Solve with OR-Tools (CP-SAT or its MILP/CBC backend).
    Deterministic, one coherent model. Two alternatives (two-phase
    solving, metaheuristics) were considered and set aside — see
    [`future-features.md`](future-features.md) for why, and for when
    they might be worth revisiting.

## Explicitly out of scope for v1 (later candidates)

See [`future-features.md`](future-features.md) for the full list
(recipes/dishes, per-meal constraints, external data import, UI,
persistence, CLI) and the alternative optimization approaches considered
for #13.

## Next steps when resuming this work

1. Resolve the open holes/questions in
   [`open-questions.md`](open-questions.md), since several of them
   change what the data model needs to represent.
2. Nail down the concrete data model / "constraint DSL": `Food`,
   `Constraint` (attribute, scope: day|horizon, comparator, target,
   hard|soft, weight), `PlanRequest` (days, meals/day, foods available,
   constraints), `Plan` (result), `ViolationReport` (which soft
   constraints were compromised, by how much).
3. Choose the specific optimization library (OR-Tools vs PuLP vs Pyomo)
   and confirm it installs cleanly in the target environment.
4. Write the full architectural design doc (per
   `superpowers:brainstorming`), get it approved section by section,
   commit it, then hand off to `superpowers:writing-plans` for an
   implementation plan.
5. Implement the core engine with `superpowers:test-driven-development`.
