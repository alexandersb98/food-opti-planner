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

5. **Horizon-average constraints don't bound day-level spikes.**
   "Average ≤ 50g sugar/day over the week" is satisfiable by 350g on
   day 1 and 0g the rest of the week. Not prevented unless the user
   *also* adds a day-scoped bound — worth a documented modeling
   gotcha, maybe a recommended default day-level guard-rail alongside
   any horizon constraint.

6. **Trivial "eat nothing" solution isn't guarded against.** If every
   constraint is soft, the optimizer can rationally serve very little
   or nothing on some days if the weighted penalty for doing so is
   cheaper than eating enough — nothing forces a floor. Should there be
   a default hard minimum (e.g. calories > 0, or some minimum food
   volume) so it can't produce empty/near-empty days?

7. **Range constraints don't fit the sketched DSL shape.** "1800-2200
   kcal" needs either two constraints or a richer shape (min, max, and
   how deviation is computed on each side, possibly with different
   weights above vs below) — the `(attribute, comparator, target)` sketch
   in "Next steps" only has a single comparator/target.

8. **Discrete-unit "same food" counting for variety is ambiguous.**
   Does a food used in both breakfast and dinner on the same day count
   as one use or two toward the "used more than N times" cap? Not
   specified.

## Worth flagging, lower severity

9. **No scalability target.** No stated bounds on catalog size ×
   horizon × meals/day, and no solve-time budget or
   timeout/suboptimal-acceptance policy. Binary "used here" indicators
   per food×slot×day make the model grow fast; large catalogs over a
   month-long horizon could be slow to solve to proven optimality.

10. **Solver determinism for tests.** Decision #12 makes the test suite
    the only interface — but MILP solvers can return different (equally
    optimal) solutions across runs/versions when there are ties. Tests
    asserting exact plan output will be brittle unless there's a
    documented tie-breaking rule or fixed seed/determinism setting.
