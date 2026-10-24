# GUI Slice 4 — Tags Implementation Plan

**Goal:** Manage tags (C6): list them, edit Name and the derive rule in
place, add new ones and delete them after a warning, with the tag count
in the menu.

**Architecture:** As slice 3. One `tags` table (migration `0003`) and a
`Tag` model. `server/api/tags.py` holds the CRUD routes in the
`protected` router and reuses `name_in_use` for the 409.
`GET /api/counts` gains `tags`. In the app, `TagsPage.vue` replaces the
placeholder, built like `AttributesPage.vue`.

**Tech Stack:** as slice 1. No new dependencies.

**Specs:** C6 in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md)
(the "GUI spec"), "Storage" in
[`2026-10-22-gui-tech-stack-design.md`](../specs/2026-10-22-gui-tech-stack-design.md),
and slice 4 in [`2026-10-22-gui-slices.md`](2026-10-22-gui-slices.md).

**Status:** Built and committed task by task on branch
`claude/slice-4-tags`. Each task names its files and how it was checked;
the code is in the commits.

## Global Constraints

- `meal_planner/` is not changed (a test reads its `DERIVE_RULES`).
- Server tests use SQLite, or Postgres when `TEST_DATABASE_URL` is set.
- All GUI text goes through vue-i18n, English file only.
- `web/openapi.json` and `web/src/api/schema.ts` are regenerated.

## Interpretations made in this plan

1. **The derive rule is `"all"` or `"any"`**, stored as text. The API
   spells them out as a `Literal`, so the generated TypeScript type is
   `"all" | "any"`; a test checks they equal the library's
   `DERIVE_RULES`.
2. **A new tag starts with "all ingredients have it"**, the first option
   in the GUI spec's wording. The library has no default.
3. **Name rules are the attributes' rules:** 1 to 100 characters,
   trimmed, compared exactly. A tag and an attribute may share a name;
   the library keeps them apart.
4. **The list is in the order tags were added**, as for attributes.
5. **Each tag carries `ingredient_count`, `recipe_count` and
   `filter_count`**: what deleting it removes it from (ingredients,
   recipes' added tags, plan filters), for the warning. All are 0 until
   slices 5, 6 and 10 fill them in.
6. **"added by hand" is shown when `ingredient_count` is 0**, so every
   tag shows it until slice 5. It follows the rule in the row's caption:
   "When all ingredients have it · added by hand".
7. **The rule is two radio buttons** under "A recipe gets this tag
   when": "all ingredients have it" / "any ingredient has it". They fit a
   phone's width, where two long labels on a button toggle would not.
8. **Editing, saving and deleting work as on the Attributes page**
   (slice 3 interpretations 7 and 8): one row open at a time, Done
   saves, opening another row saves the open one first, Done without
   changes sends nothing, and delete asks in a dialog ("Delete vegan?"
   and what else it removes, or "Nothing else uses it.").

## Tasks

### Task 1: Server

**Files:** `server/models.py`, `server/migrations/versions/0003_tags.py`,
`server/api/{__init__,tags,counts}.py`, `web/openapi.json`,
`web/src/api/schema.ts`, `tests/server/test_tags.py`,
`tests/server/test_attributes.py`.

**Interfaces produced:**
- `server.models.Tag`, `DERIVE_LENGTH`
- `server.api.tags.DeriveRule`
- `GET/POST /api/tags`, `PUT/DELETE /api/tags/{id}`; `tags` in
  `GET /api/counts`

**Tests:** the derive rules are the library's; list, create, update,
delete; the derive rule round-trips for both values; trimming; invalid
fields (empty or long name, unknown rule) answer 422; a name in use
answers 409 with the field error on create and on rename, and changes
nothing; names differing in case are allowed; a tag may share an
attribute's name; a deleted name can be used again; unknown ids answer
404; counts.

**Checked:** 75 server tests pass on SQLite and on Postgres 16,
including the migration test.

### Task 2: Web

**Files:** `web/src/pages/TagsPage.vue`, `web/src/pages.ts`,
`web/src/i18n/en.json`, `web/src/pages/TagsPage.test.ts`,
`web/src/layouts/MainLayout.test.ts`.

**Tests:** rows show the rule, and "added by hand" only for tags no
ingredient has; a row opens in place with its rule, and Done sends the
changes; Done without changes sends nothing; a name in use shows on the
field and the row stays open; an empty name is not sent; opening
another row saves the open one first; a new tag starts with "all" and
is added at the end, or cancelled; delete warns with the counts before
deleting; a failed load offers to try again; the menu shows the tag
count.

**Checked:** lint, typecheck, Vitest (31 tests) and `vite build` pass.
The built app served by uvicorn and driven in Chromium at 390 px: added
three tags (one with "any"), a rename to a name in use showed the
message on the field, the fixed rename saved, a delete asked first
("Nothing else uses it."), the list survived a reload, the menu showed
2, and the page did not scroll sideways.

### Task 3: Docs

**Files:** `README.md` (status), this plan.

## Done when

Tags can be listed, added, edited (name and rule) and deleted on the
Tags page; the menu shows their count; CI is green.
