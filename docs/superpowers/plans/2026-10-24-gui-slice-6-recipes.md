# GUI Slice 6 — Recipes Implementation Plan

**Goal:** Manage recipes: a list with search and quick tag chips (C1)
and an editor (C2) with ingredient rows from a searchable picker, live
per-portion totals, derived and added tags, and the portion size.
Ingredients in use can't be deleted, and the ingredient editor's "Used
in N recipes · Show" becomes real.

**Architecture:** Three tables (migration `0005`): `recipes`,
`recipe_items` (one row per ingredient, with its position and amount)
and `recipe_extra_tags`. `server/api/recipes.py` holds the CRUD routes,
`GET` by id for the editor and `POST /api/recipes/derived-tags`.
`server/translate.py` gains `tag` and `recipe`. In the app,
`RecipesPage.vue` replaces the placeholder and `RecipePage.vue` is the
editor, on its own routes (`/recipes/new`, `/recipes/:id`), with
`IngredientPicker.vue` for "+ Add ingredient". `web/src/totals.ts` sums
the per-portion totals.

**Tech Stack:** as slice 5.

**Specs:** C1, C2 and C4 in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md)
(the "GUI spec"), "Storage", "The server translates", "Live values in
the frontend" and "Testing" in
[`2026-10-22-gui-tech-stack-design.md`](../specs/2026-10-22-gui-tech-stack-design.md),
and slice 6 in [`2026-10-22-gui-slices.md`](2026-10-22-gui-slices.md).

**Status:** Built and committed task by task on branch
`claude/slice-6-recipes`. Each task names its files and how it was
checked; the code is in the commits.

## Global Constraints

- `meal_planner/` is not changed.
- Server tests use SQLite, or Postgres when `TEST_DATABASE_URL` is set.
- All GUI text goes through vue-i18n, English file only.
- `web/openapi.json` and `web/src/api/schema.ts` are regenerated.

## Interpretations made in this plan

1. **Amounts and the portion-size numbers are stored as typed**, in
   `NUMERIC(15, 6)` like ingredient values. An amount is above 0, as in
   the library. The multipliers (From, To, Step, the hard upper limit)
   are above 0 with at most 3 decimals, since the library holds them in
   whole thousandths, and 9 digits before the point.
2. **A new recipe starts with the library's defaults:** From 0.5 ×,
   To 2 ×, any amount, no hard upper limit typed and an over-size
   penalty of 1. In steps starts with a step of 0.5.
3. **An empty hard upper limit is stored as `NULL`** and means the
   library's default, 3 × To, so it follows To. The field's hint shows
   what that is now ("Empty: 3 × To, which is 6 ×").
4. **The over-size penalty is the library's weight as a plain number**,
   0 or more (0: no penalty). The GUI spec's 1–5 importance scale is for
   goals, and the C2 wireframe does not say otherwise.
5. **The library's rules across fields are checked by the API**, with
   an error on one field each: To below From (`below_min` on To), the
   hard upper limit below To (`below_max`), From not a whole number of
   steps (`not_in_steps` on From). The app checks the same before
   sending.
6. **A recipe needs at least one ingredient**, each at most once (a
   second row for one ingredient answers 422 on its field), as the
   library refuses a recipe without items. Items keep the order they
   were added in.
7. **Derived tags come from the library's rule** (`TagDef.holds_for`,
   which `Recipe.tags` uses), never from the frontend. Since the editor
   shows them while ingredients are added, before saving,
   `POST /api/recipes/derived-tags` answers them for a list of
   ingredient ids. This endpoint is not in the slice plan; it is the
   same kind of live helper as slice 10's recipe count.
8. **A tag can be both derived and added by hand.** The API answers it
   in both lists. "+ Add tag" offers only the tags the recipe doesn't
   have yet.
9. **Totals per portion cover every attribute**, rounded half away from
   zero to the attribute's decimals (as the library rounds), and are
   answered as strings without trailing zeros ("10.1", "233"). The
   editor sums them itself, exactly (whole-number fractions, no floating
   point), with the same rounding, so the list and the editor always
   agree. An amount that is not a number yet counts as 0.
10. **The list is sorted by name**, and search matches part of the name,
    ignoring case, as for ingredients. A row shows "Per portion: Energy
    233 kcal · Protein 10.1 g" and the recipe's tags. The quick tag
    chips are the tags some recipe has; tapping chips keeps the recipes
    that have every chosen tag.
11. **Deleting an ingredient a recipe uses is refused by the foreign
    key** (`RESTRICT`), and the API answers 409. **Show** lists the
    recipes in place, loaded when tapped, each opening its editor.
12. **The tag delete warning counts the recipes the tag was added to by
    hand**; derived tags are not stored, so there is nothing to remove.
    Deleting an attribute removes it from the recipes' totals, with
    nothing else to warn about.
13. **The editor works like the ingredient editor:** Save checks the
    fields, saves and returns to the list; back leaves without saving;
    Delete asks first ("Delete Porridge? Nothing else uses it.").
    Advanced opens by itself when it holds something other than the
    defaults, or a mistake.

## Tasks

### Task 1: Server

**Files:** `server/models.py`, `server/migrations/versions/0005_recipes.py`,
`server/api/{__init__,recipes,ingredients,tags,counts,fields}.py`,
`server/translate.py`, `web/openapi.json`, `web/src/api/schema.ts`,
`tests/server/{conftest,test_recipes,test_translate,test_delete_cascades,test_ingredients}.py`.

**Interfaces produced:**
- `server.models.Recipe`, `RecipeItem`, `recipe_extra_tags`
- `GET/POST /api/recipes`, `GET/PUT/DELETE /api/recipes/{id}`,
  `POST /api/recipes/derived-tags`; `recipes` in `GET /api/counts`;
  real `recipe_count` on ingredients and tags; `DELETE
  /api/ingredients/{id}` answers 409 while in use
- `server.api.fields.Multiplier`, `plain`
- `server.translate.tag`, `server.translate.recipe`

**Tests:** list, read, create, update (every field, and removing items
and tags), delete; item order; amounts read back as typed; totals and
their rounding; an attribute without values totals 0; portion-size
round trip; invalid fields answer 422 (name, no items, amounts,
multipliers that are 0, negative, too fine or too long, a penalty below
0); the cross-field rules answer 422 on their field, and values at the
limits pass; unknown ingredients and tags and an ingredient twice answer
422 on their field; a name in use answers 409 on create and rename;
unknown ids answer 404; counts. Ingredients count their recipes and
can't be deleted while used. Derived tags for `all` and `any` rules,
following the ingredients' tags when they change, both derived and
added, and asked for before saving. Cascades: tags count and lose their
recipes; attributes leave the totals. Translation: tag rule, items in
order with amounts, extra tags, portion-size fields, no step and the
default hard limit, derived tags.

**Checked:** 196 server tests pass on SQLite and on Postgres 16,
including the migration test.

### Task 2: Web

**Files:** `web/src/pages/{RecipesPage,RecipePage}.vue` and their
tests, `web/src/components/IngredientPicker.vue`, `web/src/totals.ts`
and its test, `web/src/pages/IngredientPage.vue` and its test,
`web/src/{pages,router,test-data}.ts`, `web/src/api/types.ts`,
`web/src/i18n/en.json`, `web/src/layouts/MainLayout.test.ts`.

**Tests:** per-portion totals (sums, missing values, exact before
rounding, rounding half away from zero, small totals). The list is
sorted by name with totals and tags; search; tag chips keep recipes
with every chosen tag; empty list; rows and the + button open the
editor; failed load. The editor opens with items, totals, tags and
portion size; totals follow typed amounts; ingredients are added from
the picker (which leaves out those in the recipe) and removed, and the
derived tags are asked for; tags are added and removed; Save sends the
fields and returns to the list; a new recipe starts with the defaults;
wrong fields and broken cross-field rules are marked and nothing is
sent; server field errors show on their fields; other failures say so;
delete asks first; an unknown recipe fails to load; back leaves without
saving. The ingredient editor's Show lists the recipes using it. The
menu shows the recipe count.

**Checked:** lint, typecheck, Vitest (85 tests) and `vite build` pass.
Screenshots of the list, the editor (with Advanced open, the picker and
field errors) and the ingredient editor's Show at 390 px looked right.

### Task 3: End-to-end tests

**Files:** `web/e2e/catalog.e2e.ts`.

**Test:** the slice 5 flow adds a recipe of the ingredient: the editor
shows the total per portion and the derived tag while typing, the list
shows both after saving, and the ingredient editor says it is used in 1
recipe, disables Delete and shows the recipe.

**Checked:** passes against uvicorn on Postgres 16 with the built app.

### Task 4: Docs

**Files:** `README.md` (status), this plan.

## Done when

Recipes can be listed, searched, filtered by tag, added, edited and
deleted, with live totals per portion and derived tags; ingredients in
use can't be deleted and show their recipes; tag deletes warn about and
remove their recipe tags; the menu shows the recipe count; CI is green.
