# GUI, first version — Vertical Slices

**Status:** Agreed with the user. The results screen must be designed
before slice 7 (see "Before slice 7" below).

**Specs:** [`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md)
(the "GUI spec", screen ids A1, C2, ...) and
[`2026-10-22-gui-tech-stack-design.md`](../specs/2026-10-22-gui-tech-stack-design.md)
(the "stack spec").

**What this is:** the order in which the GUI gets built. Each slice
goes through the whole stack (table and migration, API, translation,
screen, tests). It is planned, implemented, reviewed and merged on its
own, and `main` works after each merge. Each slice gets its own detailed
implementation plan (`docs/superpowers/plans/`) just before it is built.
This document does not contain those plans.

## Rules for every slice

- `meal_planner/` is not changed. A slice that seems to need a library
  change stops and raises it as an open question.
- A slice ships its own Alembic migration. The migration test (all
  migrations on an empty database compared with the models) stays green.
- API tests run on SQLite and, in CI, on Postgres.
- Each mapping rule from the stack spec's "The server translates" list
  gets its translation test in the slice that first needs it.
- New GUI text goes through vue-i18n (English file only).
- `web/src/api/schema.ts` is regenerated whenever the API changes. The
  staleness check fails if it is not.
- Delete warnings and cascades grow slice by slice. The counts an
  attribute or tag delete reports include whatever tables exist by then.
  Each later slice extends them and their tests.
- The Playwright end-to-end suite starts in slice 5 and gets one more
  step in each later slice that changes the flow.

## Overview

| # | Slice | Screens | Usable result after merge |
|---|---|---|---|
| 0 | Walking skeleton | C0 (empty pages) | Container runs locally; menu with five empty pages; CI green |
| 1 | Login | login page | Every `/api` route behind the password |
| 2 | Deploy to Cloud Run | — | App live at its Cloud Run URL (owner does one-time setup) |
| 3 | Attributes | C5 | Manage attributes |
| 4 | Tags | C6 | Manage tags |
| 5 | Ingredients | C3, C4 | Manage ingredients with values and tags |
| 6 | Recipes | C1, C2 | Manage recipes; derived tags and per-portion totals |
| 7 | Schedule and Make plan | A1 (part), A2, results | **First real plan**, without goals or filters |
| 8 | Goals: main form | A1 goals card, A3, A3c | Plans that follow Must and Prefer goals |
| 9 | Goals: advanced | A3b | Custom names, below/above importance, day guard-rail |
| 10 | Recipe filters | A1 recipes card, A4 | Only / Never tags, live recipe count |
| 11 | Must goals clash | A5 | Infeasible plans explained and fixable |

Order of dependencies: 0 → 1 → 3 → 4 → 5 → 6 → 7 → 8 → {9, 10, 11}.
Slice 7 also needs the results screen design (see "Before slice 7").
Slice 2 can merge at any time after 1. Slices 9, 10 and 11 depend only on
8 and can go in any order.

## Slices

### 0 · Walking skeleton

The bare minimum for every later slice: the project layout, build,
tests and CI, with no features.

- `server/`: FastAPI app, `GET /api/health` (runs `SELECT 1` through
  SQLAlchemy), settings from environment variables (database URL),
  Alembic with an empty first migration run on startup.
- `web/`: Vite + Vue 3 + TypeScript + Quasar (Vite plugin), Vue Router
  with the five pages (Plan, Recipes, Ingredients, Attributes, Tags) as
  empty placeholders, `QLayout` + `QDrawer` hamburger menu (C0, without
  counts), vue-i18n, Vite dev proxy for `/api`.
- `Dockerfile` (Node build stage, Python run stage serving `web/dist`
  at `/` and the API at `/api`).
- `openapi-typescript` generation and the staleness test.
- GitHub Actions CI for pull requests and `main`: pytest (library and
  server) on SQLite and against a Postgres service, Vitest, `vue-tsc`,
  ESLint. No deploy step yet.
- `pyproject.toml`: server dependencies as a separate optional group so
  the library keeps only `ortools`.

**Tests:** health returns 200 with a working database and an error
without one; migration test; a Vitest test that the menu lists five
pages; the container builds in CI.

**Done when:** `docker run` shows the menu at phone width and
`/api/health` answers; CI is green.

### 1 · Login

Placed early so every later API test is written against an
authenticated client from the start, and so nothing is deployed without
the password.

- `POST /api/login`, `POST /api/logout`; Argon2 hash from an environment
  variable (Secret Manager in production); signed session cookie
  (HttpOnly, Secure, SameSite=Strict, 30 days); growing delay per failed
  attempt.
- All `/api` routes except login and health need the cookie, otherwise 401.
- Frontend login page; the API client sends the user there on any 401.
- A small script to make the password hash for the owner.

**Tests:** no session → 401; right password → cookie with the right
flags; wrong password → delayed and 401; logout clears the session;
health stays open. Vitest: a 401 leads to the login page.

### 2 · Deploy to Cloud Run

- Deploy job in the workflow on push to `main`: build the image, push to
  Artifact Registry, deploy to Cloud Run (settings table in the stack
  spec), call `/api/health` on the new revision.
- Workload Identity Federation, no stored keys.
- `docs/deploy.md`: the owner's one-time steps (Google project, Artifact
  Registry with cleanup policy, Workload Identity Federation, Secret
  Manager with the three secrets, $1 budget alert, Neon database).

Claude writes the workflow and guide but does not connect to any live
environment. The deploy job fails until the owner has done the setup,
so this slice merges once the owner is ready. It can wait until any
later slice.

**Tests:** the workflow file is checked by a linter (`actionlint`) in CI.
The deploy itself is checked by the health call.

### 3 · Attributes (C5)

- `attributes` table (name unique, unit, decimals).
- `/api/attributes` list, create, update, delete; a name clash is a 409
  with a field error.
- C5 page: list, edit in place (Name, Unit, Decimals), "+ New
  attribute", delete with a warning (counts are 0 until slices 5 and 8).
- Menu count for Attributes. Each later catalog slice adds its own count.

**Tests:** CRUD, unique name, delete. Component test for in-place
editing.

### 4 · Tags (C6)

- `tags` table (name unique, derive rule `all` / `any`).
- `/api/tags` CRUD; C6 page with the rule toggle and delete warning.
- "added by hand" label: every tag gets it until ingredients exist
  (slice 5 makes it real).

**Tests:** CRUD, unique name, derive rule round-trip.

### 5 · Ingredients (C3, C4)

- `ingredients`, `ingredient_values`, `ingredient_tags` tables;
  values stored as typed, in `NUMERIC`.
- `/api/ingredients` CRUD. Responses include "used in N recipes" (0
  until slice 6).
- C3 list with search; C4 editor: Name, Measured in, value basis
  (default 100 for g and ml, 1 for pcs), one row per attribute, tag
  on/off buttons.
- Attribute delete now counts and cascades ingredient values. Tag
  delete cascades from ingredients. Tag "added by hand" label uses real
  data.
- Translation (first part): `Ingredient` from stored rows, typed value
  ÷ basis, empty value → 0.

**Tests:** CRUD; decimals stored exactly; cascades from attribute and
tag deletes with correct warning counts; translation tests for the value
basis and empty values.

### 6 · Recipes (C1, C2)

- `recipes`, `recipe_items`, `recipe_extra_tags` tables; ingredient
  delete blocked by the foreign key while in use (API answers 409).
- `/api/recipes` CRUD. Responses include derived tags (computed by the
  library's `Recipe`, so the tag rule exists once) and per-portion
  totals.
- C1 list with search and quick tag chips; C2 editor: ingredient rows
  with a searchable picker, live per-portion totals (frontend sum),
  derived and added tags, portion size (From/To ×, Any amount / In
  steps, Advanced: hard upper limit and over-size penalty), delete.
- C4 "Used in N recipes · Show" becomes real, and Delete is disabled
  while in use.
- Translation: `Recipe` with items, extra tags and portion-size fields.

**Tests:** CRUD; in-use ingredient delete blocked; derived tags for
`all` and `any` rules; translation tests for recipes. Vitest:
per-portion totals.

### 7 · Schedule and Make plan

The first slice where the app does what it is for. Goals and filters
come later, so the plan is chosen only by the recipes' own limits.

- `plan`, `plan_slots`, `plan_day_minimums` tables (one plan row,
  created with defaults: today, 7 days, Breakfast / Lunch / Dinner,
  30 s).
- `GET/PUT /api/plan` for the schedule and max solving time (ceiling
  5 minutes); `POST /api/plan/solve`.
- A1 with the Schedule card, Max solving time and the fixed **Make
  plan** button; A2 editor with start date, number of days, meal names
  sub-screen, the plan/skip grid and the "At least" column.
- Translation: the whole `PlanRequest` from stored data (schedule grid →
  `Day`/`Slot`, "all" → `min_meals_per_day=None`, `solve_time_limit`).
- The results screen, as designed before this slice (see "Before
  slice 7" below).
- Playwright suite starts: log in, add an attribute, ingredient and
  recipe, make a plan, see the result.

**Tests:** translation tests for the schedule rules; API test that
solve returns a plan; Playwright as above.

### 8 · Goals: main form (A3, A3c, A1 goals card)

- `goals` table (all columns from the stack spec, including the
  advanced ones, so slice 9 needs no migration); cascade with the
  attribute.
- Goals in `GET/PUT /api/plan`.
- A3 bottom sheet: attribute, Min/Max (at least one), Applies to,
  Must/Prefer, importance 1–5 (Prefer only), the zero-bound field.
  Generated name, " (2)" for a second goal on the same thing.
- A1 goals card: one row per goal with range wording, scope and chip.
- Attribute delete now counts and cascades goals.
- Translation: importance → weight, scope and aggregate, Must/Prefer →
  `hard`, zero-bound field → `normalization_reference`, goal names.

**Tests:** translation tests for each rule above; attribute delete
cascades goals. Vitest: range wording, generated name; component test
for the conditional fields (zero-bound field, importance only for
Prefer). Playwright: the flow from slice 7 adds a goal.

### 9 · Goals: advanced (A3b)

- Advanced section: editable goal name (follows attribute and scope until
  the user edits it); different importance below and above (Prefer with
  both bounds); "Also keep each day in range" with its importance (Daily
  average only, on by default).
- Translation: `weight_below`/`weight_above`, `add_day_guardrail`,
  `guardrail_weight`.

**Tests:** translation tests for these; Vitest: the name stops following
once edited; component test for which advanced fields show when.

### 10 · Recipe filters (A4, A1 recipes card)

- `plan_tag_filters` table; tag delete now also cascades filters (and
  the warning says so).
- Filters in `GET/PUT /api/plan`; `POST /api/plan/recipe-count` for the
  live count while editing.
- A4 page with Any / Only / Never per tag and the live count; A1 recipes
  card with "N of M recipes can be used" and filter chips.
- Translation: Only / Never → `require_tags` / `exclude_tags`.

**Tests:** translation test; recipe count with and without filters; tag
delete cascades filters. Component test for the Any/Only/Never rows.

### 11 · Must goals clash (A5)

- Solve returns the clash report when STRICT mode is infeasible: each
  clashing Must goal's id, name and where it clashes (day label or
  "whole plan").
- A1 shows the red **No plan possible** card: editable bound(s) per
  clashing goal, **Make Prefer**, **Try again**; the clashing goals are
  marked red in the goals list.
- The library also reports `min_meals_per_day` in a conflict (core plan
  interpretation 3). The slice's plan must decide how A5 shows it,
  since it is not a goal.

**Tests:** API test that clashing Must goals return the report with
ids; Playwright: add a clashing Must goal, see the card, Make Prefer,
Try again succeeds.

## Before slice 7: design the results screen

The GUI spec leaves the results screen undesigned, but from slice 7 on
**Make plan** has to show the plan, and the stack spec's end-to-end
test makes one. The user chose to design the results screen first
rather than ship a temporary list. That design (a spec with wireframes,
like the GUI spec) must be agreed before slice 7's plan is written. It
should also say how missed Prefer goals are shown (needed from slice 8)
and may decide how a clashing day minimum is shown (slice 11). Slices
0-6 do not depend on it, so the design can be done alongside them.

## Not in any slice

As in the specs: several users or plans,
JSON export/import, Swedish text, visual style beyond Quasar's defaults.
