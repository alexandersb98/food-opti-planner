# GUI Slice 7 — Schedule and Make Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** The first real plan. The Plan page (A1) gets the Schedule card,
its editor (A2) and Max solving time; **Make plan** solves on the server
and opens the results page (R1); plans can be saved, discarded, deleted
and used for today, and the Plan page shows today's meals and the saved
plans. No goals or recipe filters yet.

**Architecture:** Migration `0006` adds the plan setup (`plan`,
`plan_meals`, `plan_skips`, `plan_day_minimums`) and the frozen results
(`plan_results`, `plan_result_attributes`, `plan_result_meals`,
`plan_result_meal_items`, `plan_result_totals`). `server/api/plan.py`
holds `GET/PUT /api/plan` and `POST /api/plan/solve`;
`server/api/plan_results.py` the saved-plan routes. `server/translate.py`
gains `attribute`, `days` and `plan_request`; `server/freeze.py` turns a
library `Plan` into result rows. In the app, `PlanPage.vue` replaces the
placeholder, `SchedulePage.vue` is A2 and `ResultsPage.vue` is R1;
`web/src/solve.ts` keeps the running solve across page changes.

**Tech Stack:** as slice 6, plus Quasar `QCarousel`, `QDate`,
`QLinearProgress`.

**Specs:** A1 and A2 in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md)
(the "GUI spec"); all of
[`2026-10-25-gui-results-screen-design.md`](../specs/2026-10-25-gui-results-screen-design.md)
(the "results spec") except stopping a solve (slice 7a) and goals
(slice 8); "Storage", "The server translates" and "Testing" in
[`2026-10-22-gui-tech-stack-design.md`](../specs/2026-10-22-gui-tech-stack-design.md)
(the "stack spec"); slice 7 in
[`2026-10-22-gui-slices.md`](2026-10-22-gui-slices.md).

**Status:** Built and committed task by task on branch
`claude/relaxed-darwin-ovc29s`. Each task names its files and how it was
checked; the code is in the commits.

## Global Constraints

- `meal_planner/` is not changed (its stop hook is slice 7a).
- Server tests use SQLite, or Postgres when `TEST_DATABASE_URL` is set;
  the migration test stays green.
- All GUI text goes through vue-i18n, English file only.
- `web/openapi.json` and `web/src/api/schema.ts` are regenerated.
- The Playwright flow gets the slice's step.

## Interpretations made in this plan

1. **The plan setup row is created on first read.** `GET /api/plan`
   creates it if missing, with the defaults from the slices plan:
   start date today (the server's date), 7 days, Breakfast / Lunch /
   Dinner, every cell planned, "At least: all" on every day, 30 s.
2. **Meals are rows with ids** (`plan_meals`: position, name), and a
   skipped cell refers to its meal by id (`plan_skips`: day, meal). So
   reordering or renaming meals keeps the skipped cells with their meal,
   and removing a meal removes its cells. Only skipped cells and
   non-"all" minimums are stored (`plan_day_minimums`: day, at least);
   a missing row means planned, or "all". Cells and minimums on days
   beyond the number of days are dropped on save.
3. **Limits:** 1 to 31 days, 1 to 8 meals, meal names 1–40 characters,
   unique within the plan. "At least" is from 0 to the day's planned
   meals; a minimum above that after cells are skipped is a 422 on that
   day's field. Max solving time is a whole number of seconds from 1 to
   300 (the 5-minute ceiling).
4. **`PUT /api/plan` replaces the whole setup** and answers it. A2 saves
   start date, days, meals, cells and minimums in one go, like the other
   editors (Save returns to the Plan page, back leaves without saving).
   Max solving time is edited in a small dialog on A1 that sends the
   whole setup with the new time.
5. **Meal names are edited in a dialog inside A2** (add, rename, move up
   or down, remove; at least one stays), not a separate route.
6. **The `PlanRequest` holds every attribute, tag and recipe**, the days
   from the grid (planned → `Slot("generated")`, skipped →
   `Slot("absent")`, "all" → `min_meals_per_day=None`) and the solve
   time limit; no constraints or tag filters yet.
7. **A solve with no plan answers 200 with a reason**, not an error:
   `no_recipes` (the catalog has none, checked before solving),
   `too_large` (`ModelTooLargeError`), `infeasible` and `no_plan_in_time`
   (`TIMEOUT_NO_SOLUTION`). Any other `PlanRequestError` is a bug and
   answers 500. Nothing is stored and the unsaved plan stays.
8. **Freezing rounds:** each total is stored rounded half away from zero
   to its attribute's decimals (as the recipe totals in slice 6), and
   each scaled ingredient amount (amount × portion) to 6 decimals, so
   the result tables use `NUMERIC(15, 6)` like the catalog. The library's
   totals are stored as returned (meal, day, whole plan), never added up
   again. The daily average is worked out when answering: the rounded
   plan total ÷ the number of days, rounded the same way.
9. **Status** is `optimal` for `OPTIMAL` and `time_ran_out` for
   `FEASIBLE`; slice 7a adds `stopped`.
10. **Numbers are answered as plain strings** (`plain` from
    `server/api/fields.py`); the app formats them as elsewhere. Scaled
    ingredient amounts are shown with at most 2 decimals; portions as
    stored ("1.5 ×").
11. **"Today" is the browser's date**, sent as `?date=YYYY-MM-DD`. The
    Today chip on Saved plans marks the plan that
    `GET /api/plan-results/today` answers; nothing else needs the date.
12. **The running solve lives in `web/src/solve.ts`**, a module-level
    reactive store, so the Making plan… card survives moving between
    pages. When the solve answers: a plan opens R1 (`/plans/new`) if the
    user is still on the Plan page, otherwise only the New plan card
    shows it; a reason shows the Couldn't make a plan card. The bar is
    the browser's elapsed time against Max solving time and stays full
    past it.
13. **Day labels and ranges come from one helper**, `dayLabel(start,
    index)` → "Mon 21" and `dateRange(start, days)` → "Mon 21 – Sun 27
    Oct", in English, used by A1, A2 and R1.
14. **The A1 Schedule card** shows the date range, "3 meals a day", "2
    skipped" and the dot grid (one row per weekday in the plan's order,
    one dot per meal; filled planned, dashed skipped).
15. **R1 meal rows and the Today card show meals in schedule order**,
    by the meal names frozen in the plan. A meal the planner left out
    shows as skipped, like a skipped cell (results spec).
16. **`plan_results` also has a saved at time**, which the results
    spec's table leaves out but its Saved plans rows show ("saved Sun
    20, 18:04") and sort by. Chosen at can't serve, since Use for today
    changes it.

## Tasks

### Task 1: Plan setup on the server

**Files:** `server/models.py`, `server/migrations/versions/0006_plan.py`
(the setup tables only; Task 2 adds the result tables to the same
migration), `server/api/{__init__,plan}.py`, `server/translate.py`,
`web/openapi.json`, `web/src/api/schema.ts`,
`tests/server/{test_plan,test_translate}.py`.

**Interfaces produced:**
- `server.models.Plan`, `PlanMeal`, `PlanSkip`, `PlanDayMinimum`
- `GET /api/plan`, `PUT /api/plan` with `PlanFields`: `start_date`
  (date), `days` (int), `meals` (list of `{id: int | None, name}`; no id
  for a new meal), `skips` (list of `{day, meal}` with meal as its
  position in `meals`), `minimums` (list of `{day, at_least}`),
  `solve_time_limit` (int seconds); `Plan` answers the same with meal
  ids.
- `server.translate.attribute(row) -> AttributeDef`,
  `server.translate.days(plan) -> tuple[Day, ...]`,
  `server.translate.plan_request(plan, attributes, tags, recipes) ->
  PlanRequest`

**Tests:** first read creates the defaults; round trip of every field;
reordering and renaming meals keeps their skipped cells; removing a meal
removes its cells; cells and minimums beyond the days are dropped; 422
on its field for days and meal counts outside the limits, an empty, too
long or repeated meal name, a minimum above the day's planned meals or
below 0, a time limit of 0 or above 300, a cell on an unknown day or
meal. Translation: planned and skipped cells, "all" → `None`, a number
minimum, the time limit, attribute precision, every recipe and tag in
the request.

**Checked:** 425 Python tests pass on SQLite; the server tests (237)
also pass on Postgres 16, including the migration test.

### Task 2: Solve and saved plans on the server

**Files:** `server/models.py`, `server/migrations/versions/0006_plan.py`,
`server/freeze.py`, `server/api/{__init__,plan,plan_results}.py`,
`web/openapi.json`, `web/src/api/schema.ts`,
`tests/server/{test_solve,test_plan_results,test_freeze}.py`.

**Interfaces consumed:** Task 1's `plan_request`.

**Interfaces produced:**
- `server.models.PlanResult`, `PlanResultAttribute`, `PlanResultMeal`,
  `PlanResultMealItem`, `PlanResultTotal`, all cascading from
  `PlanResult`; a partial unique index keeps one unsaved row.
- `server.freeze.freeze(request, plan, start_date, meal_names) ->
  models.PlanResult` (pure: builds rows from the request's recipes and
  the library's `Plan`).
- `POST /api/plan/solve` → `SolveOutcome {plan: PlanResult | None,
  failure: "no_recipes" | "too_large" | "infeasible" |
  "no_plan_in_time" | None}`.
- `GET /api/plan-results` → `{unsaved: PlanResultSummary | None, saved:
  list[PlanResultSummary]}` (saved newest first by saved at);
  `PlanResultSummary {id, saved, status, start_date, days, created_at,
  saved_at}`.
- `GET /api/plan-results/today?date=` → `TodayPlan {id, day, date,
  meals: list[ResultMeal]} | None`.
- `GET /api/plan-results/{id}` → `PlanResult {…summary, attributes:
  [{name, unit, decimals}], totals: list[str], averages: list[str],
  day_totals: list[list[str]], meals: list[list[ResultMeal]]}`, where
  each totals list follows `attributes`' order and `ResultMeal {name,
  planned, recipe, portion, totals, items: [{ingredient, unit,
  amount}]}`.
- `POST /api/plan-results/{id}/save`, `POST
  /api/plan-results/{id}/use-for-today`, `DELETE
  /api/plan-results/{id}`; 404 for unknown ids, 409 for saving a saved
  plan.

**Tests:** solve on a small catalog returns and stores the unsaved plan
with meals, scaled ingredients and totals matching the library's; a
second solve replaces it; each failure reason, with the unsaved plan
kept; save sets chosen at and lists it; discard and delete; today: none,
one plan covering the date, the newest saved of two, and Use for today
switching back; a date outside every plan; a saved plan is unchanged
after its recipe is edited and after it is deleted (and the delete is
not blocked); rounding of totals and amounts; averages. Freeze: absent
and unserved slots both come out as not planned.

`freeze()` takes a 5th argument, `units` (attribute name → unit), since
`AttributeDef` has no unit. Save and Use for today answer
`PlanResultSummary`; Use for today on the unsaved plan is a 409.

**Checked:** 460 Python tests pass on SQLite; the server suite (271)
also passes on Postgres 16, including the migration test.

### Task 3: Plan page and schedule in the app

**Files:** `web/src/pages/{PlanPage,SchedulePage}.vue` and their tests,
`web/src/components/{ScheduleCard,MaxTimeDialog,MealNamesDialog}.vue`,
`web/src/dates.ts` and its test, `web/src/{pages,router}.ts`,
`web/src/api/types.ts`, `web/src/test-data.ts`, `web/src/i18n/en.json`.

**Interfaces produced:** `dayLabel(start: string, index: number):
string`, `dateRange(start: string, days: number): string`,
`localDate(now?: Date): string` in `web/src/dates.ts`; routes `plan`
(`/`) and `schedule` (`/plan/schedule`).

**Tests:** dates: labels across a month end, ranges in one month and
across two, local date. Plan page: Schedule card wording and dots, Max
solving time dialog saves. Schedule page: opens with the stored setup;
start date, days stepper, cell toggling, At least choices limited to
the planned meals; meal names dialog adds, renames, reorders and
removes (not the last one); Save sends the setup and returns; server
field errors show on their fields; back leaves without saving.

The dot grid on A1 has one column per day (weekday letter, meal dots
stacked, wrapping weekly), as in the wireframe, not one row per weekday.

**Checked:** lint, typecheck and Vitest (115 tests) pass.

### Task 4: Make plan, results and saved plans in the app

**Files:** `web/src/solve.ts` and its test,
`web/src/pages/ResultsPage.vue` and its test,
`web/src/components/{SolveCard,TodayCard,SavedPlansCard,SummaryCard,DayCarousel}.vue`,
`web/src/pages/PlanPage.vue` and its test, `web/src/router.ts`,
`web/src/api/types.ts`, `web/src/test-data.ts`, `web/src/i18n/en.json`.

**Interfaces consumed:** Task 2's endpoints, Task 3's date helpers.

**Interfaces produced:** `useSolve()` → `{running, startedAt, failure,
start(): Promise<void>, dismiss()}`; routes `new-plan` (`/plans/new`)
and `saved-plan` (`/plans/:id`, with optional `?day=&meal=` from the
Today card).

**Tests:** solve store: one solve at a time, failure kept until
dismissed, plan opens R1 only from the Plan page. Plan page: Making
plan… card with the bar while solving and Make plan disabled; each
Couldn't make a plan text; New plan card; Today card from the today
answer, hidden without one, meal tap opens R1 at that day and meal;
Saved plans newest first with the Today chip, hidden when empty.
Results page: status lines; Summary with all rows at 5 attributes,
collapsed at 6 with Show all / Show fewer; carousel opens on today or
day 1, arrows and position label, Today button only away from today in
a plan covering today; day line with the first three attributes and all
on tap; meal rows, skipped meals, opening a meal's ingredients and
totals; Save and Discard (asks) for the unsaved plan, Use for today
only when it applies, Delete (asks) for a saved one; Save, Discard and
Delete return to the Plan page; unknown plan fails to load.

`useSolve().start(seconds)` takes the time limit, so the bar and the
"No plan found within N s" text use the time the solve ran with.

**Checked:** lint, typecheck and Vitest (149 tests) pass.

### Task 5: End-to-end test

**Files:** `web/e2e/catalog.e2e.ts`.

**Test:** the slice 6 flow then opens the Plan page, sets 2 days in the
schedule, taps **Make plan**, sees R1 with the recipe on both days and
"Best possible plan", saves, and sees the plan under Saved plans.

**Checked:** passes against uvicorn on SQLite with the built app.

### Task 6: Docs

**Files:** `README.md` (status), this plan (status, how each task was
checked).

## Done when

The schedule can be set up; Make plan shows a plan or says why there is
none; plans can be saved, discarded, deleted and used for today; the
Plan page shows today's meals and the saved plans; R1 shows the
summary, the days as a carousel and each meal's scaled ingredients; CI
is green.
