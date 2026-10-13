# Meal Planner Core (slice A) — Data Model and Model Builder

**Status:** Design approved section by section; awaiting spec review.

**Path:** Architectural (new subsystem, no existing engine code).

**Context:** Implements the first vertical slice of the architecture in
[`2026-09-15-meal-optimizer-design.md`](2026-09-15-meal-optimizer-design.md)
(decisions #1-#36). Introduces decisions #37-#39 there (tags, multiplier
bounds, horizon `aggregate`). Library only (decision #12): no CLI,
persistence or UI.

## Scope of this slice

In scope:

- Ingredients, recipes and `IngredientAmount`s, with recipe attribute
  totals derived from ingredients (decision #22).
- Tags on ingredients, derived onto recipes, plus manual recipe tags;
  tag filters (`exclude_tags`, `require_tags`) applied before solving.
- `generated` and `absent` slots; per-day `min_meals_per_day` floor
  (decisions #19, #20).
- Day-scoped and horizon-scoped constraints, hard and soft, with
  `min`/`max` ranges (decisions #5, #6, #21), normalized weights
  (#17), and the same-valued day guard-rail for horizon averages (#18).
- Continuous and discrete recipe serving multipliers, integer-scaled
  (#15), with the soft serving cap (#16, #22).
- STRICT mode with a minimal conflict report (#14), `solve_status`
  (#24), a violation report, deterministic solving (#25).

Out of scope (later slices; types may reserve fields but nothing is
solved): RELAX mode, variety and tag-count constraints (#23),
`external` and `consumed` slots (#19, #26), pantry and expiry (#27-#31),
products and shopping (#32, #35), unit conversion tables (#36),
`accrues_on` behaviour other than "eaten" (#28).

## Section 1: Package layout

New top-level package `meal_planner/`, separate from the `lp_solver/`
toy. Tests in `tests/meal_planner/`, run with pytest; a `pyproject.toml`
declares `ortools` and `pytest`.

| Module | Purpose | Depends on |
|---|---|---|
| `domain.py` | `AttributeDef`, `TagDef`, `Ingredient`, `IngredientAmount`, `Recipe`; derives recipe attribute totals and tags | nothing |
| `request.py` | `Slot`, `Day`, `Constraint`, `PlanRequest`; validation | `domain` |
| `scaling.py` | Real number to integer at a fixed precision and back (#15) | nothing |
| `ir.py` | Solver-neutral model: `Var`, `LinExpr`, `LinConstraint`, `Objective`, guard switches. No solver imports | nothing |
| `builder.py` | `PlanRequest` to `ir.Model` | `request`, `scaling`, `ir` |
| `backends/cpsat.py` | The only module importing OR-Tools; translates, solves (fixed seed, one worker, time limit), returns raw values and the infeasibility core | `ir` |
| `result.py` | `Plan`, `SlotAssignment`, `ViolationReport`, `ConflictReport`, `SolveStatus` | `domain` |
| `planner.py` | `plan(request) -> Plan`, the one public entry point | all |

The solver-neutral `ir` layer keeps the backend swappable (decision #15).

## Section 2: Data types

All are frozen dataclasses validated at construction.

- **`AttributeDef(name, precision=3, accrues_on="eaten")`.** A user-defined
  tracked quantity (#7). `precision` is the number of decimal places kept
  when scaling to integers. `accrues_on` (#28) is stored and validated but
  has no effect in this slice. Defaults: `cost` uses `purchase`, all
  others `eaten`; in this slice all behave as `eaten`.
- **`TagDef(name, derive)`**, `derive` is `"all"` or `"any"` (decision #37).
  `all`: a recipe has the tag only if every ingredient has it (`vegan`,
  `organic`). `any`: a recipe has the tag if any ingredient has it
  (`contains-nuts`).
- **`Ingredient(name, unit, attributes, tags)`.** `attributes` are per-unit
  values for each attribute (including `cost`, an ordinary attribute in
  this slice; price moves to `Product` with decision #32 in a later
  slice). `tags` is a set of declared tag names.
- **`IngredientAmount(ingredient, quantity)`**, in the ingredient's unit
  (unit conversion is decision #36, later).
- **`Recipe(name, items, extra_tags, multiplier_step, min_multiplier,
  max_multiplier)`.** Attribute totals are the sum of item quantity times
  ingredient attribute value. Tags are derived from ingredients per
  each tag's `derive` rule, then `extra_tags` are added; there is no
  mechanism to remove a derived tag. `multiplier_step` is continuous
  or a discrete step (e.g. 0.5). Defaults and bounds (decision #38):
  `min_multiplier=0.5`, `max_multiplier=2.0` as the soft cap
  (#16, #22), and a hard ceiling of 3x the soft cap. All overridable.
- **`Slot(kind)`**, kind `generated` or `absent`. **`Day(slots,
  min_meals_per_day=None)`**; `None` means all generated slots (#20).
- **`Constraint(name, attribute, scope, aggregate, min, max, hard,
  weight, weight_below, weight_above, normalization_reference,
  add_day_guardrail, guardrail_weight, relaxable)`.**
  - `scope` is `day` (checked per day) or `horizon`.
  - `aggregate` (decision #39), horizon only: `total` (the sum over the
    horizon) or `average_per_day` (a per-day figure; the bound is
    multiplied by the number of days, counting absent days too). The
    guard-rail (#18) applies only to `average_per_day`.
  - `min` and `max` are optional, at least one required (#21).
  - `weight` applies to both sides; `weight_below` / `weight_above`
    override per side. Ignored for hard constraints.
  - `normalization_reference` overrides the default denominator (#17).
  - `add_day_guardrail` defaults to true; `guardrail_weight` defaults to
    half the constraint's weight.
  - `relaxable` is stored but unused until RELAX mode (#14).
- **`PlanRequest(attributes, tags, recipes, days, constraints,
  exclude_tags, require_tags, solve_time_limit=30)`.** `exclude_tags` and
  `require_tags` filter the recipe catalog before the model is built.
- **`Plan`.** `solve_status`, objective value, per-slot assignment
  (recipe and multiplier), per-slot, day and horizon attribute totals,
  `ViolationReport`, and `ConflictReport` (only when STRICT is infeasible).

## Section 3: Building the model

1. **Scaling (#15).** A recipe's attribute total is computed once from its
   ingredients and rounded once to the attribute's precision. Multipliers
   are held in thousandths. A slot total in integer units is the sum of
   multiplier ticks times the recipe's integer attribute value; dividing
   by the matching scale converts back. All integer arithmetic is exact
   inside the solver.
2. **Variables.** Per generated slot and recipe: a "used" binary and an
   integer multiplier, 0 when unused, otherwise between the minimum and
   the hard ceiling (discrete recipes: a whole number of steps). At most
   one recipe is used per slot.
3. **Day floor (#20).** The number of served slots in a day is at least
   `min_meals_per_day`. Hard.
4. **Totals.** Day total: sum over that day's slots (`absent` slots
   contribute nothing). Horizon total: sum over days. For
   `average_per_day`, the bound is multiplied by the number of days.
5. **Hard constraints (#14).** Each hard bound becomes a linear constraint
   guarded by its own switch. STRICT mode requires all switches on; on
   infeasibility CP-SAT's assumption core is read, then minimized by
   dropping each member in turn and re-solving. The report names the
   constraint (and the day, for day scope).
6. **Soft constraints (#17).** Each side of a range gets a non-negative
   slack for the miss. The penalty is the side's weight times slack divided
   by the reference (the violated bound, or `normalization_reference`).
   Exact fractions are scaled by a large fixed factor to integer
   coefficients; the builder checks int64 headroom and raises
   `ModelTooLargeError` otherwise.
7. **Guard-rail (#18).** Each `average_per_day` constraint with
   `add_day_guardrail` gets a day-scoped soft copy with the same bounds and
   `guardrail_weight`. It is soft even if the horizon constraint is hard.
8. **Serving cap (#16, #22).** A multiplier above a recipe's soft maximum
   costs weight (default 1.0, per-recipe override) times the excess,
   divided by the maximum.
9. **Solving (#24, #25).** CP-SAT, single worker, fixed seed, time limit
   from the request. Status is `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, or a
   distinct timeout-with-nothing-found status.
10. **Output.** Chosen recipe and multiplier per slot, day and horizon
    totals, and a violation report listing each missed soft bound with
    the amount and percent.

Multiplier precision is thousandths; objective scaling is as in item 6.

## Section 4: Validation, errors and tests

**Validation at construction.** All problems are collected and raised
together as one `PlanRequestError` (a `ValueError`). It checks:

- unknown or duplicate names (attributes, tags, ingredients, recipes);
- `min` greater than `max`; negative weights;
- recipes with no ingredients; multiplier bounds not ordered minimum,
  soft maximum, ceiling; for discrete recipes, a minimum that is not a
  multiple of the step;
- precision outside a sane range;
- a zero bound with no `normalization_reference` (decision #17 has no
  denominator for it);
- `min_meals_per_day` larger than the day's number of generated slots;
- no recipes left after `exclude_tags` and `require_tags`.

**Errors versus outcomes.** Infeasible and timeout are `Plan` statuses,
not exceptions. Exceptions cover invalid input and `ModelTooLargeError`.

**Tests (TDD, decisions #12 and #25):**

| Layer | Checks |
|---|---|
| Scaling | Round trip (scale up then back returns the original, with one rounding for values beyond the precision), precision, overflow guard |
| Domain | Recipe totals, tag derivation (`all` and `any`), `extra_tags`, validation errors |
| Builder | The solver-neutral model's structure, no solver involved |
| Backend | Tiny hand-solved models |
| End-to-end, exact | Small, tie-free scenarios asserting the exact plan: soft compromise and violation amounts, STRICT conflict set, guard-rail against one-day spikes, day floor, absent slots, discrete multipliers, serving cap, tag exclusion |
| End-to-end, property | Larger scenarios; totals recomputed independently in exact arithmetic to confirm hard constraints and objective |
| Reference scale | Slow, opt-in benchmark at decision #24's size (200 recipes, 14 days, 3 slots); records the solve status. Whether it proves optimality in 30 seconds is unknown until measured |

## Later slices (not designed here)

Variety and tag-count constraints, RELAX mode, `external` and `consumed`
slots, pantry and expiry, pivots, products and shopping, unit conversion.
Each gets its own spec, plan and implementation cycle.
