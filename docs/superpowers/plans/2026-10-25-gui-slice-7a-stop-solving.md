# GUI Slice 7a — Stop Solving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A running solve can be stopped. **Cancel** on the Plan page's
Making plan… card ends the search and keeps the best plan found so far,
as when time runs out; with none, the Couldn't make a plan card says
"Stopped before any plan was found." R1 shows "Stopped early: may not be
the best plan". The server runs one solve at a time.

**Architecture:** The library gains `meal_planner.StopHandle` and an
optional `stop` argument to `plan()`; the CP-SAT backend registers each
solver with the handle so `stop()` can call `stop_search()`, and skips
solves once stopped. The server keeps the running solve's handle on
`app.state`; `POST /api/plan/solve` refuses a second solve with 409 and
`POST /api/plan/solve/cancel` stops the running one. The app's solve
store gains `cancel()`, and `SolveCard.vue` a Cancel button.

**Tech Stack:** as slice 7.

**Specs:** "Stopping a solve (slice 7a)", the A1 progress card and R1's
status line in
[`2026-10-25-gui-results-screen-design.md`](../specs/2026-10-25-gui-results-screen-design.md)
(the "results spec"); slice 7a in
[`2026-10-22-gui-slices.md`](2026-10-22-gui-slices.md).

**Status:** Built and committed task by task on branch
`claude/affectionate-feynman-2uj4lm`. Each task names its files and how
it was checked; the code is in the commits.

## Global Constraints

- `meal_planner/` changes only to add stopping (the slices plan's
  exception for this slice). Without a stop handle, `plan()` behaves
  exactly as before.
- No migration: `plan_results.status` is already a 12-character string
  with no check, and "stopped" fits.
- Server tests use SQLite, or Postgres when `TEST_DATABASE_URL` is set.
- All GUI text goes through vue-i18n, English file only.
- `web/openapi.json` and `web/src/api/schema.ts` are regenerated.

## Interpretations made in this plan

1. **The library interface:** `StopHandle()` with `stop()` (callable
   from any thread, any number of times, also before or after the
   solve) and `stopped`; `plan(request, stop=None)`. The result types do
   not change: a stopped search answers `FEASIBLE` with the best plan
   found, or `TIMEOUT_NO_SOLUTION` with none, as on a timeout. A search
   that finished before the stop took effect keeps its status
   (`OPTIMAL`, `INFEASIBLE`). Whether a solve was stopped is read from
   the handle, not the plan.
2. **No stop is lost.** `stop()` calls `stop_search()` on the solver
   that is running. CP-SAT ignores that call in the instant before its
   search starts, so with a handle the backend also turns on CP-SAT's
   log callback and stops the search on the first log line if the handle
   is stopped by then. A handle stopped before a solve starts skips it.
   Without a handle, nothing of this runs.
3. **Stopping during the clash search** skips the remaining extra
   solves. Each skipped one counts as "the rest are feasible", as a
   timeout does, so its member is kept: the conflict report is still
   correct, just maybe not minimal. The plan stays `INFEASIBLE`.
4. **Status `stopped`** is stored for a plan whose handle was stopped
   and whose status is `FEASIBLE`. An `OPTIMAL` plan stays `optimal`
   even if Cancel came too late to matter.
5. **New failure reason `stopped`**: the handle was stopped and there
   is no plan (`TIMEOUT_NO_SOLUTION`). An infeasible result stays
   `infeasible`, since that is known.
6. **One solve at a time per server process.** The handle lives on
   `app.state` from the start of `POST /api/plan/solve` (before the
   catalog is read) to its answer. A second solve meanwhile answers 409.
   A cancel that lands before the solver starts makes the solve answer
   `stopped` without searching.
7. **`POST /api/plan/solve/cancel` answers 204 whether or not a solve
   runs**, so a Cancel tapped as the solve ends is not an error. The
   solve's own answer tells what came of it.
8. **The app:** Cancel sends the cancel request and then shows
   "Stopping…" disabled until the solve answers. A 409 on Make plan
   (a solve started in another tab, or before a reload) shows the
   Couldn't make a plan card with "A plan is already being made. Try
   again when it is done."

## Tasks

### Task 1: Stopping in the library

**Files:** `meal_planner/stopping.py` (new), `meal_planner/__init__.py`,
`meal_planner/planner.py`, `meal_planner/backends/cpsat.py`,
`tests/meal_planner/test_stopping.py` (new).

**Interfaces produced:** `meal_planner.StopHandle` (`stop()`,
`stopped`); `plan(request, stop: StopHandle | None = None)`;
`cpsat.solve(..., stop=None)`.

**Tests:** backend: a stopped handle skips the solve (UNKNOWN); stopping
a long search from another thread returns soon with the best solution
(FEASIBLE) or none (UNKNOWN); a stop that lands before the search starts
still stops it. `plan()`: a handle stopped before the call answers
`TIMEOUT_NO_SOLUTION`; stopping during the clash search skips the
remaining solves and keeps their members; no handle leaves results
unchanged.

**Checked:** 175 library tests pass. With the first-log stop turned off,
the "stop before the search starts" test runs to its 60 s limit and
fails, so it tests that path.

### Task 2: Cancel on the server

**Files:** `server/app.py`, `server/api/plan.py`,
`server/api/plan_results.py`, `server/freeze.py`, `server/models.py`
(comment), `web/openapi.json`, `web/src/api/schema.ts`,
`tests/server/{test_solve,test_freeze}.py`.

**Interfaces produced:** `POST /api/plan/solve/cancel` → 204;
`POST /api/plan/solve` → 409 while one runs; `Failure` gains `stopped`;
`Status` gains `stopped`; `freeze(..., stopped=False)`.

**Tests:** cancel during a solve returns the plan found with status
`stopped`; cancel with no plan answers `stopped` and keeps the unsaved
plan; a stopped `OPTIMAL` plan stays `optimal`; a second solve while
one runs is 409 and the first still finishes; cancel with nothing
running is 204; after a solve (also a failed one) the next may start;
freeze stores `stopped`.

**Checked:** 478 Python tests pass on SQLite; the server suite (282)
also passes on Postgres 16.

### Task 3: Cancel in the app

**Files:** `web/src/solve.ts` and its test,
`web/src/components/SolveCard.vue`, `web/src/pages/PlanPage.vue` and its
test, `web/src/pages/ResultsPage.test.ts`, `web/src/i18n/en.json`.

**Interfaces produced:** `useSolve()` gains `cancelling` and
`cancel(): Promise<void>`; `Failure` gains `'busy'`.

**Tests:** solve store: cancel sends the request once and sets
cancelling until the solve answers; a 409 is `busy`. Plan page: Cancel
on the Making plan… card, Stopping… while cancelling, the `stopped` and
`busy` texts. Results page: the Stopped early status line.

**Checked:** lint, typecheck and Vitest (157 tests) pass. The slice 7
Playwright flow still passes against uvicorn on SQLite with the built
app. In a phone-sized browser, with the server's solve replaced by one
that runs until cancelled, Cancel opened R1 with "Stopped early: may
not be the best plan" about 0.1 s after the tap.

No Playwright step is added: the flow is unchanged, and until goals
(slice 8) a real plan solves at once, so there is nothing to cancel
without replacing the solver.

### Task 4: Docs

**Files:** `README.md` (status), this plan (status, how each task was
checked), the slices plan's status.

## Done when

Cancel stops a running solve and opens the best plan found, or says none
was found; a second solve is refused while one runs; CI is green.
