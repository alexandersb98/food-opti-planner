# GUI Slice 5 — Ingredients Implementation Plan

**Goal:** Manage ingredients: a list with search (C3) and an editor
(C4) with Name, Measured in, the value basis, one value per attribute
and tag on/off buttons. Attribute and tag deletes now count and cascade
to ingredients. The translation to the library starts, and so does the
Playwright end-to-end suite.

**Architecture:** Three tables (migration `0004`): `ingredients`,
`ingredient_values` (one row per typed value) and `ingredient_tags`.
`server/api/ingredients.py` holds the CRUD routes, plus `GET` by id for
the editor. `server/translate.py` starts the pure functions from stored
rows to library objects. In the app, `IngredientsPage.vue` replaces the
placeholder and `IngredientPage.vue` is the editor, on its own routes
(`/ingredients/new`, `/ingredients/:id`) outside the menu.

**Tech Stack:** as slice 1, plus `@playwright/test` (dev only).

**Specs:** C3 and C4 in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md)
(the "GUI spec"), "Storage", "The server translates" and "Testing" in
[`2026-10-22-gui-tech-stack-design.md`](../specs/2026-10-22-gui-tech-stack-design.md),
and slice 5 in [`2026-10-22-gui-slices.md`](2026-10-22-gui-slices.md).

**Status:** Built and committed task by task on branch
`claude/slice-5-ingredients`. Each task names its files and how it was
checked; the code is in the commits.

## Global Constraints

- `meal_planner/` is not changed.
- Server tests use SQLite, or Postgres when `TEST_DATABASE_URL` is set.
- All GUI text goes through vue-i18n, English file only.
- `web/openapi.json` and `web/src/api/schema.ts` are regenerated.

## Interpretations made in this plan

1. **Values and the basis are stored as `NUMERIC(15, 6)`:** at most 9
   digits before the point and 6 after. That is exact in Postgres and
   also in SQLite, which keeps numbers as floating point (15 digits
   survive). The API takes them as JSON numbers or strings and answers
   strings, exactly as typed except for trailing zeros ("1.50" reads
   back as "1.5").
2. **A value may be any number, including 0 and negatives**, as in the
   library. An empty field stores nothing, which counts as 0 (GUI spec
   C4). The basis must be above 0.
3. **The unit is required**, 1 to 20 characters, free text with g, ml
   and pcs as one-tap shortcuts. A new ingredient starts as "g", per 100.
4. **The basis follows the unit while it is the old unit's default**
   (100 for g and ml, 1 for anything else): switching g → pcs turns 100
   into 1, but a basis typed by hand, or one already stored, stays.
5. **A comma works as the decimal point** in number fields, since phone
   keyboards in many languages offer only a comma.
6. **The list is sorted by name**, not in the order added like
   attributes and tags, as there will be many more ingredients. Search
   matches part of the name, ignoring case.
7. **A list row shows** "per 100 g · Energy 389 kcal · Protein 16.9 g"
   (the typed values, in attribute order) and "Used in N recipes".
8. **The editor is its own page.** Save checks the fields, saves and
   returns to the list. The back arrow leaves without saving and without
   asking. Delete asks first ("Delete Oats? Nothing else uses it.")
   and is disabled, with a note, while recipes use the ingredient.
9. **"Used in N recipes · Show":** the count is shown (always 0 until
   slice 6); **Show** comes with slice 6, when there is something to
   show.
10. **Ids that name nothing answer 422 on their field**
    (`values.1.attribute_id`, `tag_ids.0`), as does a second value for
    the same attribute; a tag given twice counts once. The app shows a
    name in use and a number with too many digits on their fields, and
    anything else as "Could not save".
11. **The translation divides exactly:** the library gets
    `value / basis` as a `Decimal`, rounded only where the library
    rounds a recipe's totals.
12. **The Playwright suite starts here**, as the slice plan's rules
    say (slice 7's text, written earlier, also said "starts"). It runs
    in CI against the built container and Postgres, in a job that
    replaces the one that only built the container; deploy waits for
    it.

## Tasks

### Task 1: Server

**Files:** `server/models.py`, `server/migrations/versions/0004_ingredients.py`,
`server/api/{__init__,ingredients,attributes,tags,counts,errors}.py`,
`server/translate.py`, `web/openapi.json`, `web/src/api/schema.ts`,
`tests/server/{test_ingredients,test_translate,test_tags}.py`.

**Interfaces produced:**
- `server.models.Ingredient`, `IngredientValue`, `ingredient_tags`,
  `VALUE_DIGITS`, `VALUE_DECIMALS`
- `GET/POST /api/ingredients`, `GET/PUT/DELETE /api/ingredients/{id}`;
  `ingredients` in `GET /api/counts`; real `ingredient_count` on
  attributes and tags
- `server.api.errors.invalid_fields`
- `server.translate.ingredient`

**Tests:** list, read, create, update (every field, and clearing values
and tags), delete (with its values and tags); values and bases read
back exactly as typed, also when sent as JSON numbers; trimming;
invalid fields answer 422 (empty or long name or unit, basis 0,
negative, not a number, NaN, infinity, too many digits); unknown
attribute and tag ids and a repeated attribute answer 422 on their
field; a name in use answers 409 on create and rename and changes
nothing; unknown ids answer 404; counts. Cascades: attributes and tags
count their ingredients, and deleting them removes the values and tags
from ingredients. Translation: value ÷ basis, a basis of 1, exact
division, an attribute without a value counts as 0.

**Checked:** 136 server tests pass on SQLite and on Postgres 16,
including the migration test.

### Task 2: Web

**Files:** `web/src/pages/{IngredientsPage,IngredientPage}.vue` and
their tests, `web/src/numbers.ts` and its test, `web/src/pages.ts`,
`web/src/router.ts`, `web/src/i18n/en.json`,
`web/src/layouts/MainLayout.test.ts`.

**Tests:** the list is sorted by name with values per basis and recipe
counts; search narrows it; empty list; rows and the + button open the
editor; failed load. The editor opens with fields, values and tags;
Save sends the typed values (empty ones left out, a comma read as a
point) and returns to the list; a new ingredient starts as g per 100
and the basis follows the unit, but not once typed by hand nor when an
ingredient is opened; wrong fields are marked and nothing is sent; a
name in use and a too-long number show on their fields; other failures
say so; delete asks first; an ingredient in use can't be deleted; no
attributes or tags says where to add them; an unknown ingredient fails
to load; back leaves without saving. The menu shows the ingredient
count.

**Checked:** lint, typecheck, Vitest (54 tests) and `vite build` pass.
Screenshots of both pages at 390 px looked right.

### Task 3: End-to-end tests

**Files:** `web/playwright.config.ts`, `web/e2e/catalog.e2e.ts`,
`web/package.json`, `web/tsconfig.json`, `web/eslint.config.ts`,
`.gitignore`, `.github/workflows/ci.yml`.

**Test:** in Chromium at 390 × 844: log in; add an attribute, a tag and
an ingredient with a value and the tag; the list shows the value, and
it reads back after a reload; the tag is no longer "added by hand";
the attribute's delete warning counts the ingredient; nothing scrolls
sideways.

**Checked:** passes against uvicorn on Postgres 16, and against the
built image run as the CI job runs it. `actionlint` passes.

### Task 4: Docs

**Files:** `README.md` (status, how to run the end-to-end tests), this
plan, and slice 7 in `2026-10-22-gui-slices.md` (the suite already
exists by then).

## Done when

Ingredients can be listed, searched, added, edited and deleted;
attribute and tag deletes warn about and remove their ingredient values
and tags; the menu shows the ingredient count; the end-to-end test runs
in CI; CI is green.
