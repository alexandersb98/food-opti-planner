# GUI Slice 11 — Must Goals Clash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** When no plan meets the Must goals, the Plan page says which
ones clash and where, and lets them be fixed on the spot (A5): loosen a
bound, make the goal Prefer, or open the schedule when a day's meals
take part, then **Try again**.

**Architecture:** The library already answers an infeasible solve with a
minimal `ConflictReport` (decision #14), whose members are the library's
constraint names and days. The solve maps them back to the GUI's terms:
`"goal N"` (`translate.constraint_key`) to the goal's id and name,
`min_meals_per_day` to the day's meals. `SolveOutcome` gains `clash`,
the list of members, beside `failure: "infeasible"`. In the app,
`useSolve` keeps the clash with the failure; a new `ClashCard.vue`
replaces the Couldn't make a plan card when there is one, and the Goals
card marks the clashing goals red. The card's draft (bounds as typed,
Make Prefer) and what it sends live in `web/src/clash.ts`, tested apart.

**Tech Stack:** as slice 10.

**Specs:** A1 and A5 in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md)
(the "GUI spec"); `POST /api/plan/solve` in
[`2026-10-22-gui-tech-stack-design.md`](../specs/2026-10-22-gui-tech-stack-design.md)
(the "stack spec"); slice 11 in
[`2026-10-22-gui-slices.md`](2026-10-22-gui-slices.md); core plan
interpretation 3 (the day floor can be in a conflict) in
[`2026-10-13-meal-planner-core.md`](2026-10-13-meal-planner-core.md).

**Status:** Built and committed task by task on branch
`claude/adoring-mayer-xajr91`. Each task names its files and how it was
checked; the code is in the commits. The plan and each task were reviewed
by a subagent, and the findings fixed.

## Global Constraints

- `meal_planner/` is not changed.
- No migration: the clash is not stored. Like the other failures it
  lives in the app until dismissed or the next solve.
- Server tests use SQLite, or Postgres when `TEST_DATABASE_URL` is set.
- All GUI text goes through vue-i18n, English file only.
- `web/openapi.json` and `web/src/api/schema.ts` are regenerated
  (`npm run gen:api` in `web/`) whenever the API changes.
- The Playwright flow gets the slice's step.
- Checks before each commit: `python -m pytest` at the root; `npm run
  lint`, `npm run typecheck`, `npm test` in `web/`.

## Interpretations made in this plan

1. **The day's meals are in most clashes.** A day without an "At least"
   serves all its planned meals, and the library keeps that as a hard,
   guarded rule (`min_meals_per_day`, core plan interpretation 3) like a
   set minimum (only when the day has a meal to serve). So a Must maximum
   the meals can't stay under clashes with the day's meals, not only with
   other goals. The card shows such a member as its own row: "Meals on
   Wed 23", then "All planned meals are served" or "At least 2 meals are
   served", the number from the schedule as it is now, with **Edit schedule**, which opens the
   Schedule page (A2) (what was typed on the card is not kept). It has no
   bound field and no Make Prefer: a day minimum is not a goal. A row
   for a day the schedule no longer has drops out.
2. **API.** `SolveOutcome.clash: list[ClashMember] | null`, set only with
   `failure: "infeasible"`. `ClashMember = {kind: "goal" |
   "day_minimum", goal_id: int | null, name: str | null, day: int | null,
   date: date | null}`: a goal has its id and its name as at the solve;
   `day` (from 0) and its `date` (from the start date at the solve) are
   null for a whole-plan goal. Order: goals in goal order, each by day
   (whole plan first), then day minimums by day. A member the server
   can't map is a bug and is not caught. The name `min_meals_per_day` is
   the library's (not exported); the server names it once, and a test
   with a real solve keeps them in step.
3. **One clash at a time.** The library trims the report to a minimal
   set: dropping any member would leave a plan possible. So a Must day
   goal no day can meet comes back with one day, not every day, and
   which day is the solver's choice; tests don't fix it. The card says
   "Fixing these may show another clash." A goal can still come back on
   several days when they clash together; its row then lists them:
   "Clashes on Wed 23, Thu 24". A whole-plan or daily-average goal:
   "Clashes over the whole plan".
4. **A clash cut short.** Trimming takes up to one more solve per member,
   each up to Max solving time. If Cancel or the time limit ends a
   trimming solve, the member stays, so the set may hold more than it
   needs. Only a Cancel can be seen from outside the library (which is
   not changed), so `SolveOutcome.clash_minimal` is false after a Cancel
   (true otherwise, null without a clash), and the card then says
   "Stopped early: some of these may not take part." A trim cut by the
   time limit is not told apart. An infeasible solve stays
   `infeasible` when cancelled (as in slice 7a), as it has a clash to
   show.
5. **An empty report.** It can't happen with the current library (every
   rule that is not guarded holds with nothing chosen), but if it did,
   `clash` is `[]` and the app shows the Couldn't make a plan card with
   "No plan possible with these settings." as before. A mocked test
   covers it; no other UX is built for it.
6. **The goal row** shows the goal's name, where it clashes, its bound
   fields (the ones it has, as stored now: Min, Max or both; the report
   does not say which side clashed) and **Make Prefer**. Make Prefer is
   part of the draft: the row then says "Will be Prefer" and the button
   turns to **Keep Must**. When the draft needs the zero-bound field (a
   bound of 0 or below made Prefer, or on a daily average with its day
   guard-rail; `needsZeroReference`), the row shows it, as the goal
   editor does. Rows follow the plan as it is now: a goal deleted since,
   or no longer Must, drops out.
7. **The goal editor's rules, reused.** Each goal row's draft is the goal
   editor's `GoalDraft` (`draftFromGoal`), changed only in Min, Max, Must
   and the reference, so `draftErrors`, `showsReference`, `draftFields`
   and `serverErrors` from `useGoalDraft.ts` decide what is wrong and
   what is sent, and the two can't drift.
8. **Try again** checks the rows (`draftErrors`), sends the setup with
   the card's changes, if any, gives the saved setup to the Plan page (as
   the goal editor does), then makes the plan with its Max solving time.
   A refused save marks the goal's fields with the server's errors
   (`serverErrors`); a failure with no field marked says "Could not save.
   Try again." on the card; nothing is solved then. **Dismiss** closes
   the card as for other failures.
9. **Goals card.** Goals the card shows get the `clashing` class: their
   name in red, an error icon and "In the clash" for screen readers,
   until the card goes.
10. **Card place and title.** At the top of the Plan page, where the
    Couldn't make a plan card is (the Making plan… card still shows
    while a solve runs): red border, title "No plan possible", then
    "These rules can't all be met:" and the rows.

## Tasks

### Task 1: The clash in the solve's answer

**Files:** `server/translate.py` (`goal_position`), `server/api/solve.py`
(`ClashMember`, `SolveOutcome.clash`, the mapping), `web/openapi.json`,
`web/src/api/schema.ts`, `web/src/api/types.ts` (`ClashMember`),
`tests/server/{test_translate,test_solve}.py`.

**Interfaces produced:**
- `_Setup.goal_ids`: each goal's id in goal order, kept past the read.
- `translate.goal_position(key: str) -> int | None`: the inverse of
  `constraint_key`; None for a name that is not a goal's.
- `translate.DAY_MINIMUM = "min_meals_per_day"`.
- `solve.ClashMember`, `SolveOutcome.clash`, `SolveOutcome.clash_minimal`.

**Tests:** `goal_position` round trip with `constraint_key`, and None
for other names. API, real solves: a Must day goal the catalog can't
meet answers the goal's id, name and one day with its date; a
whole-plan Must goal answers `day: null`; a Must maximum below every
meal answers the goal and that day's meals. Mocked: order as in
interpretation 2; an unknown name raises; an empty report answers
`clash: []`; a solve stopped while trimming answers `clash_minimal:
false`; other failures answer `clash: null`.

**Checked:** 627 Python tests pass on SQLite, the API schema test among
them; typecheck, lint and Vitest pass. The API schema was regenerated.

Differences from the plan text: the plan review showed the library trims
a clash to a minimal set, so interpretation 3 (one clash at a time) and
the tests were rewritten before the code: real-solve tests read the day
back instead of fixing it, and a test with a whole-plan total and a daily
minimum shows a goal on two days. The review of the task added
`isdecimal` in `goal_position` and a note on `clash_minimal`.

### Task 2: The No plan possible card and the red goals

**Files:** `web/src/solve.ts` (keeps `clash`), `web/src/clash.ts` and its
test (rows from the report and the plan, the draft, its errors, the
fields to send), `web/src/components/ClashCard.vue` and its test,
`web/src/components/SolveCard.vue` (not shown for a clash),
`web/src/components/GoalsCard.vue` and its test (`clashing`),
`web/src/pages/PlanPage.vue` and its test, `web/src/i18n/en.json`,
`web/src/solve.test.ts`.

**Tests:** clash.ts: rows grouped per goal in report order, days listed;
a deleted goal or one no longer Must drops; day minimum rows with "all
planned" or the minimum, and dropped past the schedule's days; the
draft's errors; the fields sent with changed bounds and Make Prefer, the
rest as loaded; the reference shown when needed. Card: rows show,
Make Prefer toggles, Try again saves then solves, with no change only
solves, a refusal marks the field and does not solve; Edit schedule
links to the Schedule page; Dismiss. Goals card: the clashing class.

**Checked:** typecheck, lint and Vitest (347 tests) pass.

Differences from the plan text: the card's tests are on the Plan page
(`PlanPage.test.ts`), which shows it, rather than in a test of its own.
The review of the task found three bugs, fixed: an error on a field the
row doesn't show (Min of a goal with only a Max, or a field only the goal
editor has) left Try again silent, so errors now land on a shown field or
say the save failed; the icon's label was hidden from screen readers
with the icon, so a hidden text says "In the clash"; and any save of the
setup reset what was typed on the card, so it now starts over only when
the clash or a goal it shows changes (`rowsKey`). The red goals follow
the card's rows, and only the card's title and intro are the alert.

### Task 3: End-to-end test and docs

**Files:** `web/e2e/catalog.e2e.ts`, `README.md`, this plan (status and
how each task was checked).

**Test:** after the first plan: add a Must goal "Energy at most 10 kcal
per day"; Make plan; the No plan possible card names it and the day's
meals; Make Prefer; Try again; the plan is made.

**Checked:** the end-to-end test passes against uvicorn on an empty SQLite
database with the built app. The Plan page with a clash of a daily
minimum and a plan total was looked at in a browser at 390 px: nothing
scrolls sideways.

Differences from the plan text: the clashing goal here is "at most 10
kcal each day", which clashes with the first goal (at least 100) or the
day's meals; the test asserts only the new goal's row, as the solver
picks the set. After Try again the test goes back to the Plan page: the
card is gone and the goal is Prefer.

## Done when

An infeasible plan shows the No plan possible card with each clashing
Must goal and day's meals and where they clash; bounds can be loosened
or the goal made Prefer, and Try again makes the plan; the clashing
goals are red in the Goals card; CI is green.
