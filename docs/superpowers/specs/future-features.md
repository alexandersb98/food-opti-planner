# Meal Plan Optimizer — Future Features & Alternatives Considered

Candidates deliberately deferred past v1. None of these require the v1
engine to be redesigned around them, but each would need its own design
pass before implementation.

## Deferred product features

- **Recipes/dishes as meal-composition units.** v1 works in raw-food
  buckets only (see design doc decision #1). A later mode would let the
  optimizer pick from a recipe library instead of/alongside raw foods.
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
