# Slice R2 — Servings, Sections, Instructions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** Cookbook recipes can be typed in with their structure. A recipe
has **Serves N** (amounts are for the whole recipe, per-portion totals and
the planner's portion divide by N), **sections** with optional headings
(one unnamed section looks as the editor does today), the same ingredient on
several lines, **Instructions** and a **Source** link. Every existing
recipe migrates to servings 1 and one unnamed section, and gives the library
exactly the `Recipe` it gave before. C4's "Used in N recipes" counts recipes,
not lines.

**Architecture:** One Alembic migration (`0010`) adds `recipes.servings`,
`instructions`, `source_url`, a `recipe_sections` table, and re-keys
`recipe_items` by its own `id` with `section_id`, `position` and
`original_text`. `models.Recipe` gets `sections` and a read-only `lines`
property (every line in display order); every server reader of a recipe's
lines (`translate.recipe`, the totals and derived tags in `api/recipes.py`,
the U3 recipe-amount converter) goes through `lines` or the section join, so
the section structure is known in one place each. `translate.recipe` sums the
lines per ingredient and divides by servings, so the library still gets one
`IngredientAmount` per ingredient, for one portion. The API replaces
`items` with `sections[].items` and gains `servings`, `instructions`,
`source_url`; a save rebuilds the sections and lines (no line has an id the
client knows). The app's recipe draft becomes sections of lines with client
keys; a new `RecipeSection` component renders one section, `RecipePage` keeps
the page-level fields.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic; Vue 3, Quasar, vue-i18n,
Vitest, Playwright.

**Specs:** the import spec
[`2026-11-07-recipe-import-design.md`](../specs/2026-11-07-recipe-import-design.md)
(decisions 6, 9, 10, 11; "Data model" `recipes`, `recipe_sections`,
`recipe_items`; "Migration of existing data"; "Conversion when a plan is
made" without the unit steps; "C2 for all recipes" without the unit picker
and the import review); the GUI wireframes C2 and C4
([`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md));
the master plan's R2 entry
([`2026-11-08-units-sources-import-slices.md`](2026-11-08-units-sources-import-slices.md)).
Not in this slice: `recipe_items.unit` and conversions (R3), the unit picker
per line (R3), anything with AI, the import page and the import review states
(R4, R5), the source-line display (R4).

**Status:** Planned; to be built task by task on branch
claude/implement-remaining-slices-qwrp83.

## Global Constraints

- `meal_planner/` is not changed.
- One migration, `0010`; the migration test (`test_migrations_build_the_tables_the_models_describe`)
  stays green and gets a data test (Task 1). The migration must run on SQLite
  and on Postgres (CI runs the server tests on both): no SQLite-only or
  Postgres-only SQL, no `ALTER ... DROP/ALTER COLUMN` (SQLite lacks it).
- All GUI text goes through vue-i18n, English file only
  (`web/src/i18n/en.json`).
- After the API change (Task 2): `npm run gen:api` in `web/` (regenerates
  `web/openapi.json` and `web/src/api/schema.ts`; `web/src/test-units.json`
  must come out unchanged).
- The Playwright flow gets a step (Task 5).
- No test calls the internet or an AI service.
- Checks before each commit: `python3 -m pytest -q` at the root; `npm run
  lint`, `npm run typecheck`, `npm test` in `web/`.
- **Built after U3 and D1-D6.** This plan names functions and tests, never line
  numbers. D1-D6 do not touch recipes. **U3 is the one slice that does** (see
  the next section); re-read `server/unit_change.py` and
  `tests/server/test_unit_change.py` as they are when Task 2 starts.
- **Do first (separate commit, before Task 1):** the refactoring in
  `.superpowers/sdd/2026-11-08-units-sources-import-slices/r2-refactor.md`, if
  the controller has it done by then. This plan is written so it also works
  without it: where Task 2 changes the test helpers, the text says "the
  `recipe_body` helper (or, without the refactoring, each of the places
  listed)".

## U3 interplay: re-keying `recipe_items` must keep the unit-change converter working

U3 (`server/unit_change.py`, a `Converter(key, numbers)` list per entity)
reads and writes `recipe_items` in exactly one place: the inner function
`amounts` of `ingredient_converters` (key `recipe_amounts`, kind
`recipe_amount`). It selects `models.RecipeItem` joined to `models.Recipe` on
`RecipeItem.recipe_id`, orders by `RecipeItem.recipe_id`, and uses
`row.recipe_id` as the `Number.row_id`. After this slice `recipe_items` has
no `recipe_id`, so that query would raise. R2 therefore changes that one
function (Task 2) and nothing else in the converter list or the arithmetic:

- Join through the section: `RecipeItem` -> `RecipeSection` (on
  `section_id`) -> `Recipe` (on `RecipeSection.recipe_id`); select the item,
  `Recipe.name`.
- Order by `Recipe.id`, `RecipeSection.position`, `RecipeItem.position`, so the
  refusal "the first problem found, going through each converter's rows in
  order" still names the first line in a stable order.
- `Number.row_id` becomes the item's own `id` (it was the recipe id, which was
  unique per line only because an ingredient was on one line per recipe). The
  count `recipe_amounts` thus counts lines (amounts), which is what the dialog
  text "N recipe amounts" says; a recipe that has the ingredient on two lines
  counts two. `Number.name` stays the recipe's name, `kind` stays
  `recipe_amount`, `field` stays `amount`, `positive=True` stays.
- The write still sets `RecipeItem.amount`. Servings do not enter: a unit
  change multiplies the whole-recipe amount by the ratio, and `servings` is a
  count of portions with no unit, so it is untouched, as are
  `original_text` and the position.
- U3's tests that go through the API (`world()` builds recipes through
  `catalog.recipe`; `test_an_ingredient_counts_its_basis_and_recipe_amounts`,
  `test_apply_writes_every_converted_number`) keep passing with the same
  numbers because each of those recipes has the ingredient on one line. R2
  adds tests for two lines in one recipe and in two sections (Task 2).
- R3 (later) adds the `unit` column and a second converter on the same
  tables; it will build on the join written here, so write the join as a
  small private helper in `unit_change.py` (`_recipe_lines(ingredient_id)`
  returning the select) that both `amounts` and R3's converters can use.

If U3 changed the shape of `amounts` or the `Number` fields while being
built, keep its shape and only repair the select, the ordering and `row_id`.

## Interpretations made in this plan

1. **`items` becomes `sections[].items` in the API; no compatibility shim.**
   The only client is the app, changed in the same slice. A recipe is
   `{id, name, servings, instructions, source_url, sections: [{name, items:
   [{ingredient_id, amount, original_text}]}], extra_tag_ids, ...portion
   fields, derived_tag_ids, totals}`. A section's lines are called `items`
   (the table and the existing i18n use that word); the UI says "ingredients".
2. **Bounds the spec leaves open.** `servings`: integer, 1 to 1000 (below 1
   refused as the spec says; the top keeps `amount / servings` and totals
   sane). `instructions`: at most 20000 characters. `source_url`: at most 2000
   characters, empty or starting `http://` or `https://` (error type
   `invalid_url`, on `source_url`), so the link the app shows can't be a
   `javascript:` URL. `original_text`: at most 500 characters, sent always
   (may be empty). At most 50 sections and 200 lines per section. Instructions
   and source URL are stored as sent (instructions keep their line breaks;
   the URL is trimmed).
3. **Section names.** A name is trimmed, 0 to 100 characters. When a recipe has
   more than one section every section needs a name (422 `name_required` on
   `sections.{i}.name`); a recipe with one section may leave it unnamed (shows
   no heading) or name it. A section may have no lines (it is a heading with
   nothing under it yet), but a recipe needs at least one line in all
   (422 `no_items` on `sections`, "Add at least one ingredient", replacing
   today's `items` min length). Two sections may share a name.
4. **A save rebuilds the sections and lines** (`recipe.sections` replaced; the
   old rows go by delete-orphan, as the old items did). Nothing outside the
   recipe refers to a line's `id`, and the client never sees it. The ids
   change on every save; that is deliberate and tested not to matter.
5. **Translation** (`translate.recipe`): per ingredient, add its lines'
   amounts (exact `Decimal` sum), then divide once by `servings`; one
   `IngredientAmount` per ingredient, in the order of each ingredient's first
   line (sections in order, lines in order). With servings 1 and one line per
   ingredient this is exactly what the library got before. R3 will convert
   each line's unit before the sum.
6. **Totals are exact.** `api/recipes._total` sums amount x value / basis over
   all lines as `Fraction`, then divides the sum by `servings` once, and rounds
   half away from zero as now. The editor does the same
   (`web/src/totals.ts`), so the two keep agreeing on rounding ties (a test
   with a tie and servings 3 on both sides).
7. **`models.Recipe.lines`** is a read-only property: every `RecipeItem` of the
   recipe in display order (sections by `position`, lines by `position`, both
   given by the relationships' `order_by`; for objects not yet saved, list
   order). Derived tags use the recipe's distinct ingredients.
8. **`recipe_count`** of an ingredient counts distinct recipes
   (`count(distinct recipe_sections.recipe_id)` over its lines), so two lines
   in one recipe count once. Deleting an ingredient a recipe uses is still
   refused 409 by the foreign key (`RESTRICT` on `recipe_items.ingredient_id`).
9. **The ingredient picker no longer leaves out ingredients already in the
   recipe** (the same ingredient may be on several lines). The `exclude`
   prop, the "Every ingredient is in the recipe already." message and the
   test of the exclusion go.
10. **Sections in the editor.** One unnamed section shows no name field and no
    section controls except **+ Add section**. Adding one shows a name field on
    every section (all required). Each section has its own **+ Add
    ingredient**. A line's menu lists "Move to {section}" for the other
    sections (an unnamed one reads "Section {n}"). **Remove section** (shown
    when there are two or more) moves its lines to the section above (below
    for the first one) and deletes the heading, so no line is lost. No
    reordering of lines or sections beyond that (not in the spec).
11. **`original_text` round-trips and is not shown.** The draft keeps it so a
    save does not lose it; R4's review shows it as the source line.
12. **Per-portion language.** "Ingredients, for 1 portion" becomes "Ingredients,
    for {n} portion(s)" with n the typed servings (1 while it is not a valid
    number), plus the hint "Amounts are for the whole recipe." The Recipes
    page intro loses "entered for one portion". The Recipes list still shows
    "Per portion: ..." (the server's totals, already divided).
13. **A line's client key.** The draft gives each line and section a number
    key (a counter) for `v-for` and for the errors, because the ingredient id
    is no longer unique in a recipe. Amount errors are kept by line key; the
    server's errors, which name `sections.{i}.items.{j}.amount`, are mapped
    back to keys by position.
14. **Downgrade is lossy and says so.** `0010`'s downgrade restores the old
    shape by summing each ingredient's amounts per recipe, divided by
    `servings` (rounded to 6 decimals), in display order of the first line; the
    sections, instructions and source URL are dropped.
15. **The import spec's wording is brought into line** in Task 6: "Slices 2"
    now says R2 and R3; the per-line unit and the unit picker are R3.

## Tasks

### Task 1: Server: model, migration `0010`, translation

**Files:** modify `server/models.py`, `server/translate.py`, `server/queries.py`;
create `server/migrations/versions/0010_recipe_sections.py`; modify
`tests/server/test_translate.py`, `tests/server/test_migrations.py`.

**Build:**

- `models.py`: `Recipe` gains `servings: Mapped[int]`,
  `instructions: Mapped[str] = mapped_column(Text)`,
  `source_url: Mapped[str] = mapped_column(String(SOURCE_URL_LENGTH))`
  (constant 2000, next to `NAME_LENGTH`; also `INSTRUCTIONS_LENGTH = 20000`
  and `ORIGINAL_TEXT_LENGTH = 500`, shared by the API's limits), and
  `sections: Mapped[list["RecipeSection"]]` (cascade `all, delete-orphan`,
  `passive_deletes=True`, `order_by="RecipeSection.position"`) replacing
  `items`. Add the `lines` property (interpretation 7). New
  `RecipeSection(id, recipe_id FK cascade, position, name String(NAME_LENGTH),
  items relationship ordered by position, cascade as above)`. `RecipeItem`
  becomes `id` (primary key), `section_id` FK (`ondelete="CASCADE"`),
  `position`, `ingredient_id` FK (`ondelete="RESTRICT"`), `amount`
  (`EXACT_NUMBER`), `original_text: String(ORIGINAL_TEXT_LENGTH)`, and
  `ingredient` relationship. Add `RecipeSection` to `__all__`. Update the
  docstrings: an item is an amount of an ingredient in the recipe, for the whole
  recipe, in the ingredient's unit.
- `queries.recipes()`: load `Recipe.sections -> RecipeSection.items ->
  RecipeItem.ingredient` and keep the ingredient's values and tags loaded as
  now (the `ingredient` loader option is built from the longer chain).
- `translate.recipe` per interpretation 5 (group by the ingredient object, not
  its id, so unsaved test rows work); update its docstring: "amounts are for
  one portion".
- Migration `0010` (revision "0010", down "0009"), steps in this order:
  1. `op.add_column` on `recipes`: `servings` Integer not null
     `server_default="1"`; `instructions` Text not null `server_default=""`;
     `source_url` String(2000) not null `server_default=""`. (The models carry
     no server defaults; `compare_metadata` ignores them.)
  2. `op.create_table("recipe_sections", ...)`: `id` pk, `recipe_id` FK
     `recipes.id` cascade, `position` Integer, `name` String(100) not null.
  3. `INSERT INTO recipe_sections (recipe_id, position, name) SELECT id, 0, ''
     FROM recipes`.
  4. `op.create_table("recipe_items_new", ...)` with the new shape
     (`original_text` String(500) not null).
  5. `INSERT INTO recipe_items_new (section_id, position, ingredient_id,
     amount, original_text) SELECT s.id, i.position, i.ingredient_id,
     i.amount, '' FROM recipe_items i JOIN recipe_sections s ON s.recipe_id =
     i.recipe_id ORDER BY i.recipe_id, i.position`.
  6. `op.drop_table("recipe_items")`; `op.rename_table("recipe_items_new",
     "recipe_items")`. Give the new table's primary key and foreign keys
     explicit names (`pk_recipe_items`, `fk_recipe_items_...`) in step 4 so a
     Postgres rename leaves no `..._new_...` names behind and no clash with the
     dropped table's `recipe_items_pkey`.
  Downgrade per interpretation 14, in Python over `op.get_bind()`.
  Use `sa.table`/`sa.text` for the data steps, never the ORM models.

**Tests (write first):**

- `test_translate.py`: update the `porridge()` helper and the other builders to
  `models.Recipe(servings=1, sections=[models.RecipeSection(position=0,
  name="", items=[...])])`, add `original_text=""` where a line is built.
  Existing tests keep their assertions. New: servings divide
  (`test_amounts_are_the_whole_recipe_divided_by_servings`: 60 g and 200 ml,
  servings 4, gives 15 and 50); `test_lines_of_one_ingredient_are_summed`
  (oats 40 on one line, 20 on another section, gives one `IngredientAmount`
  of 60, in the first line's place); `test_the_ingredients_keep_the_order_of_their_first_line`
  across sections; `test_servings_that_do_not_divide_evenly_stay_exact_enough`
  (10 g / 3 times 3 within 1e-20 of 10, as the basis test does).
- `test_migrations.py`: `test_a_recipe_from_before_gives_the_same_library_recipe`:
  `command.upgrade(alembic_config(url), "0009")`; with the migration engine
  insert, by SQL, an attribute, two ingredients (one with a value and a tag),
  a tag and a recipe with two items at positions 0 and 1 (inserted in reverse
  order) and an extra tag; build the expected library `Recipe` by hand from
  those values; upgrade to head; load `queries.recipes()` in a `Session` and
  assert `translate.recipe(row) == expected`, `servings == 1`, one section
  named "" holding both lines in position order, `instructions == ""`,
  `source_url == ""`, `original_text == ""`. A second recipe with no items is
  not possible before (a recipe had at least one), so none. Also
  `test_downgrade_restores_one_line_per_ingredient`: after the above, add a
  second line of the first ingredient in a new section and servings 2 by SQL,
  downgrade to "0009", assert one row per ingredient with the summed amount
  divided by 2 in display order.

**Verify:** `python3 -m pytest tests/server/test_translate.py
tests/server/test_migrations.py -q`; run the migration test on Postgres too if
`TEST_DATABASE_URL` is available (it is in CI). The rest of the server suite is
red until Task 2; do not run it yet.

**Commit:** "server: recipe sections, servings and own-id lines; migration 0010".
(The tree is red between Tasks 1 and 2 only for the API tests; if the
implementer prefers a green history, Tasks 1 and 2 are committed together.)

### Task 2: Server: `/api/recipes`, ingredient counts, U3 converter

**Files:** modify `server/api/recipes.py`, `server/api/ingredients.py`,
`server/unit_change.py` (only `ingredient_converters`' `amounts`, see "U3
interplay"), `tests/server/conftest.py`, `tests/server/test_recipes.py`,
`tests/server/test_plan_results.py`, `tests/server/test_unit_change.py`,
`tests/server/test_delete_cascades.py` (only if it builds recipe bodies),
`tests/server/test_solve.py` / `test_plan.py` only where they post a recipe
body directly (grep `"items"`).

**Build (`api/recipes.py`):**

- Models: `RecipeLine {ingredient_id: int, amount: Number > 0, original_text:
  str (max 500)}`; `RecipeSection {name: trimmed str, max 100, may be empty;
  items: list[RecipeLine] (max 200)}` (the Pydantic names are the existing
  `RecipeItem` for the line, and `Section`; avoid a clash with
  `models.RecipeSection`); `RecipeFields` replaces `items` with `sections:
  list[Section]` (1 to 50) and adds `servings: int` (1 to 1000), `instructions:
  str` (max 20000), `source_url: str` (max 2000, trimmed). `Recipe` adds the
  same fields in its response; `RecipeFields` doc comments say amounts are for
  the whole recipe.
- `_fill` gathers the ingredient references with locations
  `["sections", i, "items", j, "ingredient_id"]` (type `unknown_ingredient`,
  no `unique`) and adds the checks of interpretation 3 and the URL check
  (`invalid_url`), all as `FieldError`s in one 422 with the existing portion
  and tag errors. It rebuilds `recipe.sections` (interpretation 4) inside the
  existing `no_autoflush` block; `_item` and the by-ingredient reuse go.
- `_Responses.response`: `sections` from `row.sections`; `derived_tag_ids`
  from the distinct ingredients of `row.lines`; `totals` from `_total`, which
  iterates `row.lines` and divides by `Fraction(row.servings)` once (docstring
  updated: "for one portion").
- `ingredients.py`: `_recipe_counts` counts distinct recipes through the
  section join (interpretation 8); `count_by` is no longer used for it.

**Build (`unit_change.py`):** the change described under "U3 interplay".

**Build (tests infrastructure):** `recipe_body` helper in `conftest.py` if the
refactoring was done, else update `RECIPE`, `Catalog.recipe`,
`fixed_portion_recipe` and `fields()` in `test_recipes.py`. The helper builds
`{**RECIPE, "name", "servings": 1, "instructions": "", "source_url": "",
"sections": [{"name": "", "items": [{"ingredient_id", "amount",
"original_text": ""}]}], "extra_tag_ids", **changes}`; `items` given as a list
of pairs go into one unnamed section; `sections=` in `changes` overrides.
`test_plan_results.py::test_a_saved_plan_is_unchanged_by_catalog_edits_and_deletes`
takes the first line from `recipe["sections"][0]["items"][:1]`.

**Tests (write first, in `test_recipes.py` unless said):**

- Update `test_a_created_recipe_is_listed_with_its_tags_and_totals`: the new
  response shape (servings 1, instructions "", source_url "", one section named
  "" with the two lines and `original_text` ""); totals unchanged.
- `test_servings_divide_the_totals`: servings 2 halves the totals; 4 with a
  rounding tie (16.5 of a value of 1 per basis 3 with servings 3 gives 1.83...,
  choose numbers so the exact total is a tie, e.g. amount 33, value 1, basis 3,
  servings 2: 5.5 rounds to 6) matches the web test's numbers.
- `test_a_solve_uses_the_amounts_per_portion`: a recipe of 120 g oats
  serving 4 (fixed portion 1) in a one-meal plan solves with a day total of the
  oats' energy for 30 g (through the existing solve helpers).
- `test_the_same_ingredient_on_several_lines_is_one_ingredient_to_the_planner`
  (lines in two sections: totals are the sum; `derived_tag_ids` as for one
  ingredient).
- `test_sections_keep_their_order_names_and_lines`; `test_a_single_unnamed_section_is_accepted`;
  `test_an_empty_section_is_accepted_beside_a_filled_one`.
- Refusals (422, `type` and `loc` checked): servings 0, -1, 1001, 1.5;
  `name_required` for an unnamed section among several (loc
  `body.sections.1.name`); `no_items` when every section is empty (loc
  `body.sections`); no sections at all; `invalid_url` for `javascript:alert(1)`,
  `ftp://x` and `example.com`; accepted: "" and `https://example.com/r?a=1`;
  instructions over 20000; an amount of 0 inside a section named by its
  position (`body.sections.1.items.0.amount`); an unknown ingredient named by
  its position (`unknown_ingredient`); more than 50 sections.
- `test_instructions_and_source_keep_their_text` (line breaks, trimmed URL).
- `test_a_save_rebuilds_the_lines_and_the_recipe_reads_back_the_same`: PUT the
  same body twice, GET is identical; PUT with fewer lines/sections removes the
  rest (count rows of `recipe_items` and `recipe_sections` through a session).
- `test_deleting_a_recipe_removes_its_sections_and_lines`.
- `test_original_text_round_trips`.
- `test_ingredients.py` or `test_recipes.py`:
  `test_an_ingredient_counts_recipes_not_lines` (two lines in one recipe, one
  in another: `recipe_count` is 2); the existing in-use delete test (409) still
  passes with an ingredient on two lines.
- `test_unit_change.py`: `test_a_recipe_with_the_ingredient_on_two_lines_converts_both`
  (Oats g to kg: counts `recipe_amounts` 2 for one recipe with two lines plus
  its other recipe's one, apply writes all amounts, servings and
  original_text unchanged); `test_the_first_refused_line_is_the_first_in_recipe_section_line_order`
  (an amount that rounds to 0 in a later section and an earlier one: the
  refusal names the earlier line's recipe).
- Existing tests updated only for the body shape; none weakened.

**Verify:** `python3 -m pytest -q`; then `cd web && npm run gen:api` and check
`git diff --stat` shows `openapi.json` and `schema.ts` changed and
`test-units.json` did not. `npm run typecheck` is red until Task 3.

**Commit:** "server: recipes have servings, sections and instructions" (include
the regenerated `web/openapi.json` and `web/src/api/schema.ts`).

### Task 3: Web: draft, totals, data helpers, i18n (no page yet)

**Files:** modify `web/src/totals.ts`, `web/src/totals.test.ts`,
`web/src/composables/useRecipeDraft.ts`, `.../useRecipeDraft.test.ts`,
`web/src/test-data.ts`, `web/src/i18n/en.json`,
`web/src/pages/IngredientPage.vue` and its test (the "Show" list),
`web/src/components/IngredientPicker.vue` (drop `exclude`).

**Build:**

- `totals.ts`: `portionTotals(items, attributes, servings = 1)`; the
  denominator is multiplied by `BigInt(servings)`. Rounding unchanged.
- `useRecipeDraft.ts`: types `DraftLine {key, ingredientId, amount,
  originalText}`, `DraftSection {key, name, items: DraftLine[]}`;
  `RecipeDraft` replaces `items` with `sections` and adds `servings`,
  `instructions`, `sourceUrl` (all strings as typed). `emptyDraft()` is one
  unnamed section, servings "1". `draftOf(recipe, step)` maps the sections.
  `RecipeErrors` gets `servings`, `sourceUrl`, `sectionNames` (by section key),
  `amounts` by line key, `items` (no lines). `checkRecipe` validates servings
  (digits only, 1 to 1000, message `recipes.servingsInvalid`), the source URL
  (empty, or `http(s)://` and no spaces; `recipes.sourceInvalid`), section names
  when there is more than one section (`recipes.sectionNameRequired`),
  amounts, at least one line, and sends the fields of the API (instructions as
  typed, URL trimmed). `serverErrors` maps `servings`, `source_url`
  (`invalid_url`), `sections.{i}.name`, `sections.{i}.items.{j}.amount`,
  `sections` (`no_items`) and `sections.{i}.items.{j}.ingredient_id`
  (`unknown_ingredient`, shown as the save message `recipes.unknownIngredient`)
  back to the draft's keys.
  In `useRecipeDraft`: `addIngredient(sectionIndex, ingredient)`,
  `removeLine(sectionIndex, lineIndex)`, `moveLine(from, lineIndex, to)`,
  `addSection()`, `removeSection(index)` (interpretation 10), `servingsNumber`
  (computed: the typed servings when valid, else 1), `lineCount`. The
  derived-tags watcher keys on the sorted distinct ingredient ids over all
  lines and sends those.
- `test-data.ts`: `recipe()` defaults gain `servings: 1, instructions: '',
  source_url: '', sections: [{ name: '', items: [] }]`; a helper
  `lines(...[ingredient_id, amount][])` returning `[{ name: '', items: [...] }]`
  with `original_text: ''`, for the many tests that give a recipe lines.
- `IngredientPicker.vue`: remove the `exclude` prop and the all-in message.
- `IngredientPage.vue` `showRecipes`: a recipe matches when any section's
  items has the ingredient.
- `en.json`: `recipes.intro` "Dishes made of ingredients."; `recipes.items`
  becomes the plural `itemsFor` "Ingredients, for 1 portion | Ingredients, for
  {n} portions"; add `servings` "Serves", `servingsHint` "Amounts are for the
  whole recipe.", `servingsInvalid` "Enter a whole number from 1 to 1000.",
  `sectionName` "Section name", `sectionNameRequired` "Name every section.",
  `addSection` "+ Add section", `removeSection` "Remove section",
  `moveTo` "Move to {section}", `sectionN` "Section {n}", `lineMenu`
  "Line menu for {name}", `instructions` "Instructions", `source` "Source",
  `sourceInvalid` "Enter a link that starts with http:// or https://.",
  `openSource` "Open source", `unknownIngredient` "An ingredient of this recipe
  no longer exists. Remove it and save again."; remove `allIngredientsIn`.

**Tests (write first):**

- `totals.test.ts`: servings 2 halves; a rounding tie with servings (the same
  numbers as the server test); servings 1 unchanged.
- `useRecipeDraft.test.ts`: `emptyDraft` has one unnamed section; `draftOf`
  maps sections and lines (and keeps `original_text`); `checkRecipe` sends
  `sections`, `servings` as a number, `instructions`, `source_url`; refuses
  servings 0, 1.5, "abc", 1001; a bad URL; an unnamed section among several; no
  lines; the same ingredient on two lines is accepted; `serverErrors` maps each
  server error type to its field and key; move, add, remove section keep every
  line (count before and after); the derived-tags question is asked once for
  an ingredient on two lines.
- `IngredientPage.test.ts`: "Show" lists a recipe that has the ingredient in a
  second section.

**Verify:** `npm run lint`, `npm run typecheck` (the pages' tests and
`RecipePage.vue` stay red until Task 4, so run `npx vitest run
src/totals.test.ts src/composables src/pages/IngredientPage.test.ts`).

**Commit:** with Task 4 (the app does not build between them), or as "web:
recipe draft with sections, servings, instructions" if typecheck is green.

### Task 4: Web: `RecipeSection` and the recipe editor (C2)

**Files:** create `web/src/components/RecipeSection.vue` and
`RecipeSection.test.ts`; modify `web/src/pages/RecipePage.vue`,
`web/src/pages/RecipePage.test.ts`, `web/src/pages/RecipesPage.test.ts` and any
test that gives a recipe `items` (typecheck lists them).

**Build:**

- `RecipeSection.vue`: props `section`, `index`, `count` (sections in the
  recipe), `ingredients` (Map by id), `errors` (amounts by line key, the
  section's name error), `others` (`{index, label}` for the move menu). Shows
  the name field (`aria-label` "Section name", class `section-name`) when
  `count > 1` or the name is not empty; then its lines in `.recipe-item` rows
  as today (`.item-name`, amount input with `aria-label` "Amount of {name}" and
  the ingredient's unit as suffix, remove button, and a menu button
  `aria-label` "Line menu for {name}" listing "Move to {section}" for `others`),
  then **+ Add ingredient**, and **Remove section** when `count > 1`. Emits
  `add`, `removeLine(index)`, `move(index, to)`, `removeSection`. Edits the
  section's name and the lines' amounts in place, as the page edited
  `draft.items`.
- `RecipePage.vue`: **Serves** field (`aria-label` "Serves", numeric,
  hint `servingsHint`, error); the card titled `itemsFor` (plural by
  `servingsNumber`) holds one `RecipeSection` per section and **+ Add
  section**; the per-portion card uses `portionTotals(items, attributes,
  servingsNumber)` over all lines; **Instructions** (`type="textarea"`,
  `autogrow`) and **Source** (text input, error, and an **Open source** link
  `target="_blank" rel="noopener noreferrer"` when it passes the http(s) check)
  after the tags card; the picker remembers which section asked
  (`pickerSection`) and calls `addIngredient(pickerSection, ingredient)`; the
  picker is given every ingredient. `.recipe-item`, `.portion-total`,
  `.tag-choice` and the other classes the tests use stay.
- A recipe with one unnamed section looks as before: no heading, no menu
  other than the line menu (which has no entries then, so show it only when
  `others` is not empty), and the same labels, apart from the Serves field and
  the two new fields.

**Tests (write first):**

- `RecipeSection.test.ts`: no name field for one unnamed section; the name
  field and **Remove section** appear with two; the line menu lists the other
  sections and emits `move`; the amount input edits the draft line; a name
  error and an amount error show on their fields.
- `RecipePage.test.ts` (existing tests updated to `sections`; none dropped
  except the picker exclusion one, replaced): `a recipe opens with its sections,
  servings...` (two sections with headings and a line each, Serves 4, totals
  divided); `Serves N divides the per-portion totals as typed and the heading
  says for N portions`; `the same ingredient can be added on a second line and
  the picker still offers it`; `+ Add section shows name fields, saving without
  a name is refused on the field`; `a line moves to another section`; `removing
  a section moves its lines up`; `Save sends sections, servings, instructions
  and source`; `an invalid source and servings are marked and nothing is
  sent`; `the server's section, servings and URL errors show on their fields`;
  `Open source links only a valid link`; `a new recipe starts with one unnamed
  section, servings 1`.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test` (whole web suite),
and `python3 -m pytest -q` once more.

**Commit:** "web: C2 with Serves N, sections, instructions and source".

### Task 5: End-to-end step

**Files:** `web/e2e/catalog.e2e.ts`.

**Build:** in the existing flow, after the "ingredient is now in use" step (and
after U3's unit-change step, whose Oats amount reads `0.06 kg`; do not
hard-code grams, read the field's current value) and before the Tags step:

- Open Porridge, set **Serves** to 2, the per-portion total reads `Energy 117
  kcal` (233 halved, rounded half away: 116.5 to 117, check against the
  server's number when written); type text in **Instructions**, a link in
  **Source**; Save. The list row reads `Per portion: Energy 117 kcal`.
- Open it again: Serves 2, instructions and source persisted, **Open source**
  link present. Add a section: it shows name fields; name the first
  "Porridge" and the new one "Topping"; add Oats to **Topping** with amount
  `10` (the same ingredient on a second line); the heading reads "Ingredients,
  for 2 portions" and the total updates; Save and reopen: both sections and
  lines are there; the ingredient page of Oats says `Used in 1 recipe`.
- Restore the flow's later expectations: remove the Topping section (its line
  moves up, remove that line), set Serves back to 1, clear instructions and
  source if later steps need it (they do not read them), Save. The list row
  reads `Energy 233 kcal` again, so the plan steps are unchanged. Update the
  header comment of the file to mention servings and sections.

**Verify (the e2e recipe in the common context):** `cd web && npx vite build`;
uvicorn on an empty SQLite file in the scratchpad with `PASSWORD_HASH` and
`SESSION_KEY`; `E2E_PASSWORD=... E2E_BASE_URL=http://localhost:8000 npm run e2e
-- --trace off`; kill the server.

### Task 6: Docs

**Files:** `README.md`, the master plan, the import spec, the wireframes spec,
`docs/superpowers/specs/future-features.md`, this plan.

- `README.md`: in the status paragraph, add that recipes have Serves N,
  sections, instructions and a source link (several lines per ingredient), and
  that C4 counts the recipes that use an ingredient.
- Master plan: after "U3 done" (or the latest "done" line) add "R2 done: see
  `2026-11-08-slice-r2-servings-sections-instructions.md`."
- Import spec: in "Slices" and "Data model" keep the decisions; add the
  settled details of this plan's interpretations 1 to 4, 8 and 14 (limits,
  section-name rule, `sections[].items` API, recipe count) under a short "As
  built in R2" note, and say that the unit picker and `unit` belong to R3.
- Wireframes spec C2: **Serves [N]**, sections ("+ Add section", a line's menu
  to move it, "Remove section"), **Instructions**, **Source**; "Ingredients,
  for N portions"; C4: "Used in N recipes" counts recipes.
- `future-features.md`: the "recipes that serve several portions" item becomes
  **Built in R2**.
- This plan: Status "Built"; under each task add how it was checked and the
  differences from the text, as the earlier slice plans do.

**Verify:** the full checks (both suites, lint, typecheck) and the e2e run once
more.

## Done when

A recipe can be saved with Serves N, named sections, the same ingredient on
several lines, instructions and a source link; the per-portion totals in the
editor and the list, and the planner's amounts, are the lines summed and
divided by N; a recipe from before the migration reads back as one unnamed
section with servings 1 and gives the library the same `Recipe`; an
ingredient's "Used in N recipes" counts recipes, and a unit change (U3) still
converts every line of every recipe that uses the ingredient; both test suites,
lint, typecheck, the migration test and the end-to-end flow pass; and the docs
say so.
