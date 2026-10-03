# Meal Plan Optimizer — Design Notes (IN PROGRESS)

**Status:** All architectural decisions made, including all 10
holes/questions turned up by design review — see
[`open-questions.md`](open-questions.md). Decisions #26 (plan pivoting)
and #27 (pantry inventory with expiry) raised further open questions
there. Next up:
the concrete data model / constraint DSL, then the full architectural
design doc — see "Next steps" below.

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

1. **Meal composition: recipes, not raw-food buckets.** Originally
   scoped for v1 as raw-food buckets (the optimizer freely combining
   individual foods per slot, no recipe concept, with a recipe-based
   mode deferred to later — see `future-features.md`'s history).
   **Reversed by decision #22**: freely-combined raw foods produced
   plans that don't read as real meals, so recipes are pulled into v1
   as the actual composition unit. The optimizer now selects one recipe
   (a fixed, named composition of foods) per `generated` slot, at a
   scalable serving size — see decision #22 for the full model. Raw
   foods still exist, just as recipe ingredients rather than
   directly-selectable slot contents.

2. **Multi-day horizon.** The number of days in a plan is a configurable
   input to each plan-generation run (not fixed).

3. **Meals per day: configurable.** The number of meal slots per day
   (e.g. 3, or 4 with a snack) is also a configurable input per run, not
   hardcoded to 3. Refined by decision #19 into a per-day (not just
   per-run) configuration, with slots that can be generated, external,
   or absent.

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
   others) — not a pure LP. Decision #22 reuses this same
   continuous/discrete choice for a recipe's serving-size multiplier.

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

    Decision #22 updates the per-slot decision variables described
    above: instead of a quantity variable and "used" indicator per
    *food* per slot, each `generated` slot now gets a "recipe R used
    here" binary per recipe and a serving-multiplier variable — the
    single-MILP structure and solve approach are unchanged.

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
    - **Retargeted by decision #22**: since `generated` slots now hold
      one recipe rather than freely-chosen raw foods, this cap applies
      to a recipe's serving-size multiplier (`max_serving_multiplier`)
      instead of a raw food's quantity. Same mechanism, same rationale,
      just relabeled from food to recipe.

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

19. **Per-day slot configuration, with three slot kinds: `generated`,
    `external`, `absent`.** Refines decision #3 (which fixed "meals per
    day" as one number for the whole run) into a per-day configuration:
    each day in the horizon declares its own list of meal-slots, and
    each slot has a `kind`:

    - **`generated`** — today's only behavior: the optimizer selects a
      recipe and serving-size multiplier for this slot (decision #22),
      subject to the per-slot serving cap (#16, retargeted by #22) and
      counted for variety (#10, generalized by #23).
    - **`external`** — the slot exists on that day but is *not*
      optimized: no food selection happens for it. The caller instead
      supplies a fixed attribute-value vector for it directly (plain
      attribute-name → value pairs, same free-form attributes as
      decision #7, e.g. `{calories: 700, cost: 25, protein: 40}` for a
      restaurant meal). These fixed values are added as constants into
      that day's attribute totals wherever day-scoped constraints (#5)
      or their derived guard-rails (#18) sum things up. An `external`
      slot contributes no decision variables and doesn't participate in
      variety tracking or the per-slot serving cap, since no specific
      food was chosen for it.
    - **`absent`** — the slot doesn't exist for that day at all (e.g. no
      breakfast on a given day) — contributes nothing to that day's
      totals, and isn't counted toward decision #20's "meals served"
      floor for that day.

    This lets a horizon mix days freely — e.g. Monday has
    breakfast/lunch/dinner all `generated`; Tuesday has breakfast
    `absent` but the same daily-calorie constraint still holds across
    the remaining `generated` slots; Wednesday has dinner marked
    `external` with an assumed restaurant-meal contribution, while
    breakfast/lunch stay `generated`.

20. **"Eat nothing" guard: configurable, per-day minimum number of
    served `generated` slots.** Resolves open question #6 from
    [`open-questions.md`](open-questions.md), building on decision #19.

    - Each day specifies `min_meals_per_day`: the minimum number of
      that day's `generated` slots which must end up with a recipe
      selected (decision #22). Defaults to *all* of that day's
      `generated` slots (the strictest, traditional setting),
      overridable down to any lower count, or to `0` to disable the
      floor entirely for that day.
    - A slot counts as "served" using the same per-slot recipe-used
      indicators the MILP already has from decision #22, aggregated
      per slot: "at least `min_meals_per_day` of this day's `generated`
      slots have a recipe-used indicator = 1."
    - `external` and `absent` slots don't participate in this count in
      either direction — they neither need to be "served" nor count
      toward satisfying the minimum.
    - Enforced as a **hard** constraint, `relaxable: true` by default
      like other hard constraints (decision #14), so RELAX mode can
      still loosen it in a genuinely constrained scenario rather than
      just reporting infeasible.

21. **Range constraints get a richer `Constraint` shape with explicit
    `min`/`max`, replacing the single `(attribute, comparator, target)`
    sketch.** Resolves open question #7 from
    [`open-questions.md`](open-questions.md).

    - A `Constraint` carries optional `min` and `max` bounds on an
      attribute (either may be omitted for a one-sided constraint, both
      present for a range like "1800–2200 kcal").
    - Deviation is computed independently against whichever bound is
      violated, using decision #17's normalization (percent of the
      violated bound) — a value below `min` is only measured against
      `min`, a value above `max` only against `max`; a value inside the
      range contributes zero deviation.
    - `weight` defaults to a single value applied symmetrically to both
      sides. An optional `weight_below`/`weight_above` override lets a
      caller penalize the two directions differently (e.g. going over a
      calorie/cost budget hurts more than going under).
    - A range constraint is still one `Constraint` object: one
      `relaxable` flag (decision #14) and one day-guardrail setting
      (decision #18) apply to both sides together, rather than risking
      two independently-edited constraints drifting out of sync. A
      caller who genuinely wants independent relaxability/guardrails per
      side can still express the range as two separate one-sided
      constraints on the same attribute — that shape remains valid, it's
      just not the default for an ordinary two-sided range.

22. **Recipes are the meal-composition unit for `generated` slots: one
    recipe per slot, with a scalable serving-size multiplier.** Reverses
    decision #1's original "buckets, not recipes" scope — recipes are
    pulled into v1 because freely-combined raw foods produced meal plans
    that don't read as real meals.

    - **Recipe definition.** A `Recipe` is a named catalog entry: a
      fixed list of `(food, quantity)` pairs at defined proportions
      (its "1×" / base serving). A recipe's attribute totals (calories,
      cost, protein, etc. — decision #7's free-form attributes) are
      *derived*, not separately entered: summed from its ingredients'
      per-unit attribute values × their fixed quantities. Editing a
      food's attribute value automatically updates every recipe that
      uses it.
    - **One recipe per `generated` slot.** Each `generated` slot
      (decision #19) selects at most one recipe from the catalog — a
      binary "recipe R used in this slot" indicator, the same shape as
      decision #13's old per-food "used here" indicator, just
      recipe-indexed. Raw foods are no longer directly selectable
      within a `generated` slot; they only appear as recipe
      ingredients.
    - **Scalable serving-size multiplier.** When a recipe is selected,
      the optimizer also picks a serving multiplier (base recipe =
      1.0×) that scales every ingredient's quantity — and therefore the
      recipe's whole attribute vector — proportionally, preserving the
      recipe's ingredient ratios. This is what lets the optimizer
      fine-tune totals without inventing odd food combinations. The
      multiplier is a continuous quantity, integer-scaled per decision
      #15 like any other continuous decision variable.
    - **Granularity per recipe.** Whether a recipe's multiplier is
      continuous or must land on discrete steps (e.g. only half-serving
      increments) is declared per recipe, mirroring decision #9's
      per-food continuous/discrete granularity — some recipes make
      sense scaled smoothly, others don't.
    - **Serving-size cap retargeted from decision #16.** The soft
      per-slot quantity cap now applies to a recipe's serving
      multiplier instead of a raw food's quantity: every recipe
      declares a `max_serving_multiplier`, penalized softly like any
      other constraint if exceeded — same mechanism, same rationale, as
      decision #16.
    - **Ingredient-level totals stay fully derivable.** Because a
      recipe's composition is fixed and known, "how much chicken was
      served this horizon" is still a computable linear expression (sum,
      across every slot/recipe containing chicken, of that slot's
      recipe-used indicator × multiplier × chicken's fixed quantity in
      that recipe) — moving to recipes as the selection unit doesn't
      lose ingredient-level visibility, it's just derived rather than
      directly selected. Decision #23 builds ingredient-level variety on
      this.

23. **Variety (resolves open question #8) operates over groups, at
    three levels, counted per occurrence.** Generalizes decision #10 now
    that recipes (decision #22) are the selection unit.

    - **Recipe-level.** "Don't use the same recipe more than N times
      across the horizon" — the direct case, using the recipe-used
      indicator from #22.
    - **Ingredient-level.** "Don't overuse chicken across all recipes" —
      a derived group: every recipe containing that ingredient
      contributes to one shared usage count, using the linear
      derivation from decision #22's last point.
    - **Tag/category-level.** "Alternate meat and vegetarian meals" —
      recipes carry optional user-defined tags (e.g. `meat`,
      `vegetarian`, `vegan`); a group is every recipe sharing a tag,
      again a shared usage count.
    - All three are the same generic weighted-cap mechanism (decisions
      #10/#6/#17) applied to different groupings of the same underlying
      recipe-used indicators — no separate variety concept per level. A
      single recipe with no tags is just a group of one, so recipe-level
      variety is a special case, not a different mechanism.
    - **Counting rule.** A group's usage count increments once per
      **occurrence** — once per `(day, slot)` where a group-member
      recipe was selected — so the same recipe (or two different
      recipes in the same tag group) appearing in both breakfast and
      dinner on one day counts as two uses, not one. This directly
      reflects monotony: eating the same thing twice in a day is more
      repetitive than once.

24. **Reference scale, solve-time budget, and `solve_status` reporting.**
    Resolves open question #9 from [`open-questions.md`](open-questions.md).

    - **Reference scale.** The engine is designed and tested to
      comfortably solve to proven optimality within the default time
      budget at: up to **200 recipes** in the catalog, a **14-day**
      horizon, and **3 slots/day** (up to 8,400 recipe×slot×day "used
      here" binaries, decision #22, plus one serving-multiplier
      variable each). This isn't a hard cap enforced by the code —
      larger inputs are still accepted — it's the benchmark the test
      suite and default timeout are chosen against. Handling larger
      inputs well is a welcome bonus, not a requirement, for v1.
    - **Solve-time budget.** `PlanRequest` gets an optional
      `solve_time_limit` (default **30 seconds**, user-overridable),
      passed to CP-SAT as a wall-clock cutoff.
    - **`solve_status` on the result.** Every `Plan` result reports which
      of these applied: `OPTIMAL` (solved and proven best within the
      budget), `FEASIBLE` (time limit hit, but a usable plan was found —
      not proven best), `INFEASIBLE` (proven no hard-constraint-satisfying
      plan exists — see decision #14), or a distinct timeout-with-nothing
      case when the limit is hit before any feasible plan is found at
      all. Callers can tell a proven-best plan from a "good enough for
      now" one.

25. **Solver determinism: fixed seed and single-threaded CP-SAT, plus a
    mix of exact-output and property-based tests.** Resolves open
    question #10 from [`open-questions.md`](open-questions.md).

    - **Pin CP-SAT's determinism knobs.** A fixed random seed and
      `num_search_workers=1` (single-threaded search) make a given model
      solve to the same result every run on a given OR-Tools version —
      this is close to free and removes most run-to-run nondeterminism.
      It does not, by itself, give a *documented* tie-breaking rule for
      which of several equally-optimal plans is returned — just a
      reproducible one.
    - **No invented tie-breaking rule.** Defining one (e.g. "prefer
      lower total quantity," "prefer alphabetically-first recipe") would
      add real modeling complexity for little payoff, since it's rarely
      something a user-facing decision actually depends on. Not pursued.
    - **Two test styles, used where each fits:**
      - **Small, deliberately-designed scenarios** (few recipes, short
        horizon, an objective with a clear unique optimum — chosen so no
        plausible tie exists) assert the **exact plan output** directly.
      - **Larger or tie-plausible scenarios** assert on **properties**
        instead: all hard constraints hold, the objective/penalty value
        matches the expected optimum, `solve_status` (decision #24) is
        as expected, specific attributes/recipes fall within expected
        bounds — without pinning down the exact plan contents.
    - Both styles coexist in the test suite (decision #12); which one
      applies is a per-test-scenario design choice, not a global rule.

26. **Plan pivoting: re-plan mid-horizon around what's already been
    cooked and eaten.** Driven by the user story: *"As a user, I want to
    pivot a meal plan after having cooked one or more of the meals in
    it, so I'm not locked into an already generated plan."* Example: a
    two-week plan exists; one meal was cooked yielding three portions,
    one eaten and two stored in food boxes; the user's schedule then
    changes and they need to re-generate or re-schedule — with the
    stored boxes counted as part of the new plan.

    Pivoting is **not a new solver mode**. It's a new kind of
    `PlanRequest` input to the same single-MILP engine (decision #13):
    a re-plan is a fresh solve over the remaining horizon, seeded with
    two extra pieces of state — *history* and *inventory*.

    - **History: a new slot kind, `consumed`** (extends decision #19's
      `generated` / `external` / `absent`). A `consumed` slot is a past
      slot that was actually eaten. Like `external` it is fixed and
      contributes no decision variables; its attribute vector is added
      as a constant to day and horizon totals. Unlike `external` it also
      records which recipe (and multiplier) was eaten, so it **counts
      toward variety groups** (decision #23) and toward ingredient-level
      totals. Day-scoped constraints are not evaluated for fully-past
      days (they can't be changed); **horizon-scoped constraints still
      span the whole original horizon** and include consumed slots, so
      "average sugar ≤ 50g/day over the two weeks" stays honest across
      a pivot rather than silently resetting.
    - **Inventory: stored portions as selectable, fixed-attribute
      items.** A `StoredPortion` group is `(recipe, attribute vector per
      portion, count_available, optional use_by_day)`. The attribute
      vector is captured when the batch was cooked (per-portion
      quantity at the cooked multiplier), not re-derived from the
      current recipe/food data, so editing a food later doesn't
      retroactively change a meal that already exists. Cooking a batch
      is recorded as a `CookedBatch` (recipe, multiplier, portions
      yielded, portions eaten, portions stored); the stored remainder
      becomes inventory.
    - **How the optimizer uses inventory.** Each `generated` slot may be
      filled by either a catalog recipe (decision #22) *or* a stored
      portion. Stored portions add a binary "portion group G used in
      this slot" indicator per slot (no serving-multiplier variable —
      the amount is fixed at one portion), with a per-group cap
      `Σ used ≤ count_available` and, if `use_by_day` is set, the
      indicator is forced to 0 for slots after that day (hard — food
      safety). Stored portions count toward variety groups under their
      source recipe, exactly like a freshly-planned occurrence.
    - **Use stored food first: a default soft constraint.** Same
      mechanism as variety (#10/#23) and the serving cap (#16): every
      stored portion left unused at the end of the horizon costs
      `weight × (unused portions / count_available)` (decision #17
      normalization), default weight high but not hard, overridable per
      group (e.g. a portion near its `use_by_day` can carry a higher
      weight). Soft by default so a pivot is never infeasible just
      because the user's new schedule can't fit all leftovers; a caller
      can set it to hard (relaxable per #14) to demand "must eat the
      boxes".
    - **Two pivot intents, both expressible as requests:**
      1. *Re-generate* — new slot configuration (decision #19), new or
         changed constraints, solve over the remaining horizon with
         history + inventory. The prior plan's uncooked meals are simply
         discarded.
      2. *Re-schedule* — keep the previously planned but uncooked
         recipes and just move them. Expressed as an optional
         `keep_planned` list on the request: recipes (with multipliers)
         the new plan should still contain, each a soft "include
         exactly once" requirement with its own weight (hard on request).
         Placement is left to the optimizer. Same mechanism as the
         stored-portion preference; no separate scheduler.
    - **Ownership of the "what happened" record.** v1 is library-only
      (decision #12) with no persistence, so the engine never mutates a
      plan. The caller passes `history` and `inventory` into a new
      `PlanRequest`; a thin helper, `Plan.pivot_request(as_of_day,
      cooked_batches, eaten)`, builds the follow-up request from a prior
      `Plan` plus what actually happened. Persisting that record is
      deferred with the rest of persistence.
    - **Solve cost.** A pivot shrinks the free variable set (fewer
      remaining `generated` slots) and adds only a handful of stored-
      portion binaries per slot, so it stays well inside decision #24's
      reference scale.
    - **Not covered here:** *planning* batch cooking in the first place
      (the optimizer choosing to cook once and eat across several
      slots). v1 plans one recipe per slot; the pivot story only needs
      to *ingest* leftovers that already exist. Deliberately-planned
      leftovers are listed in `future-features.md`. Open details —
      cost accounting for already-paid portions, shelf-life defaults,
      partial portions — are tracked as open questions #11-#13 in
      [`open-questions.md`](open-questions.md).

27. **Ingredient inventory ("pantry") with expiry: the plan consumes
    stock before it spoils.** Driven by the requirement: *the app should
    help the user manage the ingredients they have at home, and meal-plan
    generation should select recipes that use those ingredients — more
    precisely, it should make sure ingredients are used before they
    expire.*

    Like pivoting (#26), this is **not a new solver mode**: it is more
    `PlanRequest` input to the same single-MILP engine (#13) plus a small
    in-memory management API. The raw-ingredient store is called the
    **pantry**, to keep it distinct from #26's `inventory` of already
    *cooked* `StoredPortion`s.

    - **Data model.** A `PantryLot` is `(food, quantity, expires_on?,
      acquired_on?)`. Quantity is in the food's own unit (#9). A food
      can have several lots with different expiry dates (e.g. two milk
      cartons). `expires_on` is the last day the lot is safe to eat
      (inclusive); omitted means non-perishable (dry goods, tins). The
      request also gets a `start_date` (calendar date of day 0), required
      whenever any lot has `expires_on`, since horizon days are otherwise
      only indices.
    - **Demand, usage, purchase.** For each food `f` and day `d`, recipe
      choices (#22) already determine demand `D[f,d]` as a linear
      expression (Σ over slots of recipe-used × multiplier × the
      recipe's fixed quantity of `f`). New continuous variables
      `use[lot,d] ≥ 0` say how much of a lot is eaten on day `d`:
      - `Σ_d use[lot,d] ≤ lot.quantity` (can't use more than owned),
      - `use[lot,d] = 0` for any `d` after `lot.expires_on` — **hard**,
        food safety, same posture as `use_by_day` in #26,
      - `Σ_lot use[lot,d] ≤ D[f,d]` per food and day, and
        **`buy[f,d] = D[f,d] − Σ_lot use[lot,d]`** is the quantity that
        must be bought fresh. Running out is never infeasible: the
        shortfall is simply purchased. Usage is tracked per day, not per
        slot; v1 assumes ingredients are used on the day they're eaten
        (no cook-ahead, consistent with the "not covered" note in #26).
    - **Use-before-expiry: a default soft constraint.** Same mechanism
      as variety (#10/#23), the serving cap (#16) and stored portions
      (#26). For each lot that expires within the horizon plus a
      `waste_lookahead_days` window (default 3), the unused remainder
      costs `weight × (unused / lot.quantity)` (#17 normalization), with
      a default weight high but not hard, overridable per lot or per food.
      Lots that expire later than that window, and lots with no expiry,
      carry no waste penalty. Soft by default because a lot is sometimes
      unusable in any recipe (so hard would often be infeasible); a
      caller may set it hard (relaxable per #14) per lot, e.g. for
      anything it considers must-use. Lots already expired as of
      `start_date` are excluded from the solve and listed in the report.
    - **Pantry stock should look cheap: purchase-only cost accounting.**
      Food already at home is a sunk cost. Attributes flagged
      `accrues_on: purchase` (default for `cost`; resolves the cost half
      of open question #11 for raw ingredients) are totalled from
      `buy[f,d]` at the food's per-unit price, not from recipe-derived
      totals. Nutrient-style attributes stay recipe-derived and are
      unaffected. So a recipe built from stock costs ~0 against a budget
      constraint — this is the *pull* toward pantry recipes, and the
      waste penalty is the *push* toward the soonest-expiring ones.
      Both are needed: without the waste term a non-binding budget would
      leave the optimizer indifferent to spoilage.
    - **Interplay with #26.** Pantry and pivots compose: when
      `Plan.pivot_request` records a `CookedBatch`, the batch's
      ingredient quantities are deducted from the pantry lots
      (earliest-expiring lot first) before the next solve. Stored
      portions (#26) use the same expiry-hard / waste-soft rules, just at
      the cooked-meal level.
    - **Outputs.** `Plan` gains a `pantry_report`: per lot, quantity used
      and quantity left unused with its expiry (i.e. predicted waste),
      lots excluded as already expired, and the aggregate `buy` list per
      food, which is a shopping list for free.
    - **Management API (in-memory, no persistence).** The v1 library
      (#12) offers a plain `Pantry` object: `add(lot)`,
      `remove(lot_id)`, `adjust(lot_id, delta)`, `expiring_within(days,
      as_of)`, `expired(as_of)`, and `apply_cooked(batch)`. It is a
      value type the caller owns and passes into `PlanRequest`.
      *Persisting* it, and any UI/CLI around it, remain deferred with
      the rest of persistence and UI (see `future-features.md`).
    - **Solve cost.** Adds `lots × days` continuous (integer-scaled per
      #15) usage variables, only for foods that appear in some recipe.
      Reference scale (#24) extends to **≤150 lots**; the rest of the
      model is unchanged.
    - Open details — shelf life after opening, package sizes, staples,
      and best-before vs. use-by — are open questions #15-#18 in
      [`open-questions.md`](open-questions.md).

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
   Also model decision #26's pivot types: `consumed` slot kind,
   `CookedBatch`, `StoredPortion`, `keep_planned`, and decision #27's
   `PantryLot`, `Pantry`, `start_date`, `pantry_report`, and the
   `accrues_on` attribute flag.
3. Choose the specific optimization library (OR-Tools vs PuLP vs Pyomo)
   and confirm it installs cleanly in the target environment.
4. Write the full architectural design doc (per
   `superpowers:brainstorming`), get it approved section by section,
   commit it, then hand off to `superpowers:writing-plans` for an
   implementation plan.
5. Implement the core engine with `superpowers:test-driven-development`.
