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

3. **~~No upper bound on per-ingredient quantity per slot.~~ RESOLVED** — see
   design doc decision #16 (soft cap via the same weighted-constraint
   mechanism as variety, required per-ingredient `max_serving_size`).

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
   RESOLVED** — see design doc decisions #22 (recipes, not raw ingredients,
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

13. **~~Partial portions and uneven portions.~~ RESOLVED** — see design
    doc decision #30 (whole portions only; caller re-records via a
    new group, `StoredPortion.split` helper).

14. **~~Re-plan horizon boundary.~~ RESOLVED** — see design doc
    decision #31 (`as_of = (day, slot)`; earlier slots are history,
    later `generated` slots are re-planned).

## Raised by the pantry/expiry requirement (decision #27)

15. **~~Best-before vs. use-by.~~ RESOLVED** — see design doc decision
    #27 (per-lot `expiry_kind: use_by | best_before`; `use_by` hard,
    `best_before` soft penalty after the date).

16. **~~Shelf life after opening / freezing.~~ RESOLVED** — see design
    doc decision #29 (`shelf_life_after_opening_days` on ingredients,
    `opened_on` on lots; freezing is a caller override).

17. **Package sizes when buying. DEFERRED** (discussed, not decided; see also decision #32, which
    adds the `Product` concept these options build on;
    revisit before the shopping-list feature). `buy[f,d]` (#27) is
    continuous/discrete per the ingredient's granularity (#9), but real
    purchases come in packs (a 500 g bag, a 6-pack). Options discussed:
    - **A. Raw quantities only.** Report exact `buy` amounts. No model
      change, no new inputs. Cons: list isn't what you'd actually buy;
      cost is understated (750 g costed as 750 g, but two 500 g bags
      are paid for).
    - **B. Round up in the report.** Optional per-ingredient `pack_size`;
      after solving, round each ingredient's horizon total up to whole packs.
      Realistic list, model unchanged. Cons: optimizer is blind to
      packs (won't plan to finish a partly used pack); budget
      constraints use unrounded cost; rounding is per ingredient over the
      whole horizon, not per shopping trip.
    - **C. Packs in the model.** Integer pack counts in the MILP; the
      unused remainder becomes a pantry lot. Only option with honest
      cost and leftover-aware planning. Cons: extra integer variables,
      shelf-life rules for derived lots (#29), less predictable solve
      time against the #24 reference scale, and entanglement with
      timing questions (#19, one-trip vs. multiple shopping trips).
    - **Current lean:** A for v1, with an optional `pack_size` field on
      ingredients reserved; B later as pure post-processing; C as its own
      feature.
    - **Questions that would settle it:** does the user shop once for
      the whole plan or top up during the week? Is budget accuracy
      important, or is the plan mainly about nutrition and avoiding
      waste?
    - **Why deferred:** no v1 work depends on it; options A-C all
      leave the model in decision #27 unchanged.

18. **~~Staples and unlimited items.~~ RESOLVED** — see design doc
    decision #33 (no staple concept in v1; recorded as a possible
    feature in `future-features.md`).

19. **~~Time-varying demand within a day vs. cook-ahead.~~ RESOLVED** —
    see design doc decision #34 (eat-day semantics in v1; cook-ahead
    deferred with planned batch cooking).

20. **~~Which product to buy when an ingredient has several.~~
    RESOLVED** — see design doc decision #35 (post-solve selector that
    picks products under the user's constraints; in-model selection
    deferred).

21. **~~Unit conversion and recipe input units.~~ RESOLVED** — see
    design doc decision #36 (optional per-ingredient conversion table,
    applied at recipe load time; recipes are lists of
    `IngredientAmount`s).

## Raised by implementing the meal planner core (slice A)

Found while building and reviewing `meal_planner/` against
[`2026-10-13-meal-planner-core-design.md`](2026-10-13-meal-planner-core-design.md).
None blocks slice A; each was given a provisional answer during
implementation.

22. **Days with no generated slot and day-scope minimums. OPEN.** A day
    whose slots are all `absent` (eating out) still gets every day-scope
    constraint. A day minimum (e.g. kcal >= 1800) then makes STRICT mode
    infeasible if hard, or adds a constant, unavoidable penalty if soft.
    The spec does not say whether day constraints should skip such days.
    - **Current behaviour:** constraints apply to every day; the
      conflict report names the absent day correctly.
    - **Options:** skip day constraints on days with no generated slot;
      skip only minimums; or leave it to the caller (who can omit the
      day or loosen the bound). Slice B's `external` slots (decision
      #19, per-day slot kinds) may settle it, since an eaten-out meal
      could contribute declared totals.

23. **Bounds more precise than the attribute's precision. OPEN.** The
    model rounds bounds to the attribute's precision (decision #15,
    integer scaling), but the violation report compares against the
    exact bound. With kcal precision 0 and `min=1000.00004`, the
    objective is 0 yet the report lists a 0.00004 kcal violation.
    - **Options:** round the reported bound the same way as the model,
      or reject bounds with more digits than the scale allows.

24. **Test gap: `normalization_reference`. OPEN.** No test exercises it,
    including the plan's interpretation that for `average_per_day` the
    reference is per day and multiplied by the number of days. Add one
    exact scenario.

25. **Unused helper `scaling.fits_int64`. OPEN.** The builder checks
    headroom against `HEADROOM = 2**62` instead. Remove it or use it.

26. **Extreme or odd numeric input. OPEN, low priority.** A finite but
    huge-exponent value such as `"1e999999999"` may still raise a raw
    `decimal` error instead of `PlanRequestError`. `AttributeDef`
    precision now rejects a whole-number float such as `3.0`; confirm
    that strictness is wanted.

27. **Calories are a function of protein, fat and carbohydrates. OPEN
    (user note).** Energy is not an independent attribute: roughly
    4 kcal/g protein, 9 kcal/g fat and 4 kcal/g carbohydrate (plus
    7 kcal/g alcohol and about 2 kcal/g fibre). Today `kcal` is an
    ordinary attribute (decision #7, user-defined attributes) entered per
    ingredient, so it can disagree with the macros.
    - **Options:** keep kcal entered by hand (label values are often
      measured, not computed); add derived attributes defined as a
      linear formula over others, computed at recipe load time like
      recipe totals (decision #22, recipes as the meal unit); or check
      entered kcal against the macros and warn on large gaps.
    - **Note:** a derived attribute stays linear, so it costs the
      solver nothing extra.

28. **Drop `min_meals_per_day`; allow days with no meals. OPEN (user
    note).** The user finds the per-day meal floor (decision #20,
    configurable `min_meals_per_day`) arbitrary. A plan must be able to
    have one or more days with no scheduled meals: on those days the
    person still eats, but food they do not choose or buy (restaurant,
    hotel, travelling).
    - **Tension:** decision #20 exists to stop the optimizer from
      meeting maximums by serving nothing (open question #6, the "eat
      nothing" solution). Without a floor, something else must guard
      against that, e.g. per-day minimums such as kcal or protein
      doing the work, or the user marking non-planned days explicitly
      as `absent`/`external` (decision #19, per-day slot kinds) so
      planned days can still require their meals.
    - **Related:** open question #22 (day-scope minimums on days with no
      generated slot). Settling #28 likely settles #22: a day with no
      planned meals should be exempt from, or get adjusted, day-scope
      constraints.
    - **Current behaviour (slice A):** `min_meals_per_day` defaults to
      every generated slot; setting it to 0 or making every slot
      `absent` already gives an empty day, but day-scope minimums then
      fail on it (see #22).

## Status

Items 1-16 and 18-21 are resolved (decisions #14-#36 in the design
doc). #17 (package sizes) is deferred, with options and a lean
recorded above. #22-#26, raised while implementing slice A, and #27-#28, user
notes, are open and recorded above.
Next: the concrete data model/constraint DSL step in that doc's "Next
steps."
