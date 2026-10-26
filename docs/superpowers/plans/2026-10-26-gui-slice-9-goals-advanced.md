# GUI Slice 9 — Goals: Advanced Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** The goal editor's Advanced section (A3b): a goal name the user
can type (it follows the attribute and *Applies to* until edited),
different importance below and above the range, and "Also keep each day
in range" with its own importance for a daily average. The server sends
them to the library and keeps goal names unique.

**Architecture:** No migration: slice 8 made every column. The four
advanced columns and the typed name join the goal's API fields.
`server/translate.py` names goals with typed names first and gives the
library its own constraint keys, so no name a user types can clash with
a library name; `server/freeze.py` matches violations by key. In the app,
`goals.ts` gains the naming rule (mirroring the server's) and
`GoalDialog.vue` the Advanced section.

**Tech Stack:** as slice 8, plus Quasar `QExpansionItem` and `QToggle`.

**Specs:** A3b and "Importance" in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md)
(the "GUI spec"); the goals table and "The server translates" in
[`2026-10-22-gui-tech-stack-design.md`](../specs/2026-10-22-gui-tech-stack-design.md)
(the "stack spec"); slice 9 in
[`2026-10-22-gui-slices.md`](2026-10-22-gui-slices.md); slice 8's plan
[`2026-10-26-gui-slice-8-goals.md`](2026-10-26-gui-slice-8-goals.md)
(its numbered decisions are "slice 8 decision N" below).

**Status:** Built and committed task by task on branch
`claude/gui-slice-9-goals-advanced`. Each task names its files and how it
was checked; the code is in the commits.

## Global Constraints

- `meal_planner/` is not changed.
- Server tests use SQLite, or Postgres when `TEST_DATABASE_URL` is set;
  the migration test stays green (no new migration).
- All GUI text goes through vue-i18n, English file only.
- `web/openapi.json` and `web/src/api/schema.ts` are regenerated
  (`npm run gen:api` in `web/`) whenever the API changes.
- The Playwright flow gets the slice's step.

## Interpretations made in this plan

1. **API fields.** `GoalFields` gains `custom_name` (text the user typed,
   1–100 characters after trimming, `null` to follow the generated one;
   stored in the `name` column), `importance_below` and
   `importance_above` (1–5, `null`: the goal's importance),
   `day_guard_rail` (bool, default true) and `guard_rail_importance`
   (1–5, `null`: follows, decision 5). The answered `name` stays the
   name the goal reads by. Each new field has a default, so a body
   without them is a goal with no advanced settings.
2. **Unique names.** Typed names must differ from each other (422 on
   `custom_name`, "Another goal has this name"; exact match after
   trimming). Generated names are numbered around them, in goal order:
   a generated name's n-th use is "Protein per day" for n = 1 and
   "Protein per day (n)" after, and any candidate already taken (by a
   typed name or an earlier generated one) moves on to the next n. So
   the typed name keeps its text and the generated one moves. The
   longest generated name, " (100)" on a 100-character attribute's
   ", daily average", fits the 130-character column.
3. **The library gets keys, not names.** Each goal's constraint is
   named `goal 1`, `goal 2`, ... (its place in goal order). The day
   guard-rail ("<key> (day guard-rail)") and serving caps
   ("serving cap: <recipe>") then never meet a typed name, and slice
   11's clash report maps back to goals by key. `FrozenGoal` gains the
   key; the frozen copy stores the name, as before. This replaces slice
   8's rule that a goal's own name wins over another goal's guard-rail
   name, which no longer can happen.
4. **Importance below and above** (Prefer with both bounds only). The
   Advanced section has "Different importance below and above"; on, it
   shows two sliders, "Below the range" and "Above the range", starting
   at the goal's importance, and the main importance slider is replaced
   by the line "Set below and above, under Advanced". Off sends both as
   `null`. The server stores them only for a Prefer goal with both
   bounds (otherwise NULL), so a hidden setting never changes a plan.
   Translation: `weight_below`/`weight_above` from the importance table,
   `null` → not given. The Goals card's chip shows the two importances
   as "●●○○○ / ●●●●○" (below / above).
5. **Day guard-rail** (daily average only). "Also keep each day in
   range", on by default, and under it "Importance of each day" (a
   slider), shown for Must and Prefer goals. While
   `guard_rail_importance` is `null` the slider shows one step below the
   goal's importance (at least 1) for a Prefer goal, and 2 for a Must
   goal, and follows the goal's importance; moving the slider sets it.
   Translation: on → `add_day_guardrail=True` and `guardrail_weight`
   from the table when set; when `null`, not given for a Prefer goal
   (the library's half of each side's weight, which is one step below)
   and 0.5 (importance 2) for a Must goal. So a Must goal's hidden
   importance never reaches the plan (the slices plan's note on the
   hidden weight). Off → `add_day_guardrail=False`. For other scopes the
   server stores the defaults (on, NULL); with the guard-rail off it
   stores `guard_rail_importance` as NULL.
6. **The zero-bound field** (slice 8 decision 6) now depends on the
   guard-rail: a soft penalty is built when the goal is Prefer, or it is
   a daily average with the guard-rail on. Same rule on server and app.
7. **The live name.** The Advanced section's "Goal name" field shows the
   name the goal would get, numbered as decision 2 against the other
   goals, and follows the attribute and *Applies to* until the user types
   in it. Clearing it goes back to following. The app computes the name
   with `goalNames` in `goals.ts`, the same rule as the server's
   `translate.goal_names`, both tested on the same cases.
8. **Advanced is collapsed** for a new goal and for a goal without
   advanced settings, and open for a goal with a typed name, different
   below and above importance, or a guard-rail that is off or has its
   own importance.
9. **The Goals card** shows a typed name as the row's title, with the
   attribute before the range ("Protein · at least 120 g"); otherwise
   the attribute, as in slice 8.
10. **Field errors** from the server show on their fields:
    `custom_name` on the name (which opens Advanced), the importances
    and guard-rail on theirs (general error otherwise).

## Tasks

### Task 1: Advanced goal fields on the server

**Files:** `server/api/plan.py`, `server/translate.py`,
`server/freeze.py`, `server/api/solve.py`, `server/models.py`
(docstring), `web/openapi.json`, `web/src/api/schema.ts`,
`web/src/test-data.ts`, `web/src/plan.ts` (`goalFields` sends the new
fields back), `tests/server/{test_plan,test_translate,test_freeze,test_solve}.py`.

**Interfaces produced:**
- `GoalFields` as decision 1; `Goal.name` the answered name.
- `translate.needs_zero_reference(applies_to, must, day_guard_rail, min,
  max)`; `translate.goal_names(goals)` as decision 2;
  `translate.constraint_key(position) -> str` ("goal 1");
  `translate.constraint(goal, key)` with decisions 4 and 5.
- `FrozenGoal(key, name, applies_to, must, min, max)`.

**Tests:** round trip of each new field; dropped when not applicable
(decisions 4, 5); 422s: duplicate typed names, importances outside 1–5,
empty or too long name. Naming: typed names kept, generated numbered
around them, "(2)" taken by a typed name moves the generated to "(3)".
Translation: weights below/above, guard-rail off, guard-rail importance
set, `null` for Prefer and for Must, keys. Zero reference with the
guard-rail off. Freeze: misses matched by key, guard-rail misses on
their goal, a goal typed "X (day guard-rail)" or "serving cap: Y" gets
no other's misses. Solve: a plan with a typed name and the split solves
and stores the name.

**Checked:** 574 Python tests pass on SQLite, the migration test among
them; typecheck, lint and Vitest (218 tests) pass. The API schema was
regenerated.

Differences from the plan text: the guard-rail settings reach the
library only for a daily average (other goals get the library's
defaults, which they don't use); the goal editor got a stopgap that kept
a loaded goal's advanced settings, replaced in Task 2.

### Task 2: The Advanced section in the app

**Files:** `web/src/goals.ts` and its test,
`web/src/components/{GoalDialog,GoalsCard}.vue` and their tests,
`web/src/test-data.ts`, `web/src/i18n/en.json`.

**Interfaces consumed:** Task 1's API.

**Interfaces produced (`web/src/goals.ts`):** `goalNames(goals:
NameInput[], attributes): string[]` (decision 2),
`needsZeroReference` with `day_guard_rail` (decision 6),
`guardRailImportance(goal): number` (decision 5's shown value).

**Tests:** goals.ts: the server's naming cases; the zero reference with
the guard-rail off; the guard-rail importance shown. Goal editor: the
name follows the attribute and *Applies to* and stops once edited,
clearing it follows again; the split only for Prefer with both bounds
and the main slider replaced; the guard-rail only for a daily average;
Advanced open for a goal with advanced settings; Save sends the fields;
a server error on the name shows on it. Goals card: typed name as
title; split chip.

**Checked:** typecheck, lint and Vitest (245 tests) pass; the editor
was looked at in a browser at 390 px.

Differences from the plan text: a cleared name follows again when the
field is left, not on each keystroke, so the generated name doesn't jump
back while the user is deleting; `test-data.ts` needed no change.

### Task 3: End-to-end test and docs

**Files:** `web/e2e/catalog.e2e.ts`, `README.md`, this plan, the slices
plan.

**Test:** after adding the goal, open it, type the name "Energy floor"
under Advanced, save; the Goals card shows "Energy floor".

**Checked:** passes against uvicorn on SQLite with the built app.

## Done when

A goal's name, below/above importance and day guard-rail can be set in
the editor's Advanced section and reach the plan; no typed name can
clash with another goal's or a library name; CI is green.
