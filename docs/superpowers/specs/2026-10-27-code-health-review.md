# Code Health Review — 2026-10-27

A design review of the whole codebase (modularity, separation of concerns,
SOLID) after GUI slice 10 (recipe filters). State at review time: 605 Python
tests pass (1 skipped, benchmark opt-in); the web tests were not run.

**Verdict:** healthy. The boundaries between library, translation layer, API
and UI are clean and well tested. Nothing below needs a redesign; the items
are refactors to do before the server grows further. Each finding is
numbered so it can be referred to; when one is done, strike it through and
point to the commit or plan that fixed it, as in
[`open-questions.md`](open-questions.md).

## Strengths to keep

- **Solver isolation.** `meal_planner/ir.py` is a solver-neutral integer
  model (design decision #15); `meal_planner/backends/cpsat.py` is the only
  module that imports OR-Tools.
- **Builder split by concern.** `builder/choices.py` makes the variables and
  totals, `builder/limits.py` the bounds and objective terms, both writing
  into one `BuiltModel`; reading the answer back is `decoding.py`.
- **Self-validating domain types.** Frozen dataclasses check themselves in
  `__post_init__` and report every problem at once, so bad data never
  reaches the builder.
- **Narrow public surface.** `plan(request, stop)` is the library's one entry
  point; `meal_planner/__init__.py` exports exactly what callers need.
- **One-way dependencies.** `meal_planner` never imports `server`.
- **`server/translate.py`** is the single, pure mapping from database rows to
  library objects, tested rule by rule. `server/freeze.py` is likewise a
  separate step from solver result to stored snapshot.
- **App factory and DI.** `create_app(settings)` plus FastAPI dependencies
  (`DbSession`, `Running`) make the server easy to test.
- **Shared route helpers** live in `server/api/catalog.py` rather than being
  copied.
- **Frontend:** a typed API client generated from OpenAPI (tests fail when it
  is stale); logic kept in plain tested modules (`goals.ts`, `totals.ts`,
  `misses.ts`, `solve.ts`); loading shared through `useLoad`.

## Findings

Ordered by priority. 1 and 2 belong together and are the ones to do first.

### 1. The server has no service layer

**Partly done: the plan setup.** Its request fields (`PlanFields` and the
types in it), the checks Pydantic can't make (`plans.errors`,
`plans.filter_errors`, which return neutral `Problem`s the route turns into
422s) and the update of the stored rows (`plans.fill`) moved to
`server/plans.py`, tested without HTTP in `tests/server/test_plans.py`.
`server/api/plan.py` keeps the response models and the routes; the loading
moved to `server/queries.py` with finding 2.
The shared field types moved from `server/api/fields.py` to
`server/fields.py`, so `plans` depends on nothing in `api`. **Still to do:**
the orchestration of a solve in `server/api/solve.py` (`_read`, `_solve`).

The finding as written:

Route modules mix HTTP schemas, validation, persistence and orchestration.
`server/api/plan.py` (472 lines) holds the Pydantic models, about 150 lines
of cross-field validation (`_errors`, `_meal_errors`, `_skip_errors`,
`_minimum_errors`, `_goal_errors`, `_one_goal_errors`, `filter_errors`) and
the update logic (`_fill`, `_fill_meals`, `_fill_goals`, …, `_goal`). Every
new Plan page feature adds to this file.

**Proposal:** keep the routes thin (parse, call, answer). Move validation
and update of the plan setup to a module such as `server/plans.py` (or a
`server/services/` package), taking plain values and returning
`FieldError`s / rows, so it can be tested without HTTP.

### 2. ~~Route modules import each other~~ DONE

Done in commit 51d9887. The shared reads moved to `server/queries.py`: `queries.plan`
(was `plan.stored`, with the setup's defaults), `queries.recipes` (was
`recipes.loaded`) and `queries.plan_result` (the loading `plan_results.read`
did). `models.now` (was `plan_results.now`) gives the time stored. The
plan-result response models (`PlanResult`, `PlanResultSummary`, …),
`summary`, `response` and `read` moved to `server/api/results.py`, a shared
module like `catalog` and `errors`, as a solve answers with the plan it
made. No route module imports another now; `server/api/__init__.py` is the
only one that imports them.

The finding as written:

- `server/api/solve.py:18-19` imports `plan_results`, `recipes` and
  `plan.stored`.
- `server/api/plan.py:18` imports `recipes` (for `recipes.loaded()`).

Shared queries ("load the plan setup", "recipes with their ingredients and
tags") live in route modules, so routes depend on routes. This invites
import cycles and makes a route's module the owner of data access others
need.

**Proposal:** move `plan.stored`, `recipes.loaded` and the reads that
`plan_results.read` does into a data-access/service module that all routes
import (the same move as 1).

### 3. Rules written twice

- ~~**Recipe filter rule.**~~ **Done** in commit 4ba15f4: the library exports
  `recipe_passes(tags, require, exclude)` (`meal_planner/request.py`), and
  both `PlanRequest.eligible_recipes` and `server/translate.py`
  (`usable_recipes`) call it. The finding as written:
  `server/translate.py:52` (`usable_recipes`) repeats
  `PlanRequest.eligible_recipes` (`meal_planner/request.py:60`), because the
  library's version needs a whole valid request. **Proposal:** expose a small
  public function in the library (e.g. `recipe_passes(tags, require,
  exclude)`) and have both call it.
- **Default guard-rail importance** (the importance of a daily-average
  goal's per-day guard-rail when none is set). `server/translate.py:164`
  (`guard_rail_importance`) and `web/src/goals.ts:72`
  (`guardRailImportance`) implement the same rule; only a comment links
  them. **Proposal:** a shared table of cases (e.g. a JSON fixture) that
  both the Python and the TypeScript tests run, so they cannot drift.

### 4. The planner is wired to one backend

`meal_planner/planner.py:22` and `:46` call `cpsat.solve` directly, so the
solver-neutral model (design decision #15) stops one step short: `plan()`
itself is not backend-neutral (Dependency Inversion). Fine while there is
one backend. **Proposal, when a second backend appears:** a `Backend`
protocol with `solve(model, time_limit, assumed, optimize, stop)`, passed to
`plan()` with CP-SAT as the default.

### 5. ~~Small leaks between modules~~ DONE

Done in commit 2c682d3. `StopHandle.attach` / `detach` are public,
documented as for backends only. `SolveOutcome.status` is a `SolveStatus`:
the backend maps CP-SAT's codes straight to it (`UNKNOWN` to
`TIMEOUT_NO_SOLUTION`), so `planner.py` has no `_STATUS` remapping and
`decode` reads the status from the outcome.

The finding as written:

- **Private API across modules.** `meal_planner/backends/cpsat.py:61` and
  `:68` call `StopHandle._attach` / `_detach`
  (`meal_planner/stopping.py:32`, `:41`). **Proposal:** make them public
  (documented as backend-only) or have the handle accept a callback.
- **Stringly-typed status.** `SolveOutcome.status` is a bare string
  (`"OPTIMAL"`, …), mapped again to `SolveStatus` in `planner.py`.
  **Proposal:** use `SolveStatus` (or a small backend enum) end to end and
  drop the `_STATUS` remapping.

### 6. Large Vue pages

`web/src/pages/RecipePage.vue` (576 lines), `web/src/pages/SchedulePage.vue`
(515) and `web/src/components/GoalDialog.vue` (475) each mix draft state,
validation errors and server calls. **Proposal:** move draft and validation
into composables (e.g. `useRecipeDraft`), as `goals.ts` already does for
goal logic, leaving the components to render.
