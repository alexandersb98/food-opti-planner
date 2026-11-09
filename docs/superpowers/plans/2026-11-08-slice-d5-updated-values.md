# Slice D5 — Updated Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** An ingredient added from a data source notices when the source's
numbers have moved on. On C4 a banner **Updated values available** lists each
attribute whose source value differs from what the ingredient last copied or
answered ("Protein 13.5 g → 13.8 g"), with **Accept** (copy the new values)
and **Keep mine** (keep the values, record the new ones as answered, so the
banner returns only on the next change). This also covers a column mapped after
the ingredient was added (the ingredient has never had that value) and ignores a
value whose column is no longer mapped or has been withdrawn. On C3 an
ingredient with updates is marked, and a filter lists only those.

**Architecture:** No schema change (no migration; the migration test is
untouched). The comparison is computed, never stored: D4's pure module
`server/source_values.py` (which already turns a source food into "the values
the ingredient would get") gains `copied_values_many` (the same arithmetic for
many foods in a constant number of queries, with `copied_values` calling it, so
there is still one conversion rule), `updates_for(db, ingredients)` (the
comparison) and `apply_answer` (Accept / Keep mine). `server/api/ingredients.py`
adds `updated_values` to every ingredient answer and one route, `POST
/api/ingredients/{id}/source-values`. The app gets `UpdatedValuesBanner.vue` on
`IngredientPage.vue` and a marker plus a filter on `IngredientsPage.vue`.

**Tech Stack:** FastAPI, SQLAlchemy 2, `Fraction`/`Decimal`; Vue 3, Quasar,
vue-i18n, Vitest, Playwright.

**Specs:** the data source spec
[`2026-11-03-ingredient-data-sources-design.md`](../specs/2026-11-03-ingredient-data-sources-design.md)
(decision 4; "The linked ingredient on C4", the **Updated values available**
bullet and the C3 bullet; "S2" last paragraph; "API"; "Testing"); slice D5 of
[`2026-11-08-units-sources-import-slices.md`](2026-11-08-units-sources-import-slices.md);
screens C3, C4 in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md).
Interfaces of earlier slices:
[`2026-11-08-slice-d2-reference-copy.md`](2026-11-08-slice-d2-reference-copy.md),
[`2026-11-08-slice-d3-column-mapping.md`](2026-11-08-slice-d3-column-mapping.md),
[`2026-11-08-slice-d4-add-from-data-source.md`](2026-11-08-slice-d4-add-from-data-source.md).

**Status:** Built and reviewed task by task on branch
claude/implement-remaining-slices-qwrp83.

## Global Constraints

- `meal_planner/` is not changed. **No Alembic migration** (interpretation 1).
- API tests run on SQLite and, in CI, on Postgres: no SQLite-only SQL.
- All GUI text goes through vue-i18n, English file only (`web/src/i18n/en.json`).
- After each task that changes the API (Task 2): `npm run gen:api` in `web/`
  (regenerates `web/openapi.json`, `web/src/api/schema.ts`; `web/src/test-units.json`
  should come out unchanged), then fix the factories in `web/src/test-data.ts` so
  `npm run typecheck` stays green.
- The Playwright flow gets a step (Task 5).
- No test calls the internet. The real data file is not in the repository: tests
  and e2e use D2's fixture source (`testsource`, "TEST Source": columns `PROT`
  "TEST Protein" g, `ENERC:kcal` "TEST Energy" kcal, `VITD` "TEST Vitamin D" µg;
  foods `1` "TEST Oats", `2` "TEST Milk", `10` "TEST Cheese"; Milk has no `VITD`).
- **D2, D3 and D4 are planned, and D2 is being built, when this plan was written.**
  This plan names their code by the planned names: `server/source_values.py`
  (`food_basis`, `CopiedValue(attribute, column, value)`, `Copied(values, skipped)`,
  `copied_values(db, food)`), `unit_change.convert_number(value, ratio)`,
  `units.ratio`, `models.SourceColumn.attribute_id`, `models.SourceFood`,
  `models.SourceFoodValue`, `models.Ingredient.source_food_id` / `.source_food`,
  `models.IngredientValue.source_value`, the `source` object on ingredient
  answers, the `data_client` fixture, `tests/server/data_source_files.py`,
  `server/source_loader.py`, `SourceChip.vue`, `web/src/colours.ts`,
  `AddFromSourceDialog.vue`. **Before each task, re-read the built code that task
  touches** (function and field names, i18n keys, test helpers, the e2e flow's
  last steps and the state they leave) and adapt; where this plan and the built
  code disagree on a name, the code wins; on a behaviour the plan wins.
- Checks before each commit: `python3 -m pytest -q` at the root; `npm run lint`,
  `npm run typecheck`, `npm test` in `web/`.

## Interpretations made in this plan

1. **Nothing is stored for the comparison, so no migration.** Spec decision 4
   and D4's `ingredient_values.source_value` (the source's value, converted to
   the attribute's unit, per 100 g, when last copied or answered) are all the
   state there is. An update is found by recomputing D4's `copied_values` for
   the ingredient's food *now* (current mapping, current source values, current
   preferred-unit-free arithmetic) and comparing with the stored
   `source_value`. This makes "a later mapping shows as an update" and "a value
   with no mapped column any more is left alone" fall out of one rule rather than
   being special cases: a mapped, non-withdrawn column with a value for the food
   is compared; anything else is not looked at.
2. **When a value counts as updated.** For each `CopiedValue c` of the food (D4
   leaves out a value too large to store, reported in `skipped`; such a value is
   left alone here too) let `s` be the ingredient's stored `source_value` for
   that attribute (none if the ingredient has no value row, or the row has no
   `source_value`). It is an update when **all** hold: `s` is none or `s !=
   c.value` (Decimal comparison); the proposed ingredient value (interpretation 3)
   can be stored (below 10^9 after conversion); and the proposed value differs
   from the ingredient's current value, where no value row counts as 0. The last
   test is an addition to the spec's wording: a user who typed the new number
   themselves, or a source value of 0 for a value the ingredient never had, would
   otherwise be offered "13.8 → 13.8" or "none → 0". The stored `source_value` is
   not touched in that case (nothing is written by a read); a later real change is
   still compared with it correctly.
3. **Values are per 100 g, the ingredient has its own basis.** D4 sets the basis
   to 100 g in the preferred unit, but C4 lets the user edit the basis (and a unit
   change to kg converts it). `source_value` stays "per 100 g of food". The
   proposed ingredient value is `c.value` scaled by the ingredient's basis in 100
   g: `scale = units.ratio(unit, "g") * basis / 100` (a `Fraction`; a linked
   ingredient is measured in a mass unit, D4's rule), done with
   `unit_change.convert_number(c.value, scale)` (rounded half up to 6 decimals, the
   one rounding rule). If `scale` cannot be made (the unit is not a mass unit; a
   legacy row) the ingredient has no updates. Both the banner and **Accept** use
   the scaled number, so "from" and "to" are in the same basis; `source_value` stores
   the unscaled `c.value`.
4. **What an update row carries.** `updated_values` on an ingredient answer is a
   list ordered by attribute id of `{attribute_id, value, new_value}`: `value` the
   ingredient's current value (string, or `null` for no value row), `new_value`
   the proposed one (string). The unit and name come from the attributes the app
   already loads. The spec says "the attributes with a new source value"; this
   shape is that, plus the two numbers the banner shows. `source_value` itself is
   still not exposed. The list is `[]` for an ingredient with no link.
5. **The answer route.** `POST /api/ingredients/{id}/source-values` with `{answer:
   "accept" | "keep"}` (`extra="forbid"`; anything else is the standard 422) answers
   200 with the ordinary `Ingredient` (its `updated_values` now empty unless a
   value was left alone). The server recomputes the updates at that moment; the
   client sends no numbers (a source loaded since the banner was drawn is honoured:
   the user answers what the server now sees). **accept**: for each update, the
   ingredient's value row (made if there is none) gets `value = new_value` and
   `source_value = c.value`. **keep**: `source_value = c.value` on the row; where
   the ingredient has **no value row, a row with value 0 is made** to hold the
   answer. An empty value already counts as 0 everywhere (library and plans), so
   the ingredient behaves the same; the only visible change is that the list and C4
   now show "0" for that attribute. This is the one place a new row can only come
   from an answer, and the alternative (a table of answers apart from the values)
   would be a migration for no behavioural gain. Values the ingredient has and no
   update names are untouched, as are `source_value`s of columns no longer mapped.
   No update (a stale tab, a second click) is a no-op 200. An ingredient with no link:
   422 `not_linked` on `["path","ingredient_id"]` (`FieldErrors` shape, as the other
   refusals), unknown id: 404 `No such ingredient`. A withdrawn food is not special:
   its values are still in the copy (D2 keeps them), so a later mapping still offers
   them.
6. **Editing and the banner meet only where they must.** A `PUT` of the ingredient
   keeps `source_value` of the values it sends (D4, interpretation 9) and the
   comparison simply runs again on the next read. A user who empties a value
   deletes its row and its `source_value`, so the banner offers that attribute
   again ("none → 13.8 g"); this is D4's stated reading ("no value yet") and the
   answer **Keep mine** then stores a 0. On C4 the page must keep the form and the
   stored rows in step: after an answer the page's draft gets the accepted values
   and, for **Keep mine**, the `0` of any row the server made (otherwise the next
   save of the form would send no value for it and delete the row again, and the
   banner would return). Other unsaved edits stay (as D4's Unlink does not refill
   the form).
7. **The list computes it in bulk.** `GET /api/ingredients` carries `updated_values`
   for every ingredient (C3 needs only "any", but one shape is simpler than two).
   `updates_for` loads the foods' mapped columns, source values and the
   ingredients' value rows in a constant number of queries (no query per ingredient;
   a test counts them), and only for ingredients with a link.
8. **C3's marker and filter.** Each row of a linked ingredient with updates shows a
   small badge, **Updated values available** (class `updated-marker`), in the
   caption area. Above the list a toggle **Only with updated values** (class
   `updated-filter`) appears only while at least one ingredient has updates and
   narrows the list (the name search still applies); with it on and no match the list
   says "No ingredients have updated values." The filter is a per-visit convenience,
   not remembered.
9. **No new unit handling.** An attribute unit change converts `source_value` (D4),
   so the comparison stays right across it; nothing in this slice reads units except
   the scale of interpretation 3.
10. **Built differently from the text** (found against the built code and D4's review notes):
    - Numbers a last decimal apart count as the same (`SAME_WITHIN` = 0.000001), both for the
      stored `source_value` against the source's number and for the proposed value against the
      ingredient's own. An attribute unit change converts the stored `source_value` and value
      step by step, rounding at each, so they can end one decimal from the same number converted
      once from the source; without the tolerance that shows as a false update. A larger drift
      (a conversion that lost digits, then a larger factor) still shows once, and either answer
      repairs the stored number.
    - The ingredient's basis stays editable on a linked ingredient: the scale is the saved basis
      (interpretation 3), and `source_value` stays per 100 g, so editing the basis never makes an update.
    - `apply_answer(ingredient, updates, answer)` has no `db` parameter (it needs none).
    - The refusal `not_linked` uses `invalid_fields` with the loc `["path", "ingredient_id"]`.
    - The Playwright test timeout is raised to 90 s: the one flow passed 30 s with this step.
11. **Not in this slice:** a notification outside the two screens, an "Accept all"
    across ingredients, a diff of added/removed foods, tag groups (D6).

## Tasks

### Task 1: Server: finding and answering updates

**Files:** modify `server/source_values.py`, `tests/server/test_source_values.py`.
Create `tests/server/test_source_updates.py` if the first file would pass roughly 400
lines.

Re-read D4's `server/source_values.py` and its tests first.

- `copied_values_many(db, foods: Sequence[models.SourceFood]) -> dict[int, Copied]`
  (keys: food ids): everything `copied_values` does (non-withdrawn, mapped columns;
  `units.ratio`; `convert_number`; `skipped` for a value too large; ordered by
  attribute id), for all `foods` in a constant number of queries (the foods' sources'
  mapped columns with their attributes, then the `source_food_values` of those foods
  and columns). `copied_values(db, food)` becomes `copied_values_many(db, [food])[food.id]`:
  one implementation. Its existing tests pass unchanged.
- `Update` dataclass: `attribute_id`, `current: Decimal | None`, `proposed: Decimal`,
  `answered: Decimal` (the unscaled `c.value`, what `source_value` becomes).
- `updates_for(db, ingredients) -> dict[int, list[Update]]` (interpretations 1-3, keyed by
  ingredient id; ingredients without a link or without updates are absent): one
  `copied_values_many` call for the distinct foods; the scale per ingredient; the
  ingredient's value rows through its `values` relationship (the caller loads them; see
  Task 2). No FastAPI, no commit.
- `apply_answer(db, ingredient, updates: list[Update], answer: Literal["accept", "keep"])`
  (interpretation 5): changes the session's rows, never commits.

**Tests (first):** a `db` fixture as `test_source_values.py`'s, the fixture source loaded,
attributes made through `models`, `PROT`→Protein g and `ENERC:kcal`→Energy kcal mapped,
an ingredient linked to TEST Oats with values and `source_value` as D4's add makes them
(a small helper builds it by hand), then change the source's value through `SourceFoodValue`:
- unchanged source: no updates; Protein 13.5 → 13.8: one update `{current 13.5, proposed 13.8,
  answered 13.8}`; a user-edited ingredient value (14) with an unchanged source value: no update
  (the comparison is with `source_value`, not the ingredient's value); source changed *and* the
  user typed the new number already: no update (interpretation 2); a source value changed to 0
  from a stored 13.5: update to 0; a 0 for an attribute with no row: no update;
- a column mapped after the ingredient was made (no row, or a row without `source_value`):
  update `{current None, proposed 13.5}`; with a typed value 5 and no `source_value`: `{current 5}`;
- a column unmapped (or the attribute's mapping cleared by deleting the attribute): no update, the
  stored `source_value` untouched; a withdrawn column: no update; a food that lost one value: no
  update for it (a missing value is not a change; the ingredient keeps its number); a withdrawn
  food: still compared;
- scale: an ingredient with basis 50 g and its value 6.75 (half of 13.5) and a source going to
  13.8 gives proposed 6.9 and answered 13.8; unit `kg` with basis 0.1 (the same 100 g) gives
  proposed 13.8; a basis so large the product reaches 10^9 is left alone (no update, no error); a non-mass
  unit gives no updates;
- `apply_answer` accept: values and `source_value`s set, a missing row made, rows of other
  attributes untouched, a second `updates_for` is empty; keep: values untouched, `source_value` set, a
  missing row made with value 0, a second `updates_for` is empty; then a new source change brings the
  update back (the banner "returns only on the next change");
- `copied_values_many` equals `copied_values` per food for a source with several foods, and the number of SQL
  statements (SQLAlchemy `before_cursor_execute` event on the engine, as an existing test does if there is one;
  otherwise count with a small listener in the test) is the same for 1 food as for 3.

**Verify:** the touched tests, then the root suite. Commit: "server: find and answer updated source values".

**Built.** Tests in the new `tests/server/test_source_updates.py` (36 tests with `test_source_values.py`, all passing; the statement count of `copied_values_many` is the same for 1 and 3 foods). Differences: interpretation 10.

### Task 2: Server: `updated_values` on ingredients and the answer route

**Files:** modify `server/api/ingredients.py`, `tests/server/test_ingredients.py` (or a new
`tests/server/test_source_updates_api.py` beside D4's from-source tests, following where D4 put its
`linked` helper), `web/src/test-data.ts`, `web/openapi.json`, `web/src/api/schema.ts`.

- `UpdatedValue(attribute_id, value: Number | None, new_value: Number)`; `Ingredient.updated_values:
  list[UpdatedValue]`. `_response` takes the updates (a dict from `updates_for`, default empty); the
  list and the single read load the ingredient's `values` and `source_food` with `selectinload`
  and call `updates_for` once; `create`, `from-source`, `unlink`, `put` answers go through the same
  path (a created or unlinked ingredient answers `[]`).
- `SourceValuesAnswer(answer: Literal["accept", "keep"])`, `extra="forbid"`; route
  `POST "/{ingredient_id}/source-values"`, `responses` 404 and the 422 (`not_linked`, interpretation 5),
  placed with the other `/{ingredient_id}` routes. Steps: the ingredient (404); no `source_food_id`: 422
  `not_linked`; `updates_for` for it; `apply_answer`; `db.commit()`; answer through `_response` with the
  updates recomputed (so a value left alone, if any, still shows).

**Tests (first), through the API with D4's `linked` helper (attributes mapped, TEST Oats added):**
- a fresh add has `updated_values == []`; after the source's Protein value changes through the engine
  (`SourceFoodValue`) `GET /api/ingredients/{id}` and the list both show `[{"attribute_id": protein,
  "value": "13.5", "new_value": "13.8"}]`; an ordinary ingredient has `[]`;
- a new fixture **version** (the real path): write a changed copy of the fixture file with a new
  version through `tests/server/data_source_files.py`, run D2's loader on the app's engine (as D2's
  loader tests do, using the built function names), and the banner data appears; the same file again changes nothing;
- **accept**: 200, the ingredient's value is 13.8, `updated_values` empty, `source_value` 13.8 (read through the
  engine), other values and tags unchanged; an attribute whose column is no longer mapped is untouched;
- **keep**: 200, the value stays 13.5, `updated_values` empty, `source_value` 13.8, and after a further change
  the update returns; a keep for an attribute the ingredient has no row for makes a row of `"0"`; the next `PUT`
  that sends the form's values including that `0` keeps the banner away (and a `PUT` without it brings it back,
  documenting interpretation 6);
- **a later mapping**: an ingredient added while TEST Protein was unmapped shows `{"value": null, "new_value":
  "13.5"}` once the column is mapped (D3's route); accept creates the row. Mapping TEST Vitamin D instead (Oats has `0`)
  shows nothing (interpretation 2);
- **unmapped later**: unmap Protein: the update disappears and the stored `source_value` is unchanged;
  re-map it: the comparison resumes from the old `source_value`;
- **scale**: an ingredient edited to basis 50 and Protein 6.75 and a changed source value: `new_value` is the
  scaled one and accept stores it, `source_value` the unscaled;
- refusals: 401 (anonymous client); 404 unknown id; 422 `not_linked` for an ordinary ingredient and for an unlinked
  one (D4's unlink); an `answer` of `"maybe"` and a missing body are 422; the extra field is 422; no updates is a
  no-op 200; a **second accept** is the same no-op;
- the list's statement count does not grow with the number of linked ingredients (3 vs 1 with updates each).

**Then:** `cd web && npm run gen:api`; add `updated_values: []` to the `ingredient` factory in `test-data.ts`;
`UpdatedValue` is available as `Schemas['UpdatedValue']` (export it in `web/src/api/types.ts` if D4's pattern
exports its parts).

**Verify:** the touched tests, the root suite, typecheck. Commit: "server: updated source values on ingredients,
Accept and Keep mine".

**Built.** Tests in `tests/server/test_source_updates_api.py`, including a new fixture version loaded through `load_file`, a basis of 50 and the attribute unit change g to mg (no false update); the list statement count is equal for 1 and 5 linked ingredients with updates. `gen:api` ran; `test-units.json` unchanged; `UpdatedValue` exported in `types.ts`. `tests/server` on Postgres: 1048 passed, 1 skipped.

### Task 3: Web: C4's banner

**Files:** create `web/src/components/UpdatedValuesBanner.vue` (+ `.test.ts`); modify
`web/src/pages/IngredientPage.vue`, `web/src/pages/IngredientPage.test.ts`, `web/src/i18n/en.json`,
`web/src/api/types.ts`, `web/src/test-data.ts`.

- `UpdatedValuesBanner.vue`: props `updates: UpdatedValue[]`, `attributes: Attribute[]` (the lookup),
  `busy: boolean`; emits `answer` with `'accept' | 'keep'`. Renders nothing when `updates` is empty (so the
  parent can mount it without a `v-if` on the length). A `q-banner` (class `updated-values`, `role="status"`)
  with the title **Updated values available**, a line "The data source has new values for this ingredient."
  (`ingredients.updatedValuesLead`), one list line per update using `valueText` of `format.ts`:
  "Protein 13.5 g → 13.8 g", and "Protein none → 13.8 g" when `value` is null (`ingredients.noValue`: "none");
  an update whose attribute is not in the list (a stale attribute list) is not shown; two buttons **Accept**
  (class `accept-updates`) and **Keep mine** (class `keep-updates`), disabled while `busy`.
- `IngredientPage.vue`: the banner under the chip (D4's `SourceChip`) when the ingredient is linked, passing
  `data.ingredient.updated_values`. `answer(kind)`: busy flag, `POST /api/ingredients/{id}/source-values`
  `{answer}`, then `data.value.ingredient = answered` **without `fillDraft`**, and the draft patched as in
  interpretation 6: for `accept`, `draft.values[attribute_id] = new_value` for each update it had shown;
  for `keep`, `draft.values[attribute_id] = '0'` for each update whose `value` was null and whose draft field is
  still empty. Any failure shows `ingredients.sourceValuesFailed` ("Could not save your answer. Try again.") in
  the page's alert line (`errors.save`) and the banner stays. If the typed basis in the form was edited and not
  saved, nothing special: the server's scaling uses the saved basis (the banner says so only through its numbers).
  Keep the page's additions to a handful of lines, the logic being in the component.
- `en.json`: `ingredients.{updatedValues, updatedValuesLead, noValue, accept, keepMine, sourceValuesFailed}`
  (check for existing keys first; reuse `common` where one fits).

**Tests (first):**
- `UpdatedValuesBanner.test.ts`: nothing rendered for `[]`; two updates render the two lines with the attributes'
  names, units and both numbers ("Protein 13.5 g → 13.8 g", "Iron none → 4 mg"); **Accept** emits `answer` with
  `accept` once, **Keep mine** `keep`; both disabled while `busy`; an update for an unknown attribute id is skipped.
- `IngredientPage.test.ts` (the page's fake server pattern): an ordinary ingredient and a linked one without updates
  show no banner; a linked one with updates shows it; **Accept** posts `{answer: "accept"}` once to the right URL, the
  banner goes, the Protein field shows `13.8`, an unsaved edit of the name typed before stays; **Keep mine** posts
  `keep`, the banner goes, fields stay, and an update with `value: null` leaves `0` in that field (so a following Save
  sends it: assert the PUT body); a failing answer shows "Could not save your answer. Try again." and the banner stays;
  the buttons are disabled while the request runs and a second click sends nothing.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`. Commit: "web: Updated values available banner on a
linked ingredient".

**Built.** As written. `UpdatedValuesBanner.test.ts` (5 tests) and 7 new page tests (Accept, Keep mine with the `0` in the PUT body, a typed value is not overwritten by the `0`, failure, busy and a second click).

### Task 4: Web: C3's marker and filter

**Files:** modify `web/src/pages/IngredientsPage.vue`, `web/src/pages/IngredientsPage.test.ts`,
`web/src/i18n/en.json`.

- Interpretation 8. `hasUpdates(ingredient)` is `updated_values.length > 0`. The marker is a
  `q-badge` (class `updated-marker`, an `outline`/colour pair that passes contrast; no colour alone: the text carries the
  meaning) in the row's caption line; the toggle `q-toggle` (class `updated-filter`, label **Only with updated values** with the
  count, "(3)") sits beside the search input and is shown while any ingredient has updates. `shown` applies the name search
  first and the filter after. With the filter on and nothing shown the empty line is `ingredients.noUpdated`.
  If the toggle is on and the last updated ingredient disappears (a reload), the filter is ignored rather than showing an
  empty list that cannot be explained (the toggle is hidden, so `shown` uses `filter && anyUpdates`).
- `en.json`: `ingredients.{updatedMarker, onlyUpdated, noUpdated}`.

**Tests (first), `IngredientsPage.test.ts`:** no marker and no toggle when no ingredient has updates; with two of three
ingredients updated, two rows carry the marker and the toggle reads "(2)"; turning it on lists only those two; the name search
narrows them further; a search that matches none shows "No ingredients have updated values."; turning it off lists all; the
existing tests are unchanged.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`. Commit: "web: mark and filter ingredients with updated
values".

**Built.** As written, with the marker as a `q-badge` in its own caption line and the toggle in a row beside the search. 3 new tests in `IngredientsPage.test.ts`.

### Task 5: End-to-end step

**Files:** modify `web/e2e/catalog.e2e.ts`.

Re-read the flow as D4 left it first (its end state: the fixture source mapped for **TEST Energy**; **TEST Protein**
unmapped because the Protein attribute was deleted; `Source oats` added and unlinked; the page's `.ingredient-row`
locators) and adapt. The step goes at the end and must not break earlier single-row locators; use new names (`Linked A`,
`Linked B`).

- Ingredients: **Add from data source**, choose **TEST Oats**, name `Linked A`, **Add**; again for `Linked B` (the
  duplicate warning shows; ignore it). No banner on either (open `Linked A`, no `.updated-values`).
- Attributes: add **Protein** (unit g) if D3's flow no longer has one. Settings, **TEST Source**: map **TEST Protein** to it.
- Ingredients: both linked rows show **Updated values available**; the toggle **Only with updated values (2)** lists exactly
  `Linked A` and `Linked B` (not `Source oats` or others); turn it off.
- `Linked A`: the banner reads "Protein none → 13.5 g" (the fixture's value); **Accept**; the banner goes and the Protein field
  reads `13.5`; Save; back on the list `Linked A` shows Protein 13.5 g and no marker.
- `Linked B`: **Keep mine**; the banner goes and Protein reads `0`; Save; reload: no banner (answered).
- Ingredients: the toggle is gone (no ingredient has updates). Update the flow's header comment.
  (A new source *version* cannot be loaded in this flow; the server tests cover it.)

**Verify (the run is the test):** `cd web && npx vite build`; start the server on a temp SQLite file in the scratchpad with
`DATABASE_URL`, `PASSWORD_HASH`, `SESSION_KEY` and `DATA_SOURCES_DIR=$PWD/tests/data/data_sources`; `E2E_PASSWORD=...
E2E_BASE_URL=http://localhost:8000 npm run e2e -- --trace off`; kill the server. Commit: "e2e: updated source values on
linked ingredients".

**Built.** As written (D4 left only TEST Energy mapped and Protein deleted, so Protein is created again from the column with Create attribute). The e2e run passes (~31 s) after the timeout change in interpretation 10.

### Task 6: Docs

**Files:** `README.md`, the master plan, the data source spec, the wireframes spec, this plan.

- `README.md` status paragraph: a linked ingredient shows **Updated values available** when the source's values change
  (after a new data file or a later column mapping); **Accept** copies them, **Keep mine** keeps the ingredient's own; the
  Ingredients list marks and filters them.
- Master plan: after the last "done" line add "D5 done: see `2026-11-08-slice-d5-updated-values.md`."
- Data source spec: "The linked ingredient on C4": the banner lists the ingredient's current value and the new one in the
  ingredient's basis (not the previous source value); a value the ingredient already has is not offered; **Keep mine** gives an
  attribute the ingredient had no value for an explicit 0; "API": `updated_values` shape (`attribute_id`, `value`, `new_value`),
  the `source-values` route, 200 no-op when nothing changed, 422 `not_linked`; "Errors": `not_linked`; "Data model": no new column
  (the comparison is computed).
- Wireframes spec: C3 (the marker and **Only with updated values**), C4 (the banner and its two buttons).
- This plan: Status "Built"; under each task add how it was checked and the differences from the text, as earlier slice plans do.

**Verify:** the full checks (both suites, lint, typecheck) and the e2e run once more. Commit: "Docs: slice D5 built, README,
data source and wireframes specs".

**Built.** Checked: root suite, web lint/typecheck/tests and the e2e run once more (see `d5-report.md`).

## Done when

On C4 a linked ingredient whose source values changed (a new data file, or a column mapped after it was added) shows **Updated
values available** with each attribute's current and new value; **Accept** copies them and **Keep mine** keeps the ingredient's
own and silences the banner until the source changes again; a value whose column is no longer mapped is left alone; the
Ingredients list marks such ingredients and can show only them. No schema change was needed. Both test suites, lint, typecheck,
the migration test and the end-to-end flow are green; no real data file and no network were needed.
