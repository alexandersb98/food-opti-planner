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
    constraints. Solve with OR-Tools (backend and continuous-vs-integer
    representation finalized in decision #15). Deterministic, one
    coherent model. Two alternatives (two-phase solving, metaheuristics)
    were considered and set aside — see
    [`future-features.md`](future-features.md) for why, and for when
    they might be worth revisiting.

14. **Hard-constraint infeasibility: two solve modes, automatic minimal
    relaxation, per-constraint `relaxable` flag.** Resolves open
    question #1 from [`open-questions.md`](open-questions.md).

    - **STRICT mode.** All hard constraints are enforced exactly as
      given. If the hard-constraint set alone is infeasible, no plan is
      produced. Instead the engine returns a conflict diagnostic naming
      the hard constraints involved, found via an elastic/phased
      formulation: give every hard constraint a slack variable gated by
      a "violated?" binary, and first minimize the *count* of
      nonzero-slack binaries. The constraints flagged nonzero in that
      minimal solution are the reported conflicting set (a minimal, not
      necessarily unique, explanation of the infeasibility). On the v1
      CP-SAT backend this is implemented via CP-SAT's native
      solve-with-assumptions / minimal-unsat-core support rather than
      hand-rolled slack/binary pairs — see decision #15.

    - **RELAX mode.** Automatically finds and applies the smallest
      relaxation that restores feasibility, in three phases: (1) the
      same minimal-count phase as STRICT to find *which* hard
      constraints must give (restricted to constraints with
      `relaxable: true`), (2) minimize the *total slack magnitude* on
      just that flagged set to find *by how much* each must loosen at
      minimum, (3) fix those as new, looser bounds and solve the normal
      goal-programming objective over everything else as usual. The
      result's report lists exactly which hard constraints were
      relaxed and by how much. If the minimal conflicting set can only
      be resolved by loosening a constraint marked `relaxable: false`,
      RELAX mode reports the same infeasibility diagnostic as STRICT
      instead of touching it.

    - **`relaxable` flag.** Every hard constraint has a `relaxable: bool`
      field, default `true` (irrelevant for soft constraints). Set it
      `false` to pin a constraint (e.g. a hard allergy exclusion) as
      immovable even under RELAX mode.

    - **Manual override.** After either mode reports a conflict, the
      user can hand-edit the `PlanRequest` (loosen specific bounds by
      their own chosen amount, change `relaxable` flags, etc.) and
      re-run in STRICT mode. This isn't a separate engine mode — it's
      just STRICT/RELAX plus a caller free to change the request between
      calls.

    - **Hard constraints are inequalities only** (`≤`/`≥`), never exact
      equality — equality combined with discrete/integer quantities is a
      common accidental-infeasibility source (can't always hit an exact
      number with whole eggs/cans). A soft constraint can still target
      an exact value via a two-sided deviation penalty.

15. **Solver backend: OR-Tools CP-SAT for v1, behind a swappable
    interface.** Resolves open question #2 from
    [`open-questions.md`](open-questions.md).

    - **v1 uses CP-SAT.** CP-SAT only works over integers, so decision
      #9's genuinely continuous foods (e.g. rice, oil) are represented
      as integers at a fixed, documented precision rather than true
      reals — a deliberate, bounded rounding, not an approximation
      users need to reason about. Default precision (overridable):
      food quantities in **centigrams** (0.01g resolution, i.e. grams ×
      100), monetary values in **tenths of a cent**, and each
      user-defined attribute (decision #7) carries a `precision`
      (decimal places, default 3) used to scale its per-unit value to
      an integer at model-build time. At these resolutions the rounding
      is not meal-planning-relevant in practice.
    - **Why CP-SAT over a true-continuous MILP backend (MPSolver +
      CBC/SCIP):** this problem is binary/combinatorics-heavy (the
      "used here" indicators, variety-counting, and decision #14's
      relaxation phases), where CP-SAT tends to be faster and more
      robust than CBC. CP-SAT also has native solve-with-assumptions /
      minimal-unsat-core support, which directly implements decision
      #14's "find the minimal conflicting set of hard constraints" step
      — no hand-built elastic/big-M encoding needed for that part.
    - **Kept swappable, not hardcoded.** The engine's model-building
      code (turning `Food`/`Constraint`/`PlanRequest` into
      variables/constraints/objective) is written against a
      solver-agnostic internal representation; the translation to
      CP-SAT's API is isolated behind a single backend adapter. A future
      true-continuous backend (MPSolver/CBC/SCIP) can be added as an
      alternative adapter — using real-valued variables directly, no
      scaling — and exposed as a user-selectable option, without
      rewriting the model-building layer. Not built in v1; just
      designed so it's an additive change later.

16. **Per-slot quantity cap: soft, via the same weighted-constraint
    mechanism as variety, with a required per-food declared serving
    size.** Resolves open question #3 from
    [`open-questions.md`](open-questions.md).

    - Every food declares its own `max_serving_size` (a quantity, in the
      same units as its granularity — decision #9), required alongside
      granularity, since a sensible max varies hugely by food (a
      tablespoon of oil vs. a bowl of rice — no single global number
      fits both).
    - Not a new hard-limit concept: it's a default soft constraint using
      the same goal-programming mechanism as everything else (decision
      #6) — the same pattern decision #10 already uses for variety.
      "Quantity of a food in one slot beyond its `max_serving_size`"
      is treated exactly like any other constraint's shortfall/excess:
      it costs `weight × excess` toward the total penalty the optimizer
      minimizes, with a sensible default weight, user-overridable or
      disableable per food like any other constraint.
    - Staying soft (rather than hard) avoids introducing a second
      hard-limit concept alongside the hard/soft constraint system, and
      avoids adding a new way to trigger decision #14's infeasibility
      handling if a cap is set too tight.

17. **Weights are normalized: deviation is measured as percent of the
    violated bound, not a raw absolute amount.** Resolves open question
    #4 from [`open-questions.md`](open-questions.md).

    - Every soft constraint's contribution to the objective is
      `weight × (deviation / reference)` instead of `weight × deviation`.
      This makes weights comparable across attributes on wildly
      different scales (protein grams, calories, dollars, …) — a
      "weight 5" now means the same thing regardless of the attribute's
      natural units.
    - **Default reference: the bound being violated.** For "protein ≥
      120g," reference = 120 (a 12g shortfall = 10% deviation). For a
      range like "calories 1800-2200," reference = whichever bound
      (1800 or 2200) is violated. No extra input needed for the common
      case — it falls out of the constraint already written.
    - **Override for zero/awkward targets.** A constraint may specify
      an explicit `normalization_reference` to use instead of its own
      target/bound, for cases where the target is 0 or otherwise a bad
      denominator (e.g. a goal expressed as "minimize toward zero").
    - This applies uniformly to the goal-programming objective
      (decision #6), and therefore also to the default variety
      (decision #10) and per-slot-quantity (decision #16) constraints,
      whose "reference" is their own threshold/serving-size value.

18. **Horizon-average constraints auto-generate a same-valued day-level
    guard-rail.** Resolves open question #5 from
    [`open-questions.md`](open-questions.md).

    - Whenever a horizon-scoped average constraint is declared (e.g.
      "average sugar ≤ 50g/day over the week"), the engine automatically
      adds a companion **day-scoped soft constraint** with the same
      value and comparator (e.g. "sugar ≤ 50g" applied to each
      individual day), at a lower default weight than an explicit
      user-written day constraint would get. This prevents the average
      being satisfied by concentrating everything into one or two days
      while the rest are near-zero, without inventing an arbitrary
      multiplier — it reuses the number the user already wrote.
    - **Overridable per constraint**, via an `add_day_guardrail: bool`
      field (default `true`) and its own weight if the user wants to
      tune the guard-rail's strength independently of the horizon
      constraint's weight.
    - Follows the same "sensible default, always overridable" shape as
      the variety (#10) and per-slot-quantity (#16) defaults, and is
      itself subject to the weight normalization from decision #17.

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
