# GUI Slice 10 — Recipe Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** Recipe filters (A4) and the Plan page's Recipes card (A1): each
tag can be set to Any, Only or Never. Only and Never reach the library as
`require_tags` and `exclude_tags`, and a live count says how many recipes
can be used.

**Architecture:** A new table, `plan_tag_filters` (migration 0008), holds
one row per tag set to Only or Never. The filters join the plan setup in
`GET/PUT /api/plan`. `POST /api/plan/recipe-count` counts the recipes the
filters being edited leave. It uses the library's own tag derivation
(`Recipe.tags`), so the app never repeats it. `server/translate.py` passes
the filters to the `PlanRequest`. A solve whose filters leave no recipe
gets its own failure instead of the library's error. In the app, a new
page `RecipeFiltersPage.vue` (A4, `/plan/recipes`, like the Schedule page)
and a `RecipesCard.vue` on the Plan page.

**Tech Stack:** as slice 9, plus Quasar `QBtnToggle` for Any / Only / Never.

**Specs:** A1 and A4 in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md)
(the "GUI spec"); "The server translates", the endpoints and the
`plan_tag_filters` table in
[`2026-10-22-gui-tech-stack-design.md`](../specs/2026-10-22-gui-tech-stack-design.md)
(the "stack spec"); slice 10 in
[`2026-10-22-gui-slices.md`](2026-10-22-gui-slices.md).

## Global Constraints

- `meal_planner/` is not changed.
- The slice ships its own Alembic migration; the migration test (all
  migrations on an empty database compared with the models) stays green.
- Server tests use SQLite, or Postgres when `TEST_DATABASE_URL` is set.
- All GUI text goes through vue-i18n, English file only.
- `web/openapi.json` and `web/src/api/schema.ts` are regenerated
  (`npm run gen:api` in `web/`) whenever the API changes.
- The Playwright flow gets the slice's step.
- Checks before each commit: `python -m pytest` at the root; `npm run
  lint`, `npm run typecheck`, `npm test` in `web/`.

## Interpretations made in this plan

1. **Storage.** `plan_tag_filters`: `plan_id` (cascade with the plan),
   `tag_id` (cascade with the tag), both the primary key, and `mode`,
   `"only"` or `"never"` (`String(5)`). A tag set to Any has no row.
   Model `PlanTagFilter`, with `Plan.tag_filters` ordered by tag id and
   `PlanTagFilter.tag` loaded with the plan.
2. **API fields.** `PlanFields.tag_filters: list[TagFilter]`, where
   `TagFilter = {tag_id: int, mode: "only" | "never"}`. It is required,
   like `goals`, so a body that leaves it out is refused rather than
   wiping the filters. The answer lists the filters in tag id order.
   422s: `tag_filters.<i>.tag_id` with `unknown_tag` ("No such tag") or
   `duplicate` ("This tag is given twice"). `planFields` in
   `web/src/plan.ts` sends the filters back, so every other editor keeps
   them.
3. **Recipe count.** `POST /api/plan/recipe-count` takes `{tag_filters}`
   (same type and same 422s) and answers `{usable: int, total: int}`:
   how many recipes are left after the filters, out of all recipes.
   `translate.usable_recipes(recipes, tags, only, never)` decides which
   recipes are left. It derives each recipe's tags with the library's
   `Recipe.tags` and keeps a recipe with every Only tag and no Never tag.
   That is the library's `PlanRequest.eligible_recipes` rule (#37 in the
   core spec), which cannot be called without a whole valid request. A
   test checks the two agree on recipes with derived and extra tags.
4. **Translation.** `translate.plan_request` sets
   `require_tags` / `exclude_tags` to the names of the tags set to Only
   / Never.
5. **No recipe left.** With recipes but none left after the filters, the
   library refuses the request. The solve checks first, with
   `usable_recipes`, and answers the new failure `no_usable_recipes`:
   "No recipe passes the recipe filters. Change them under Recipes."
   The app's failure messages gain it.
6. **Tag delete.** `filter_count` in the tags API counts the plan filters
   on each tag, replacing the placeholder 0. The warning text already
   names plan filters (slice 4).
7. **A4 page** (`/plan/recipes`, route name `recipe-filters`): header
   "Recipe filters" with Back to the Plan page, like the Schedule page.
   A count line, "142 of 200 recipes can be used", with a "Show recipes"
   link to the Recipes page. Then one row per tag in tag id order, the
   tag's name and a `QBtnToggle` Any / Only / Never. Each change asks
   the server for the count again; an answer that arrives after a newer
   question is dropped. While the count loads the previous one stays;
   when it fails, "Could not count the recipes." shows. With 0 usable
   recipes the line is red, and Save still works: the solve will say
   why. Save sends the setup with the new filters and returns to the
   Plan page; a refused save shows "Could not save. Try again." With no
   tags: "No tags yet. Add them on the Tags page." and no Save.
8. **A1 Recipes card** (`RecipesCard.vue`), between the Goals card and
   Max solving time: title "Recipes" and Edit, linking to A4, like the
   Schedule card. Under it, the count line from `recipe-count` with the
   plan's filters (asked again when they change), then a chip per filter
   in tag order, "Only: vegetarian" / "Never: contains-nuts". The Plan
   page loads the tags for the chip names.
9. **The "link to the list"** (GUI spec A4) opens the Recipes page (C1)
   as it is. Showing only the usable recipes there is left out.
10. **Plural:** "{usable} of {total} recipe(s) can be used" chooses by
    `total`.

## Tasks

### Task 1: Filters stored and in the plan API

**Files:** `server/models.py` (`PlanTagFilter`, `Plan.tag_filters`),
`server/migrations/versions/0008_plan_tag_filters.py`,
`server/api/plan.py` (`TagFilter`, `PlanFields.tag_filters`, loading,
errors, fill, answer), `server/api/tags.py` (`filter_count`),
`web/openapi.json`, `web/src/api/schema.ts`, `web/src/plan.ts`
(`planFields` sends `tag_filters`), `web/src/test-data.ts` and other
tests that build a `Plan` or `PlanFields` (add `tag_filters: []`),
`tests/server/{test_plan,test_delete_cascades,test_tags}.py`.

**Interfaces produced:**
- `models.PlanTagFilter(plan_id, tag_id, mode)`; `models.Plan.tag_filters`;
  `models.PlanTagFilter.tag`; `models.FILTER_MODE_LENGTH = 5`.
- `server/api/plan.py`: `FilterMode = Literal["only", "never"]`,
  `class TagFilter(BaseModel): tag_id: int; mode: FilterMode`;
  `PlanFields.tag_filters: list[TagFilter]`;
  `filter_errors(filters: Sequence[TagFilter], tags: dict[int, models.Tag]) -> list[FieldError]`
  (locations under `tag_filters`), for Task 2 to reuse.

**Tests:** filters round trip, answered in tag id order; a filter left
out goes, one changed from Only to Never changes; 422 for an unknown tag
and a tag given twice; a body without `tag_filters` is a 422. Deleting a
tag removes its filter; the tags list counts filters (`filter_count`).
Vitest: `planFields` sends `tag_filters` back.

### Task 2: Recipe count, translation and the solve

**Files:** `server/translate.py` (`usable_recipes`, `plan_request`),
`server/api/plan.py` (`POST /recipe-count`), `server/api/solve.py`
(`no_usable_recipes`), `web/openapi.json`, `web/src/api/schema.ts`,
`web/src/i18n/en.json` (the failure's message),
`tests/server/{test_translate,test_plan,test_solve}.py`.

**Interfaces consumed:** Task 1's model and `filter_errors`.

**Interfaces produced:**
- `translate.usable_recipes(recipes: Sequence[models.Recipe], tags:
  Sequence[models.Tag], only: Collection[str], never: Collection[str]) ->
  list[models.Recipe]` (decision 3, tag names).
- `POST /api/plan/recipe-count`: body `RecipeCountFields{tag_filters:
  list[TagFilter]}`, answer `RecipeCount{usable: int, total: int}`.
- `Failure` gains `"no_usable_recipes"`.

**Tests:** translation: Only / Never become `require_tags` /
`exclude_tags` by name; `usable_recipes` with a derived tag (`all` and
`any` rules), an extra tag, Only and Never together, and agreeing with
`PlanRequest.eligible_recipes`. API: count with no filters (all), with
Only, with Never, unknown tag 422, no recipes (0 of 0). Solve: a plan
with a Never filter uses only the other recipe; filters that leave none
answer `no_usable_recipes` and store nothing.

### Task 3: The Recipe filters page (A4)

**Files:** `web/src/pages/RecipeFiltersPage.vue` and its test,
`web/src/router.ts`, `web/src/recipeCount.ts` and its test (the count
asked for filters, dropping stale answers), `web/src/i18n/en.json`.

**Interfaces consumed:** Tasks 1 and 2's API.

**Interfaces produced:** route `/plan/recipes` named `recipe-filters`;
`useRecipeCount()` in `web/src/recipeCount.ts`: `{ count: Ref<RecipeCount
| null>, failed: Ref<boolean>, ask(filters: TagFilter[]): Promise<void> }`,
where an answer to an earlier `ask` after a later one is dropped. Types
`TagFilter`, `RecipeCount` in `web/src/api/types.ts`.

**Tests:** recipeCount: answers in order, a stale answer dropped, a
failure sets `failed`. Page: one row per tag with the stored mode
selected (Any for a tag without a filter); choosing Only asks for the
count and shows it; Save sends the other parts as loaded plus the new
filters (Any sent as no filter) and goes to the Plan page; a refused
save shows the error; 0 usable shows red; no tags shows the hint.

### Task 4: The Recipes card on the Plan page (A1)

**Files:** `web/src/components/RecipesCard.vue` and its test,
`web/src/pages/PlanPage.vue` (loads tags, shows the card) and its test,
`web/src/i18n/en.json`.

**Interfaces consumed:** `useRecipeCount` (Task 3), `Plan.tag_filters`.

**Tests:** the card shows the count from the server and a chip per
filter in tag order with Only / Never; Edit links to `/plan/recipes`;
no chips without filters; a failed count shows its message. The Plan
page shows the card.

### Task 5: End-to-end test and docs

**Files:** `web/e2e/catalog.e2e.ts`, `README.md` (what the app does now),
this plan (status and how each task was checked), the slices plan.

**Test:** before Make plan: on the Plan page the Recipes card says "1 of
1 recipe can be used"; Edit opens Recipe filters; set vegan to Never,
the count shows "0 of 1 recipe can be used"; set it to Only, "1 of 1";
Save; the card shows the chip "Only: vegan". The plan is then made as
before.

## Done when

Tags can be set to Only or Never on the Recipe filters page; the Recipes
card shows the count and the filters; plans use only the recipes the
filters leave, and say so when they leave none; deleting a tag removes
its filter and the warning counts it; CI is green.
