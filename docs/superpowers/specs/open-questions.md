# Meal Plan Optimizer — Open Questions & Holes

Found during a design review of
[`2026-09-15-meal-optimizer-design.md`](2026-09-15-meal-optimizer-design.md)
after architectural decisions #1-13 were made. Being resolved one at a
time (see item 1 below for the first) before or during the data-model/DSL
step in that doc's "Next steps"; each resolution becomes a new numbered
decision in the design doc, and the corresponding item here is struck
through with a pointer to it.

## Critical — block writing a correct engine

1. **~~No story for infeasible hard constraints.~~ RESOLVED** — see
   design doc decision #14 (solve modes, automatic minimal relaxation,
   `relaxable` flag).

2. **~~CP-SAT doesn't natively support continuous variables.~~
   RESOLVED** — see design doc decision #15 (CP-SAT with fixed-precision
   integer scaling, kept behind a swappable backend interface).

3. **~~No upper bound on per-food quantity per slot.~~ RESOLVED** — see
   design doc decision #16 (soft cap via the same weighted-constraint
   mechanism as variety, required per-food `max_serving_size`).

## Important — will cause confusing/degenerate output

4. **~~Weights aren't unit-normalized.~~ RESOLVED** — see design doc
   decision #17 (deviation normalized as percent of the violated bound,
   with an override reference for zero/awkward targets).

5. **~~Horizon-average constraints don't bound day-level spikes.~~
   RESOLVED** — see design doc decision #18 (auto-generated same-valued
   day-level guard-rail constraint, overridable per constraint).

6. **~~Trivial "eat nothing" solution isn't guarded against.~~
   RESOLVED** — see design doc decisions #19 (per-day slot config:
   generated/external/absent) and #20 (configurable, per-day
   `min_meals_per_day` floor on served `generated` slots).

7. **~~Range constraints don't fit the sketched DSL shape.~~ RESOLVED**
   — see design doc decision #21 (`Constraint` gets explicit `min`/`max`
   fields, per-side deviation normalized per decision #17, optional
   `weight_below`/`weight_above` override).

8. **~~Discrete-unit "same food" counting for variety is ambiguous.~~
   RESOLVED** — see design doc decisions #22 (recipes, not raw foods,
   are now the `generated`-slot composition unit) and #23 (variety
   generalized to recipe/ingredient/tag-level groups, counted once per
   occurrence — i.e. per day+slot, not deduplicated across slots in the
   same day).

## Worth flagging, lower severity

9. **~~No scalability target.~~ RESOLVED** — see design doc decision #24
   (reference scale: 200 recipes × 14-day horizon × 3 slots/day; default
   30s solve-time budget; `solve_status` reporting on the result).

10. **~~Solver determinism for tests.~~ RESOLVED** — see design doc
    decision #25 (fixed seed + single-threaded CP-SAT; small
    tie-free scenarios assert exact output, others assert on
    properties/objective value/`solve_status` instead).

## Raised by the plan-pivot user story (decision #26)

11. **Cost accounting for already-paid food.** A stored portion's cost
    was spent when the batch was cooked/bought, not when it's eaten.
    Counting it again against a horizon budget double-charges; counting
    it as 0 hides real spend. Leaning: attributes get an
    `accrues_on: cooked | eaten` flag (cost → `cooked`, nutrients →
    `eaten`), so cost lands in history on the cooking day and stored
    portions contribute 0 cost when eaten. Needs a decision before the
    data model is final.

12. **Shelf life.** Should a recipe carry a default `shelf_life_days`
    that auto-derives a stored portion's `use_by_day`, or is it always
    caller-supplied per batch? Also: does freezing change it?

13. **Partial portions and uneven portions.** Decision #26 treats a
    stored portion as exactly one fixed-size unit. If a user eats half a
    box, or batches yield uneven portions, do we model fractional
    inventory or require the caller to re-record it?

14. **Re-plan horizon boundary.** When pivoting mid-day (e.g. lunch
    eaten, dinner not), which slots are `consumed` vs re-plannable?
    Proposed: the caller passes `as_of` = (day, slot) and everything
    before it is history.

## Status

Items 1-10 are resolved (decisions #14-#25 in the design doc). Items 11-14 are open, from the plan-pivot story (decision #26).
Next: the concrete data model/constraint DSL step in that doc's "Next
steps."
