# GUI Slice 8 — Goals: Main Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Plans that follow goals. The Plan page (A1) gets the Goals
card and the goal editor (A3, with the zero-bound field A3c); Make plan
sends the goals to the library as constraints; the results page (R1)
shows which goals were missed, in the Summary and on the days, and each
day's line shows the attributes that have goals. Deleting an attribute
counts and removes its goals.

**Architecture:** Migration `0007` adds `goals` (every column from the
stack spec, so slice 9 needs no migration) and the frozen
`plan_result_goals` and `plan_result_misses`. Goals are part of the plan
setup (`GET/PUT /api/plan`), like the meals. `server/translate.py`
gains `goal_names` and `constraint`; `server/freeze.py` copies the goals
and turns the library's violations into misses. In the app,
`GoalsCard.vue` and `GoalDialog.vue` are A1's card and A3; `goals.ts`
holds the wording; `SummaryCard.vue` and `DayCarousel.vue` show the
misses.

**Tech Stack:** as slice 7, plus Quasar `QBtnToggle`, `QSlider`,
`QSelect`, `QChip`.

**Specs:** A1's Goals card, A3 main form and A3c, and "Importance" in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md)
(the "GUI spec"); the goals table and "The server translates" in
[`2026-10-22-gui-tech-stack-design.md`](../specs/2026-10-22-gui-tech-stack-design.md)
(the "stack spec"); Missed goals, the day line and the slice 8 tables
in
[`2026-10-25-gui-results-screen-design.md`](../specs/2026-10-25-gui-results-screen-design.md)
(the "results spec"); slice 8 in
[`2026-10-22-gui-slices.md`](2026-10-22-gui-slices.md).

**Status:** Built and committed task by task on branch
`claude/gui-slice-8-goals`. Each task names its files and how it was
checked; the code is in the commits.

## Global Constraints

- `meal_planner/` is not changed.
- Server tests use SQLite, or Postgres when `TEST_DATABASE_URL` is set;
  the migration test stays green.
- All GUI text goes through vue-i18n, English file only.
- `web/openapi.json` and `web/src/api/schema.ts` are regenerated
  (`npm run gen:api` in `web/`) whenever the API changes.
- Numbers in the API are exact decimals, sent as numbers or strings and
  answered as plain strings (`Number` and `plain` in
  `server/api/fields.py`).
- The Playwright flow gets the slice's step.

## Interpretations made in this plan

1. **Goals belong to the plan setup.** `goals` rows refer to the plan
   (cascade) and the attribute (cascade), with a position.
   `PUT /api/plan` replaces the whole setup including the goals, and
   goals with an id are changed rather than replaced, like meals. The
   goal editor (A3) saves by sending the whole setup with one goal
   added, changed or removed, as the Max solving time dialog does.
2. **Columns** (stack spec): `attribute_id`, `position`, `name` (NULL:
   generated, slice 9 lets the user type one), `min`, `max` (exact
   numbers, NULL for no bound), `applies_to` (`day`, `plan_total`,
   `daily_average`), `must` (bool), `importance` (1–5, default 3, kept
   for a Must goal so switching back restores it), `zero_reference`
   (the zero-bound field, NULL when not given),
   `importance_below`/`importance_above` (NULL: the goal's importance),
   `day_guard_rail` (default true), `guard_rail_importance` (NULL: the
   library's default, half the goal's weight). The last four are not in
   the API until slice 9; a new goal gets their defaults and a changed
   one keeps what is stored.
3. **API fields** of a goal: `id` (none for a new goal), `attribute_id`,
   `min`, `max`, `applies_to`, `must`, `importance`, `zero_reference`;
   answered also with `name`, the generated name (read-only). 422 on
   its field for: an unknown attribute, neither bound, min above max,
   importance outside 1–5, a zero reference of 0 or below, a missing
   zero reference when the library needs one (decision 6 below), a
   bound with more decimals than its attribute has (so the model and
   the report agree, open question #23 on bound precision; checked only
   for a goal that is new or whose attribute or bounds changed, so
   lowering an attribute's decimals does not lock the other saves), an
   id of another goal or given twice. At most 50 goals.
4. **Generated names** follow the GUI spec: "Protein per day",
   "Protein, plan total", "Protein, daily average". A second goal with
   the same generated name gets " (2)", a third " (3)", in goal order.
   The server makes the names (`translate.goal_names`); the app shows
   the answered `name` and does not make names itself until slice 9,
   when the editor needs a live one. The slices plan's Vitest test for
   the generated name moves to slice 9 with it.
5. **Translation:** `day` → `scope="day"`; `plan_total` →
   `scope="horizon", aggregate="total"`; `daily_average` →
   `scope="horizon", aggregate="average_per_day"`. Must → `hard=True`.
   Importance 1–5 → weight 0.25 / 0.5 / 1 / 2 / 4. `zero_reference` →
   `normalization_reference`. The guard-rail stays the library's
   default (on, half weight) until slice 9's fields.
6. **When the zero-bound field shows.** The library needs a reference
   when a bound is 0 or below and a soft penalty is built from it (a
   negative bound would be used as the weight, a reward): the goal is
   Prefer, or it is a daily average (whose day guard-rail is always soft,
   also for a Must goal). The editor shows the field exactly then and
   the server requires it exactly then. A reference sent when it is not
   needed is not stored, so a hidden field never changes a plan.
7. **The frozen copy** gains `plan_result_goals` (position, name, the
   result attribute it is on, `applies_to`, `must`, `min`, `max`) and
   `plan_result_misses` (goal, day or NULL for the whole plan, side
   `below`/`above`, bound, actual, amount, percent). Bound, actual and
   amount are rounded to the attribute's decimals, percent to 1 decimal.
8. **Which violations are misses.** A violation named as a goal is a
   miss of that goal; one named "<goal> (day guard-rail)" is a miss of
   that goal on its day. Serving cap violations are not goals and are
   not stored. A daily-average goal's whole-plan miss is stored per day,
   as the goal reads: the library's bound, actual and amount ÷ the
   number of days (the percent is the same either way). A miss whose
   amount rounds to 0 at the attribute's decimals is dropped.
9. **Missed goals in the Summary:** one row per goal, side and kind
   (days or whole plan), in goal order, below before above: "Protein
   per day · below on 2 days" / "Cost, plan total · above, whole plan"
   / "Energy, daily average · below, whole plan", with the worst miss
   (largest percent, earliest day on a tie) on a second line: "worst
   Tue 22: 98 of 120 g −18%" for days, "1 850 of 2 000 kcal −8%" for
   the whole plan (a daily average's numbers are per day, "kcal/day").
   With goals and no misses: "All goals met". Without goals: not shown.
   Percentages are shown whole, with − below and + above.
10. **The day line** shows the attributes that have a goal, in the
    attributes' order, or the first three when the plan has no goals. A
    value missed on that day (a day goal or a guard-rail) shows in the
    warning colour as "Protein 98 / 120 g"; with two misses on one
    attribute, the larger percent.
11. **Numbers are shown as stored**, with no thousands separator, as
    elsewhere in the app ("1800–2200 kcal").
12. **Range wording** (A1, shared by the Summary): both bounds
    "1800–2200 kcal", equal bounds "exactly 120 g", min only "at least
    120 g", max only "at most 2200 kcal". Scope: "Each day", "Whole
    plan · total", "Whole plan · daily average". The chip: "Must", or
    "Prefer" with its importance as 5 dots, filled up to it.
13. **The goal editor** is a bottom sheet (`QDialog position="bottom"`)
    opened by a goal's row (to edit, with Delete) or "+ Add goal".
    With no attributes "+ Add goal" is disabled with "Add an attribute
    first". A new goal starts on the first attribute, Each day, Prefer,
    importance 3. Min and Max are text inputs with the attribute's unit;
    the editor checks that one is given and that each is a number, and
    shows the server's 422s on their fields (none after a failed
    Delete, only the general error). Applies to has the editor's own
    short labels "Each day", "Plan total", "Daily average" (A3), as the
    long ones wrap at 390 px. The zero-bound field reads
    "Count a miss as a percentage of [25] g", with the example "With
    25 g, missing by 5 g counts as 20%." (worked out from the typed
    reference).

## Tasks

### Task 1: Goals on the server

**Files:** `server/models.py`, `server/migrations/versions/0007_goals.py`
(the `goals` table; Task 2 adds the result tables to the same
migration), `server/api/plan.py`, `server/api/attributes.py`,
`server/translate.py`, `web/openapi.json`, `web/src/api/schema.ts`,
`web/src/test-data.ts` (`plan()` gains `goals: []`),
`tests/server/{test_plan,test_translate,test_delete_cascades,test_solve}.py`.

**Interfaces produced:**
- `server.models.Goal` (columns as decision 2; `attribute` relationship;
  `Plan.goals` ordered by position, cascading).
- `PlanFields.goals: list[GoalFields]`, `GoalFields {id: int | None,
  attribute_id: int, min: Number | None, max: Number | None,
  applies_to: "day" | "plan_total" | "daily_average", must: bool,
  importance: int, zero_reference: Number | None}`; `Plan.goals:
  list[Goal]` where `Goal` adds `id: int` and `name: str`.
- `Attribute.goal_count` counts the attribute's goals.
- `server.translate.IMPORTANCE_WEIGHTS = {1: 0.25, 2: 0.5, 3: 1, 4: 2,
  5: 4}` (as `Decimal`s), `translate.needs_zero_reference(applies_to,
  must, min, max) -> bool`, `translate.goal_names(goals) -> list[str]`,
  `translate.constraint(goal, name) -> Constraint`;
  `plan_request(...)` adds the goals as constraints.
- `POST /api/plan/solve` solves with the goals; an infeasible Must goal
  gives the existing `infeasible` failure.

**Tests:** round trip of every field; editing keeps a goal's id and its
slice 9 columns; removing a goal; each 422 of decision 3; a reference
not needed is dropped; deleting an attribute removes its goals and
`goal_count` counts them. Translation: each `applies_to`, Must/Prefer,
each importance, the reference, generated names with " (2)" and " (3)",
`needs_zero_reference` for each case of decision 6. Solve: a Must goal
the catalog can't meet answers `infeasible`; a Prefer goal changes the
plan (a fixed-portion recipe pair where only the goal decides).

**Checked:** 526 Python tests pass on SQLite, the migration test
among them; typecheck, lint and Vitest (159 tests) pass.

Differences from the plan text: `AppliesTo` is in
`server/api/fields.py`, shared by the plan and the results; the
Schedule page now sends the goals back with the schedule (it would
otherwise wipe them), with a test.

### Task 2: Goals and misses in the frozen copy

**Files:** `server/models.py`, `server/migrations/versions/0007_goals.py`,
`server/freeze.py`, `server/api/plan.py`, `server/api/plan_results.py`,
`web/openapi.json`, `web/src/api/schema.ts`, `web/src/test-data.ts`
(`planResult()` gains `goals: []`, `misses: []`),
`tests/server/{test_freeze,test_solve,test_plan_results}.py`.

**Interfaces consumed:** Task 1's `goal_names` and `plan_request`.

**Interfaces produced:**
- `server.models.PlanResultGoal`, `PlanResultMiss`, cascading from
  `PlanResult` (`PlanResult.goals`, `PlanResultGoal.misses`).
- `freeze(request, plan, start_date, meal_names, units, goals,
  stopped=False)`, where `goals` is a list of `FrozenGoal(name,
  applies_to, must, min, max)` in goal order (a small dataclass in
  `freeze.py`; the constraint names are the goal names).
- `PlanResult` response gains `goals: list[ResultGoal]` with
  `ResultGoal {name, attribute: int (index into attributes),
  applies_to, must, min: str | None, max: str | None}` and `misses:
  list[ResultMiss]` with `ResultMiss {goal: int (index into goals),
  day: int | None, side: "below" | "above", bound, actual, amount,
  percent: str}`, misses ordered by goal, day (whole plan first), side.

**Tests:** freeze: goals copied with their attribute; a day goal's
misses per day; a plan-total miss with day None; a daily-average miss
divided by the days; a guard-rail miss stored as its goal's miss on
its day; serving cap violations left out; rounding. API: a solve with a
Prefer goal it can't meet answers the miss; a saved plan keeps its goals
and misses after the goal and its attribute are deleted.

**Checked:** 540 Python tests pass on SQLite; a miss too small to show
at its attribute's decimals is dropped, with a test. The API schema was
regenerated.

Differences from the plan text: `GOAL_NAME_LENGTH` is 130, for the name
columns, so a longest attribute name with " (50)" fits. A guard-rail
alias is used only for a goal that has a guard-rail, and an exact goal
name wins over another goal's alias.

### Task 3: Goals card and goal editor in the app

**Files:** `web/src/goals.ts` and its test,
`web/src/components/{GoalsCard,GoalDialog}.vue` and their tests,
`web/src/pages/PlanPage.vue` and its test, `web/src/test-data.ts`
(`goal()`), `web/src/i18n/en.json`.

**Interfaces consumed:** Task 1's API.

**Interfaces produced (`web/src/goals.ts`):**
`rangeText(min: string | null, max: string | null, unit: string):
string`, `scopeText(appliesTo): string` keys,
`needsZeroReference(goal: {applies_to, must, min, max}): boolean`
(the same rule as the server's), `IMPORTANCE = { min: 1, max: 5,
default: 3 }`.

**Tests:** goals.ts: each range wording, `needsZeroReference` for each
case of decision 6. Goals card: one row per goal with range, scope and
chip, importance dots, "+ Add goal" disabled without attributes. Goal
editor: opens with a goal's fields; importance only for Prefer; the
zero-bound field only when needed, with its example; a goal needs a
bound; Save sends the whole setup with the goal added or changed;
Delete removes it; server field errors show on their fields.

**Checked:** lint, typecheck and Vitest (194 tests) pass.

Differences from the plan text: `rangeText` takes vue-i18n's `t` as its
last argument.

### Task 4: Missed goals on the results page

**Files:** `web/src/misses.ts` and its test,
`web/src/components/{SummaryCard,DayCarousel}.vue`,
`web/src/pages/ResultsPage.test.ts`, `web/src/i18n/en.json`.

**Interfaces consumed:** Task 2's response, Task 3's `rangeText`.

**Interfaces produced (`web/src/misses.ts`):** `missRows(plan:
PlanResult): MissRow[]` (decision 9), `dayLine(plan: PlanResult, day:
number): {text: string, missed: boolean}[]` (decision 10),
`percentText(percent: string, side): string`.

**Tests:** missRows: grouping by goal, side and kind, worst miss and
its tie, plan and daily-average wording. dayLine: no goals → first
three; attributes with goals in attribute order; a missed value with
its bound and the larger of two misses. Results page: Missed goals
shown when collapsed, "All goals met", hidden without goals; the day
line marks a miss.

**Checked:** lint, typecheck and Vitest (207 tests) pass.

Differences from the plan text: `missRows` and `dayLine` take vue-i18n's
`t`.

### Task 5: End-to-end test

**Files:** `web/e2e/catalog.e2e.ts`.

**Test:** before making the plan, add a Must goal "Energy each day at
least 100 kcal"; the Goals card shows "at least 100 kcal · Each day ·
Must"; the result shows "All goals met" and the day line shows Energy.

**Checked:** passes against uvicorn on SQLite with the built app.

### Task 6: Docs

**Files:** `README.md` (status), this plan (status, how each task was
checked), the slices plan.

**Checked:** after the final review fixes: 548 Python tests pass on
SQLite; typecheck, lint and Vitest (214 tests) pass.

## Done when

Goals can be added, edited and deleted on the Plan page; Make plan
follows Must goals and weighs Prefer goals by importance; the results
page lists missed goals and marks them on the days; deleting an
attribute warns about and removes its goals; CI is green.
