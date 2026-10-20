# Meal Plan Optimizer — Future Features & Alternatives Considered

Candidates deliberately deferred past v1. None of these require the v1
engine to be redesigned around them, but each would need its own design
pass before implementation.

**Note:** recipes/dishes as the meal-composition unit were originally
listed here as a deferred feature (v1 was scoped to raw-food buckets
only, design doc decision #1) but were promoted into v1 by decision #22
after design review — see decisions #1 and #22 in
[`2026-09-15-meal-optimizer-design.md`](2026-09-15-meal-optimizer-design.md).

## Deferred product features

- **Per-meal constraints.** v1 constraints apply at day or horizon scope
  only (decision #4). Constraining an individual meal slot (e.g. "dinner
  ≥ 30g protein") is a possible later extension.
- **External nutrition/price data import.** v1 uses a user-maintained
  local ingredient database only (decision #8). An importer from a public
  dataset (USDA FoodData Central, Open Food Facts, etc.) is a clean
  later addition.
- **UI.** Web, desktop, or mobile front end. None planned for v1.
- **Persistence.** Database, saved plans, user accounts. None planned
  for v1.
- **CLI.** v1 is a library only, driven by tests (decision #12).

- **Planned batch cooking / leftovers.** Decision #26 lets a pivot
  *ingest* leftovers that already exist, but v1 never plans them. A
  later extension would let the optimizer choose to cook a batch once
  (cost and effort charged once) and spread its portions across several
  slots or days, with shelf-life limits.

- **Pantry persistence and management UI.** Decision #27 defines an
  in-memory `Pantry` with add/remove/adjust/expiring-soon operations, but
  saving it between sessions, plus the screens/CLI for day-to-day
  stock-keeping, ride on the persistence and UI items above. Natural
  extras: barcode/receipt entry, "expiring soon" notifications, and
  suggesting a recipe for what is about to go off even when no plan is
  being generated.
- **Shopping list with pack sizes and store prices.** Decision #27 yields
  a raw per-ingredient `buy` quantity for free; rounding to purchasable pack
  sizes and carrying the pack leftovers forward as pantry lots (open
  question #17) is a later refinement.
- **Product selection inside the optimizer.** Decision #35 picks
  products after the meal plan is solved. A later version would add
  integer pack-count variables per product to the MILP so recipes and
  products are chosen together: honest cost, leftover-aware planning and
  budget constraints on real prices (open question #17, option C). Costs
  to design for: more integer variables, shelf-life rules for leftover
  lots, and solve time against the #24 reference scale.
- **Cook-ahead (separate cook day).** Decision #34 draws pantry stock on
  the eat day. A later feature, best built with planned batch cooking,
  would give a dish a cook day distinct from its eat day (per-recipe
  offset or per-slot prep day were the options discussed) so pantry
  draw-down and expiry checks use the cook day.

- **Staple ingredients.** Decision #33 treats every ingredient alike in
  v1. A later per-ingredient `staple: true` flag would mean "assumed
  always on hand" for things like salt, oil, spices and water: no pantry
  lots, never in the `buy` list, no waste penalty. Nutrients would still
  count either way (oil has calories). Options discussed for cost:
  charge it at eat-time from its per-unit price (keeps budgets honest
  for staples that are not negligible, like olive oil), or ignore it
  (simplest, fine for water, salt and spices). Leaning towards the
  former if built.

- **Constraints on selected days and dates (user request).** Today a
  day-scope constraint applies to every day of the plan (decision #39
  sets only day vs. horizon scope). The user wants a constraint to apply
  to chosen days only, for example:
  - one weekday ("only Mondays");
  - a set of weekdays ("Monday to Friday", "Saturday and Sunday");
  - specific calendar dates ("on 2 October").

  This needs the plan to know real dates, not just day indices: the
  request gets a `start_date` (calendar date of day 0), which decision
  #27 (pantry with lots and expiry dates) already introduces for expiry
  dates; each day's date and weekday follow from it. A constraint would
  then take an optional day selector (weekdays and/or dates; none means
  every day). Open points: whether horizon-scope constraints can also be
  restricted (e.g. "average over weekdays only", where
  `average_per_day` would divide by the number of selected days), and
  how a selector naming a date outside the plan is reported. It stays
  linear, so it adds no solver cost: the builder just emits the
  constraint for the selected days.

- **Configurable penalty shape for soft constraints, e.g. squared
  error (user request).** Today a missed soft bound costs
  `weight * miss / reference`: linear in the miss, and expressed as a
  fraction of the bound (decision #17, penalties as percent of the
  violated bound). The user wants to try a least-squares style instead,
  where the cost grows with the square of the miss, so one large miss
  costs more than several small ones adding up to the same total.
  - **Units:** squaring raw misses (10 g protein vs. 100 in cost) would
    not be comparable. Squaring the already normalized miss avoids this:
    `weight * (miss / reference)^2`, so a 10 % miss costs 0.01 whatever
    the unit.
  - **Configuration:** a penalty shape per constraint (or a request
    default), e.g. `linear` (today) or `squared`, possibly more later
    (dead zone, capped).
  - **Solver cost:** the model is linear today. A squared penalty is
    convex, so a piecewise-linear approximation (a few slack segments
    with rising slopes) keeps it linear and exact enough. CP-SAT can
    also model products of integers directly, but that tends to solve
    more slowly. Measure against decision #24's reference scale (200
    recipes, 14 days, 3 meals) before choosing.
  - **Open point:** squared penalties are harder to read in the
    violation report; report the miss and its percent as now, plus the
    penalty it cost.

## Alternative optimization approaches considered (not chosen for v1)

v1 uses a single MILP model per plan-generation call (decision #13:
option A). Two alternatives were sketched during design and set aside —
kept here in case v1's approach hits a wall (e.g. solve times become
impractical at large horizons/ingredient catalogs) and is worth revisiting:

- **Two-phase.** Solve day-level nutrient/cost totals first (ignoring
  meal structure), then distribute those totals across meal slots
  separately. Simpler individual models, but variety and cross-meal
  trade-offs end up split across two disconnected problems — added
  complexity without a clear payoff given per-meal constraints are out
  of scope for v1 anyway. Might become attractive if the single-model
  approach doesn't scale.
- **Metaheuristic (genetic algorithm / simulated annealing).** More
  flexible for nonlinear penalty shapes, but every constraint/attribute
  in this problem is linear (sum of per-unit value × quantity), so an
  exact/MILP solver is simpler to reason about and deterministic. Would
  only be worth reconsidering if a future extension introduces
  genuinely nonlinear objectives/constraints that a MILP can't express.
