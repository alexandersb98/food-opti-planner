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

11. **~~Cost accounting for already-paid food.~~ RESOLVED** — see design
    doc decision #28 (`accrues_on: purchase | cooked | eaten` per
    attribute).

12. **~~Shelf life.~~ RESOLVED** — see design doc decision #29
    (optional `shelf_life_days` on recipes, caller override wins,
    freezing is a caller override).

13. **Partial portions and uneven portions.** Decision #26 treats a
    stored portion as exactly one fixed-size unit. If a user eats half a
    box, or batches yield uneven portions, do we model fractional
    inventory or require the caller to re-record it?

14. **Re-plan horizon boundary.** When pivoting mid-day (e.g. lunch
    eaten, dinner not), which slots are `consumed` vs re-plannable?
    Proposed: the caller passes `as_of` = (day, slot) and everything
    before it is history.

## Raised by the pantry/expiry requirement (decision #27)

15. **~~Best-before vs. use-by.~~ RESOLVED** — see design doc decision
    #27 (per-lot `expiry_kind: use_by | best_before`; `use_by` hard,
    `best_before` soft penalty after the date).

16. **~~Shelf life after opening / freezing.~~ RESOLVED** — see design
    doc decision #29 (`shelf_life_after_opening_days` on foods,
    `opened_on` on lots; freezing is a caller override).

17. **Package sizes when buying.** `buy[f,d]` is continuous/discrete per
    the food's granularity (#9), but real purchases come in packs (a
    500 g bag, a 6-pack). Do shopping lists round up to packs, and does
    the leftover from a new pack become a new pantry lot the plan could
    use later in the horizon? v1 leaning: report raw `buy` quantities
    only; pack-rounding deferred (see `future-features.md`).

18. **Staples and unlimited items.** Water, salt, oil, spices: tracking
    stock is noise. Leaning: a per-food `staple: true` that exempts it
    from pantry accounting (always assumed on hand, cost ignored or
    flat), so it neither appears in `buy` nor needs a lot.

19. **Time-varying demand within a day vs. cook-ahead.** Decision #27
    assumes ingredients are consumed on the day the meal is eaten. A
    recipe cooked the evening before for tomorrow's lunch uses stock a
    day earlier, which matters for a lot expiring in between. Deferred
    together with planned batch cooking.

## Status

Items 1-10 are resolved (decisions #14-#25 in the design doc). Item 11 is resolved; items 12-14 are open, from the plan-pivot story (decision #26). Item 15 is resolved; items 17-19 are open, from the pantry/expiry requirement (decision #27).
Next: the concrete data model/constraint DSL step in that doc's "Next
steps."
