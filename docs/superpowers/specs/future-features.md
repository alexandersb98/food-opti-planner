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
  local food database only (decision #8). An importer from a public
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
  a raw per-food `buy` quantity for free; rounding to purchasable pack
  sizes and carrying the pack leftovers forward as pantry lots (open
  question #17) is a later refinement.

## Alternative optimization approaches considered (not chosen for v1)

v1 uses a single MILP model per plan-generation call (decision #13:
option A). Two alternatives were sketched during design and set aside —
kept here in case v1's approach hits a wall (e.g. solve times become
impractical at large horizons/food catalogs) and is worth revisiting:

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
