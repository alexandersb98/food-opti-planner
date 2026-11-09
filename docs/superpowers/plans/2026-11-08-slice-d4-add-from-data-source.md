# Slice D4 — Add from Data Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** On the Ingredients page (C3) **Add from data source** opens a
full-screen dialog (C7): a data source drop-down that remembers its last choice
on the server, a food search (20 at a time), and, for a chosen food, a preview
of the ingredient to be made (editable name, the preferred mass unit with the
basis 100 g in it, one row per mapped column with a value converted to the
attribute's unit, the food's source tags on or off, and a warning when an
ingredient already links to that food). **Add** creates the ingredient with the
copied values, remembering each as its `source value`, the chosen tags and the
link, and opens it on C4. C4 shows a chip "From Livsmedelsverket: Havregryn" in
the source's colour (plus "No longer in the source" for a withdrawn food) and
**Unlink from source**. A linked ingredient's unit may change only to another
mass unit (422 `unit_not_for_source`). U3's attribute unit change now converts
the copied source values too. Withdrawn foods can't be added (422 `withdrawn`).

**Architecture:** Three small server pieces. `ingredients.source_food_id` and
`ingredient_values.source_value` (migration `0012`). A new pure module,
`server/source_values.py` (no FastAPI), is the one place that turns a source
food into "the ingredient it would become": the basis in the preferred mass
unit and the mapped, converted values; the preview, the add and (later) D5's
comparison all call it, and it does its arithmetic through one new public
function in `server/unit_change.py` so no second rounding rule exists. The
routes are two additions to D2's `server/api/data_sources.py` (food search and
food preview) and three to `server/api/ingredients.py` (`from-source`,
`unlink`, and a `source` field on every ingredient answer); `from-source`
builds the same `IngredientFields` the ordinary create takes and runs the
ordinary `_fill`, so every existing refusal still applies. U3's list of
converters gets a `source_values` converter for an attribute (the extension
point U3 built for this). The app mirrors this: `AddFromSourceDialog.vue` (C7)
opened from `IngredientsPage.vue`, `SourceChip.vue` on `IngredientPage.vue`,
and the existing `useUnitChange`/`UnitChangeDialog` learn two more count and
refusal texts; the remembered source goes through `usePreferences`.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, `Fraction`/`Decimal`; Vue 3,
Quasar, vue-i18n, Vitest, Playwright.

**Specs:** the data source spec
[`2026-11-03-ingredient-data-sources-design.md`](../specs/2026-11-03-ingredient-data-sources-design.md)
(decisions 1, 4, 8-12; "Data model", the `ingredients` and `ingredient_values`
changes; "C7 · Add from data source"; "The linked ingredient on C4", except the
banner (D5); "API"; "Errors"; "Testing"); slice D4 and the rules of
[`2026-11-08-units-sources-import-slices.md`](2026-11-08-units-sources-import-slices.md)
("Unit conversion grows slice by slice"); the units spec
[`2026-11-03-units-design.md`](../specs/2026-11-03-units-design.md) ("Changing a
unit", the preferred mass unit); screens C3, C4 in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md).
Interfaces of earlier slices:
[`2026-11-08-slice-d2-reference-copy.md`](2026-11-08-slice-d2-reference-copy.md),
[`2026-11-08-slice-d3-column-mapping.md`](2026-11-08-slice-d3-column-mapping.md),
[`2026-11-08-slice-u3-unit-change-converts.md`](2026-11-08-slice-u3-unit-change-converts.md).

**Status:** Built and reviewed task by task on branch
claude/implement-remaining-slices-qwrp83.

## Global Constraints

- `meal_planner/` is not changed.
- Ships Alembic migration `0012` (revision `0012`, down `0011`: D3's); the
  migration test (`tests/server/test_migrations.py`) stays green. The R2 plan
  also planned a migration numbered `0010`; whoever builds R2 renumbers it
  after this one (`0013`, or later if more slices have shipped).
- API tests run on SQLite and, in CI, on Postgres: no SQLite-only SQL (see
  interpretation 4 for why the food search filters in Python).
- All GUI text goes through vue-i18n, English file only
  (`web/src/i18n/en.json`).
- After each task that changes the API (Tasks 1-4): `npm run gen:api` in `web/`
  (regenerates `web/openapi.json`, `web/src/api/schema.ts`;
  `web/src/test-units.json` should come out unchanged), then fix the factories
  in `web/src/test-data.ts` so `npm run typecheck` stays green.
- The Playwright flow gets a step (Task 8).
- No test calls the internet. The real data file is not in the repository: tests
  and e2e use D2's fixture source (`testsource`, "TEST Source": columns `PROT`
  "TEST Protein" g, `ENERC:kcal` "TEST Energy" kcal, `VITD` "TEST Vitamin D" µg;
  foods `1` "TEST Oats" group "TEST Grains", `2` "TEST Milk" and `10` "TEST
  Cheese" group "TEST Dairy"; Milk has no `VITD` value).
- **D2 and D3 were planned but not yet built when this plan was written (both are built now).**
  This plan names their code by the planned names (`server/source_loader.py`,
  `server/api/data_sources.py` with `DataSourceSummary`, `SourceColumn`
  and the D3 route `PUT /{key}/columns/{id}`; models `DataSource`, `SourceColumn`
  with `attribute_id`, `SourceFood`, `SourceFoodValue`, `source_food_tags`,
  `Tag.source_id`; `tests/server/data_source_files.py`, the `data_client`
  fixture, `tests/data/data_sources/testsource.json.gz`; `DataSourcesCard.vue`,
  `DataSourcePage.vue`, `NewAttributeDialog.vue`, `AttributeFields.vue`,
  `useUnits().convertible`; `unit_change.mapped_column_refusal`).
  **Before starting each task, re-read the built D2 and D3 code that task touches**
  (names, field names, i18n keys, test helpers, the e2e flow's last steps and what
  state they leave) and adapt; where this plan and the built code disagree on a
  name, the code wins; on a behaviour the plan wins.
- Checks before each commit: `python3 -m pytest -q` at the root; `npm run lint`,
  `npm run typecheck`, `npm test` in `web/`.

## Interpretations made in this plan

1. **Schema.** `ingredients.source_food_id`: nullable FK `source_foods.id` (no
   cascade: the spec says source foods are never deleted; a database delete of a
   linked food would be refused, which is right), indexed.
   `ingredient_values.source_value`: nullable `EXACT_NUMBER`. Models:
   `Ingredient.source_food` relationship (`Mapped[SourceFood | None]`), and, if
   D2 did not make it, `SourceFood.source` (to `DataSource`). A comment on each
   column quotes the spec (decision 1; "the source's value when last copied or
   answered, converted to the attribute's unit"). Deleting an ingredient or an
   attribute needs no change: values and their `source_value` go with the row.
2. **What the source's numbers become: `server/source_values.py`.**
   `food_basis(db) -> (unit, basis)`: the preferred mass unit (`preferences.preferred_unit(db,
   "mass")`) and 100 g converted into it, rounded half up to 6 decimals (spec).
   If that would round to 0 (a preferred unit so large that 100 g is below
   0.0000005 of it) the basis falls back to `g` and `100`; the ingredient is
   still correct, only not in the preferred unit. `copied_values(db, food) ->
   list[CopiedValue]`: for every column of the food's source that is **not
   withdrawn**, **mapped** (D3's `attribute_id`) and has a value for this food,
   the value converted from the column's unit to the attribute's unit with
   `units.ratio` (exact `Fraction`) and rounded half up to 6 decimals (the same
   arithmetic as U3, through the new `unit_change.convert_number`). Ordered by
   attribute id. A value whose converted size reaches 10^9 (the stored maximum)
   cannot be stored; it is **left out** and reported in `skipped` (attribute
   names), so one odd column never blocks adding a food. A column whose unit
   no longer converts with its attribute's cannot exist (D3 keeps every mapping
   convertible), so `ratio is None` is a bug and raises. A value that rounds to
   0 is kept (zero is a value). Withdrawn columns are not copied because the
   source no longer has them. `CopiedValue(attribute, column, value)` carries what
   the preview shows and what `source_value` stores. D5 reuses `copied_values`.
3. **Values are per 100 g, the basis is 100 g.** Because the basis is exactly
   100 g in whatever the preferred unit is, the ingredient's values are the
   source's values (converted only between the column's unit and the
   attribute's) and need no further scaling, as the spec describes.
4. **Food search (spec: server-side, 20 results at a time).**
   `GET /api/data-sources/{key}/foods?search=&offset=0` answers `{foods, total,
   offset, limit}`; `limit` is a fixed 20 (not a parameter); `total` counts the
   matches. `foods`: `{id, name, groups}` with `groups` the names of the food's
   source tags in name order. Withdrawn foods are not offered. Matching is "the
   name contains the search text, ignoring case", done **in Python** on the
   source's `(id, name)` pairs (about 2 500 rows, one query) with `str.casefold()`,
   not with `lower()`/`LIKE`: SQLite's `lower()` only knows ASCII, so "älg" would
   not find "Älg" there while Postgres would, and `LIKE` needs escaping of `%` and
   `_`. Ordered: names that start with the search first, then by case-folded
   name, then id. An empty search lists every food (page by page). `offset` is
   at least 0 (422 otherwise, the standard Pydantic message). Unknown source key:
   404 `No such data source`. If a second source of tens of thousands of foods
   ever arrives, the match moves into SQL (`unaccent`-style) in that slice.
5. **Food preview.** `GET /api/data-sources/{key}/foods/{food_id}` answers the
   ingredient to be made: `{id, name, withdrawn, source: {key, name, colour},
   suggested_name, unit, basis, values: [{attribute_id, attribute_name,
   attribute_unit, column_name, value}], skipped: [str], groups: [{tag_id,
   name}], existing: [{id, name}]}`. `suggested_name` is the food's name trimmed
   and cut to 100 characters (an ingredient name's maximum; the source allows
   200); `groups` are the food's source tags with their tag ids (what the toggles
   send back as `tag_ids`); `existing` are the ingredients already linked to this
   food, by name, for the warning (spec decision 11). 404 for an unknown source
   or a food that is not of that source ("No such food"). A **withdrawn** food
   still previews (`withdrawn: true`) and is refused only by the add; C7 does not
   offer withdrawn foods, so this only matters to a stale tab.
6. **Add: `POST /api/ingredients/from-source`** with `{food_id, name, tag_ids}`
   (spec) answers 201 with the ordinary `Ingredient`. `food_id` is the id of
   `source_foods` (it already names its source). The server recomputes the unit,
   basis and values (`source_values`) at that moment, from the current mapping
   and preferences, so the client sends no numbers and a mapping changed since
   the preview is honoured. Steps: the food by id (422 `unknown_food` on
   `["body","food_id"]`, through `References`); `withdrawn` food: 422 `withdrawn`
   on `["body","food_id"]`; every `tag_ids` entry must be one of the food's
   source tags (422 `not_a_food_tag` on `["body","tag_ids",i]`; an id naming
   nothing is the usual `unknown_tag`); then the same `IngredientFields` is built
   (`name`, preferred unit, basis, values, tag ids) and goes through
   `ingredients._fill`, so name length, energy-unit and every existing check apply
   unchanged; `source_food_id` is set before `_fill` (the unit rule of 8 reads
   it), `source_value` is set on each created value afterwards, and the commit is
   `commit_named`: a name in use is **409 `name_in_use`** on `name`, exactly as
   for any ingredient. The spec's error table says "422 `duplicate` on `name`, as
   today"; as today the app answers 409 `name_in_use`, so that is what C7 reads.
   The same food can be added twice (spec decision 11): no refusal.
   Source tags chosen become ordinary `ingredient_tags` links; none chosen is
   allowed.
7. **Unlink: `POST /api/ingredients/{id}/unlink`** sets `source_food_id` to NULL
   and every `source_value` of the ingredient to NULL, answers the ingredient
   (200); values, tags and basis stay. Unlinking an unlinked ingredient is a no-op
   200. 404 `No such ingredient`.
8. **The unit rule for a linked ingredient** (spec, C4): the unit may change only
   to another **mass** unit (any spelling of one, so `g` to `kg` or `gram`). A
   volume unit, `st` or other free text is **422 `unit_not_for_source`** on
   `["body","unit"]` from `PUT /api/ingredients/{id}`, and the preview
   (`POST /api/ingredients/{id}/unit-change`) answers it as its `refusal` (type
   `unit_not_for_source`), as it does `unit_not_for_ingredient`. An energy unit
   stays `unit_not_for_ingredient` (checked first; one refusal per field). The
   check is in `ingredients._fill` (it already holds the unit rules) and a small
   shared function builds the preview's refusal. `POST /api/ingredients` (create)
   is not affected: a new ingredient has no link. Values and `source_value` are
   per 100 g of food and are not changed by a unit change; U3's converters
   (basis, recipe amounts) behave as before.
9. **The link is not editable through `PUT`.** `IngredientFields` gets no source
   field, so editing a linked ingredient keeps its link and its `source_value`s
   (the stored value rows are changed in place already). A value the user empties
   deletes its row and with it its `source_value`; D5 therefore sees "no value yet"
   for it, which is the right reading of "the user chose 0".
10. **Ingredient answers gain `source`**: `{key, name, colour, food_id, food_name,
    withdrawn}` or `null` (spec: name, colour, food name, withdrawn). Also in
    `GET /api/ingredients` (list), with the source rows loaded in one extra query
    (`selectinload`), not one per ingredient. `source_value` is **not** exposed in
    D4 (D5 adds `updated_values`).
11. **U3's attribute converter for source values.** `unit_change.attribute_converters`
    gains `Converter("source_values", ...)`, placed right after `ingredient_values`:
    the `ingredient_values.source_value` of that attribute that are not NULL,
    each `Number(kind="source_value", row_id=ingredient_id, name=ingredient name,
    field="source_value", ...)`, rounded to 6 decimals like the value itself, not
    positive-only. Count key `source_values`. `UnitChangeRefusal.type`'s Literal
    gains `unit_not_for_source`, the app's `refusalText` knows the kind
    `source_value` and the type, and `unitChange.counts.source_values` has its
    text (U3's notes ask for exactly these). D3 added `unit_mismatch` to the same
    Literal and `refusalText`: keep both. A source value and its ingredient value
    use the same ratio but are separate numbers: either can be refused (too large)
    first. Existing tests that compare the whole `counts` dict gain
    `"source_values": 0` (a plain attribute has none); the web test that uses
    `source_values` as the example of "a count without text of its own" needs
    another invented key (say `recipe_lines`).
12. **Preference `last_data_source`** (spec decision 9). `GET/PUT /api/preferences`
    gain the key `last_data_source` (a string or `null`, `null` until first set).
    `PUT` accepts it with the other keys (any subset, as now) and refuses a value
    that is not the key of a loaded data source: 422 `invalid_data_source` on
    `["body","last_data_source"]`; `null` is refused too (the web never clears it).
    The check needs the database, so it sits in the route; `preferences.py` gets the
    key in a `TEXT_KEYS` set, with no default, `read()` returns it only when stored,
    and `canonical()`/`refusals()` keep treating only unit keys. Stored unknown
    keys are still ignored. If the remembered source disappears (its file is
    removed), the dialog starts at the first source. The web store's `set(key, unit)`
    renames its second parameter to `value`.
13. **C7 is a dialog, not a route.** `AddFromSourceDialog.vue`, a `q-dialog` with
    `maximized` (full screen; transition `dialog-bottom`), opened by a button next
    to the round **+**, mounted in `IngredientsPage.vue`. The round **+** is a
    floating button (`AddButton`); the new button, labelled **Add from data
    source**, goes in a row under the intro text (`q-btn outline no-caps`, class
    `add-from-source`), always shown. Without any data source the dialog says "No
    data sources loaded." and has nothing else to do. Closing it (the back arrow in
    its header, or Escape) resets nothing but the chosen food; reopening shows the
    search again.
14. **C7 behaviour.** Opening loads `GET /api/data-sources` and the preferences
    (`usePreferences().load()`); the source starts at `last_data_source` if it
    names a listed source, else the first. Changing the drop-down saves
    `last_data_source` through the preferences store (a failed save is silent:
    the choice still works for this visit) and clears the results and the chosen
    food. **Search** is a `q-input` (label "Search foods"), debounced 300 ms, sends
    `search` and `offset=0`; results are a `q-list` of rows (name, caption the
    groups joined by ", "); **Show more** appears under them while `foods.length <
    total` and appends the next 20. A newer search discards an older reply
    arriving late. With an empty search the first 20 foods are listed
    (alphabetical), so the dialog is not blank. Choosing a row loads the preview
    and shows the form: **Name** (editable), "Measured in {unit}, values per
    {basis} {unit}" as text, the values (one line each: "Protein 13.5 g"), a
    "Not copied: {names}" line for `skipped`, **Tags** as on/off buttons (on by
    default; class `tag-choice` as on C4), the warning for `existing`
    ("You already have an ingredient from this food: Havregryn" with several names
    joined by ", "), and **Add** and **Back to results**. A food with no mapped
    values shows "No columns are mapped for this source yet. Map them on the data
    source page." (Add is still possible: an ingredient with a name and a link).
    **Add** posts; 201: close the dialog and go to `/ingredients/{id}`; 409
    `name_in_use`: under Name "An ingredient with this name already exists."; 422
    `withdrawn`: "This food is no longer in the source." and the preview is
    reloaded; any other failure: `common.saveFailed` in a `role="alert"` line.
    A failing search or preview shows "Could not load the foods." / "Could not
    load the food." with **Try again**.
15. **C4's chip and Unlink.** `SourceChip.vue` (props: `source`, emits `unlink`
    request) renders under the name when `ingredient.source` is not null: a
    `q-chip` with the source's colour as background and a text colour chosen for
    contrast (a new `web/src/colours.ts` `contrastText(hex)`, white or near-black by
    relative luminance), text "From {source}: {food}"; a second chip (outline, no
    colour) "No longer in the source" when withdrawn; and a flat button **Unlink
    from source**. The button opens a confirmation dialog ("Unlink {name} from
    {source}?" "The ingredient keeps its values and tags. It is no longer connected
    to the source, so it won't get updates from it.", **Cancel**, **Unlink**).
    Confirming posts `unlink`, replaces the page's loaded ingredient with the
    answer (the chip goes) and **does not refill the form**, so unsaved edits stay.
    A failure shows `ingredients.unlinkFailed` ("Could not unlink. Try again.")
    in the page's alert line. A linked ingredient's **Measured in** offers the mass
    category only (`UnitField :categories`), and a `unit_not_for_source` refusal
    (preview or save) shows under it as `ingredients.unitNotForSource` ("An
    ingredient from a data source can only be measured in a mass unit such as g or
    kg, as the source's values are per 100 g of food."). The page's `units.basisFor`
    rule (basis follows the unit) is untouched. The "New ingredient" page is not
    affected (`source` is null).
16. **Nothing on C3 yet** beyond the button: the marker for updated values is D5.
    The ingredient list row is unchanged.
17. **Built differently from the text** (found against the built code; the spec
    wins where it speaks):
    - `unit_change.convert_number(value, ratio)` is the public wrapper; the
      `source_values` converter sits between `ingredient_values` and `goals`
      (its count key reads in that order in the answer).
    - `GET/PUT /api/preferences` use an `UNSET` sentinel in `preferences.py`
      to tell "`last_data_source` not sent" from "sent as null" (which is
      refused with `invalid_data_source`).
    - The ingredient's unit rules (energy first, then a linked ingredient's
      non-mass unit) live in one function, `ingredients._unit_refusal`, which
      `_fill` and the preview both use.
    - `from-source` keeps the existing name-in-use answer (409 `name_in_use`).
      The unlinked answer sets both `source_food_id` and the relationship.
    - `GET /api/ingredients` loads the source with `selectinload`; the
      per-ingredient values and tags were already loaded lazily, so a test
      that the SQL statement count stays flat was not added.
    - A `SourceChip` takes a `name` prop (the ingredient's name, for the
      confirmation's title) besides `source` and `busy`.
    - `refusalText` keeps its list of subject kinds and adds `source_value`
      (the smaller change the plan allowed; no `exists` plumbing).
    - The server tests for add, unlink and the unit rule are in
      `tests/server/test_ingredients_from_source.py`, not
      `test_ingredients.py` (which only gained `"source": None`).
    - `web/src/units.ts`: before this slice `unitNamed` was folded into
      `findUnit` (commit "web: findUnit applies the server's case rule ..."),
      so the D3 note about two lookups no longer applies.
    - C7: **Add** is disabled for a withdrawn preview (with the message); a
      failed list of data sources shows the settings card's text with **Try
      again**; the search box keeps its text when going Back to results.
    - The source tag toggles send only the preview's `groups` ids that are on.
18. **Not in this slice:** the "Updated values available" banner, `updated_values`,
    Accept/Keep mine (D5); tag groups (D6); source tags in the other pickers
    (D2 left them plain).

## Tasks

### Task 1: Server: schema, migration, the `last_data_source` preference

**Files:** modify `server/models.py`, `server/preferences.py`,
`server/api/preferences.py`, `tests/server/test_preferences.py`,
`tests/server/test_preferences_store.py` (only if it fits there),
`tests/server/test_migrations.py` (only if a new assertion helps),
`web/src/test-data.ts`, `web/src/preferences.ts`; create
`server/migrations/versions/0012_ingredient_source_link.py`.

- Models (interpretation 1): `Ingredient.source_food_id` (nullable,
  `ForeignKey("source_foods.id")`, `index=True`), `Ingredient.source_food`
  relationship; `IngredientValue.source_value` (nullable `EXACT_NUMBER`);
  `SourceFood.source` relationship if D2 has none. Docstring of `Ingredient`
  mentions the link.
- Migration `0012` (revision `0012`, down `0011`): `op.batch_alter_table("ingredients")`
  `add_column` + `create_foreign_key("fk_ingredients_source_food_id_source_foods", ...)` +
  `create_index("ix_ingredients_source_food_id", ...)`; `op.batch_alter_table("ingredient_values")`
  `add_column("source_value", sa.Numeric(...))` matching `EXACT_NUMBER`'s type as
  the earlier migrations spell it; `downgrade` in reverse. Batch mode because SQLite
  cannot add a foreign key by `ALTER`; follow how `0010`/`0011` name things.
- Preferences (interpretation 12): `server/preferences.py` `TEXT_KEYS = {"last_data_source"}`;
  `read()` adds the stored value of a text key when present; `server/api/preferences.py`:
  `Preferences.last_data_source: str | None = None`, `PreferenceChanges.last_data_source:
  str | None = None`; in `put_preferences`, after the unit `refusals`, a `last_data_source`
  that is set (`exclude_unset` keeps "sent") must be a `DataSource.key` else 422
  `invalid_data_source` (a `None` sent is the same refusal); saved as given.
  `web/src/preferences.ts` `set(key, value)`.
- `web/src/test-data.ts`: the preferences factory (if any) gets `last_data_source: null`.

**Tests (first):** `test_migrations_build_the_tables_the_models_describe` fails until
the migration exists, then passes; an upgrade-from-`0011`-with-data test only if the
file has that pattern (an ingredient and a value made at `0011` survive with NULL
link and NULL `source_value`). `test_preferences.py`: GET has `last_data_source:
null` at first (update the exact-dict tests); with `data_client` PUT `{"last_data_source":
"testsource"}` is saved and read back, and survives a unit change PUT; `"nope"`,
`null`, `5` are 422 (`invalid_data_source` for the first two) and change nothing;
an unknown key is still refused as before; 401 without a session.

**Verify:** the touched tests, the root suite, `npm run gen:api`, `npm run typecheck`.
Commit: "server: ingredient link to a source food, source values, last data source preference".

**Built.** As written. The migration test is the check (no upgrade-from-`0011`
pattern exists; `down_revision` is `0011`, the real head). Preferences tests extended
as listed.

### Task 2: Server: the source's numbers and the food search and preview

**Files:** create `server/source_values.py`, `tests/server/test_source_values.py`;
modify `server/unit_change.py` (the public wrapper), `server/api/data_sources.py`,
`tests/server/test_data_sources_api.py` (or a new `tests/server/test_source_foods_api.py`
if the file is already long), `tests/server/test_unit_change.py`, `web/src/test-data.ts`,
`web/openapi.json`, `web/src/api/schema.ts`.

- `unit_change.convert_number(value: Decimal, ratio: Fraction) -> Decimal | None`:
  `_convert(value, ratio, None, False)`'s value, or None when it reaches the limit.
  Test: g to mg, kg to g, a value over 10^9, rounding half up at 6 decimals, a negative.
- `server/source_values.py` (interpretation 2): `food_basis(db)`, `CopiedValue`,
  `Copied(values, skipped)`, `copied_values(db, food) -> Copied`. Imports
  `models, preferences, unit_change, units`; no FastAPI.
- `server/api/data_sources.py` (D2's router): `FoodSummary(id, name, groups)`,
  `FoodPage(foods, total, offset, limit)`, `FoodPreview` and its parts
  (interpretations 4, 5), routes `GET /{key}/foods` and `GET /{key}/foods/{food_id}`
  with `responses` 404 (and the standard 422 for a bad `offset`). Group names and
  tag ids for a page of foods in one query, `existing` in one query. The ingredient
  model of the API is `models.Ingredient` (not the Pydantic one).

**Tests (first):**
- `test_source_values.py` (a `db` fixture as `test_source_loader.py`'s, the fixture
  source loaded, attributes created with `models`): with `PROT`→Protein `g`,
  `ENERC:kcal`→Energy `kJ`, `VITD`→Vitamin D `mg` mapped, `copied_values` for TEST Oats gives
  Protein 13.5, Energy 1627.576 (389 × 4.184, exact then rounded), Vitamin D 0 (0 µg is a value:
  kept); TEST Milk has no Vitamin D (missing is not zero); an unmapped column is not copied;
  a withdrawn column is not copied; a mapped attribute in `mg` for a `g` column gives
  13500; a value past 10^9 after conversion (a `g` column of 1000 into `µg`: 10^9) is
  in `skipped` with the attribute's name and not in `values`; order by attribute id.
  `food_basis`: default `("g", 100)`; preference `kg` → `("kg", 0.1)`; `oz` → 3.527396;
  a preferred unit that would round 100 g to 0 falls back to `g`, 100 (set the
  preference row directly with a fake huge unit if the catalogue has none; otherwise
  test through monkeypatching `units.ratio`, and say so in the test).
- API (`data_client`): 401 on both routes; 404 unknown source and food id of another
  source; search "oat" finds TEST Oats, "OAT" too, "ä"-style case folding (add a food
  "TEST Älg" to a test-only second source file, or write the fixture with it in the test
  and load it into a `tmp_path` directory) found by "älg" and "ÄLG"; "%" and "_" match
  literally (nothing); an empty search lists all three alphabetically with `total 3`;
  names starting with the search come first ("TEST" lists all; "milk" before "TEST
  Cheese-milk" in a file that has both); a withdrawn food is not listed and not counted;
  paging: a generated source of 45 foods gives pages of 20, 20, 5 with `total 45` and
  `offset` echoed; `offset=-1` is 422; every result carries its group names. Preview: the
  suggested name, `unit "g"`, `basis "100"`, the mapped values with attribute name and
  unit and column name, `skipped`, the groups with tag ids matching `GET /api/tags`,
  `existing` empty then listing two ingredients created through the from-source route
  once Task 3 exists (here: link rows made through `app.state.engine`), a name over 100
  characters cut to 100, a withdrawn food previews with `withdrawn true`; with the
  preference `kg` the basis is `0.1` and `unit "kg"`.

**Verify:** the touched tests, the root suite, `npm run gen:api`, typecheck. Commit: "server:
convert a source food's numbers, search and preview source foods".

**Built.** As written (interpretation 17). The tests are in `test_source_values.py` and
`test_source_foods_api.py`; the huge-unit fallback of `food_basis` is tested by
monkeypatching `units.ratio`, as the plan allows.

### Task 3: Server: add from source, unlink, `source` on ingredients, the unit rule

**Files:** modify `server/api/ingredients.py`, `server/api/unit_changes.py`,
`tests/server/test_ingredients.py`, `tests/server/test_unit_change_api.py`,
`tests/server/test_delete_cascades.py`, `web/src/test-data.ts`, `web/openapi.json`,
`web/src/api/schema.ts`.

- `IngredientSource` response model and `source` on `Ingredient`; `_response` fills it from
  `ingredient.source_food` and its source; `list_ingredients` loads them with
  `selectinload` (interpretation 10).
- `IngredientFromSource(food_id, name, tag_ids)` (`name: Name`), route `POST "/from-source"`
  (201, `responses` NAME_IN_USE, the 422s) placed before the `/{ingredient_id}` routes; steps
  per interpretation 6; `POST "/{ingredient_id}/unlink"` per 7.
- Interpretation 8: in `_fill` the `unit_not_for_source` check (after the energy check, an
  `elif`); `preview_unit_change` gives the same refusal; `UnitChangeRefusal.type` Literal gains
  `unit_not_for_source` (keep D3's `unit_mismatch`). `UPDATE_UNPROCESSABLE` description mentions
  it.

**Tests (first), `tests/server/test_ingredients.py`** (a `linked` helper: `data_client`, an
attribute per fixture column made through `Catalog`, mapped with D3's route or the engine, an
ingredient added from TEST Oats):
- add from source: 201; name as sent (and not the food's), unit `g`, basis `100`, values exactly the
  converted ones with `source_value` set (read through `app.state.engine`, as the answer does not
  show it), the chosen tags linked and the unchosen not, `source == {key, name, colour, food_id,
  food_name: "TEST Oats", withdrawn: false}`; with preference `kg`: unit `kg`, basis `0.1`;
  unmapped columns copy nothing; no mapping at all gives an ingredient with no values; Vitamin D
  (µg) into an attribute in `mg` is 0 and a missing value is no row; a skipped (too large) value
  is not stored and the add still succeeds;
- refusals: 401; unknown food 422 `unknown_food` on `["body","food_id"]`; withdrawn food 422
  `withdrawn` and no ingredient made; a tag of another food 422 `not_a_food_tag` on
  `["body","tag_ids",0]`; an unknown tag id 422 `unknown_tag`; a taken name 409 `name_in_use`
  and nothing created; the same food twice with two names is fine and the preview's `existing`
  lists both; an empty name and a 101-character name 422;
- `GET /api/ingredients` and `GET /{id}` carry `source` (null for an ordinary ingredient; the list
  fills it for many linked ingredients in one go: assert the number of SQL statements does not grow with
  the number of linked ingredients, using SQLAlchemy's event on the engine as other tests do if
  there is such a pattern, else skip this assertion); a withdrawn food (mark it through the engine) shows
  `withdrawn: true` and the ingredient keeps its values;
- unlink: 200 with `source: null`, `source_value` NULL on every value (engine), values, tags and basis
  unchanged, a second unlink is 200, 404 for an unknown id, 401; after the unlink the ingredient accepts a
  volume unit;
- the unit rule: `PUT` of a linked ingredient to `kg` is 200 and converts the basis (U3) and keeps
  the link and every `source_value`; to `dl`, to `st`, to free text `portion` is 422
  `unit_not_for_source` on `["body","unit"]` and nothing changes; an energy unit is `unit_not_for_ingredient`;
  the preview of each is `refusal.type == "unit_not_for_source"` (and `kg` is a normal `convert`); an
  ordinary ingredient may still change to `dl`; `PUT` that only edits a value keeps `source_value` of
  the others; emptying a value removes its row.
- `test_delete_cascades.py`: deleting an attribute removes the values copied for it (with their
  `source_value`) and leaves the link; deleting a linked ingredient works and leaves the source food.

**Then:** `cd web && npm run gen:api`; add `source: null` to the ingredient factory in `test-data.ts`.

**Verify:** the touched tests, the root suite, typecheck. Commit: "server: add an ingredient from a
source food, unlink, linked ingredients keep to mass units".

**Built.** As written (interpretation 17). Cascade tests went into `test_delete_cascades.py`.

### Task 4: Server: U3's attribute unit change converts source values

**Files:** modify `server/unit_change.py`, `server/api/unit_changes.py` (nothing if Task 3 did the
Literal; keep this task's part about `kind` docs), `tests/server/test_unit_change.py`,
`tests/server/test_unit_change_api.py`, `web/openapi.json`, `web/src/api/schema.ts`.

- `attribute_converters`: the `source_values` converter (interpretation 11), after
  `ingredient_values`. Update the module docstring and the `Number.kind` comment ("source_value").
  `UnitChangeRefusal`'s comment lists the kinds.

**Tests (first):** extend the existing helpers of `test_unit_change.py`: with an attribute in `mg`,
two ingredients with values and `source_value`s set through the session (one ingredient with a value
and no source value): `attribute_change(db, iron, "mg", "µg")` counts `{"ingredient_values": 3,
"source_values": 2, "goals": ...}`, `apply()` multiplies both the values and the source values by 1000
and commits, an unlinked ingredient's value converts as before; the number rounded counts a source value
that loses digits; a source value reaching 10^9 is refused as `conversion_too_large` with `kind
"source_value"`, the ingredient's name and `field "source_value"` even when its `value` converts; `kind` is
`no_convert` (mg to dl): counts filled, nothing changed; `same` (mg to `mg.`): nothing changed. The existing
whole-`counts` assertions get `"source_values": 0`. API: the preview of a unit change on an attribute with
two source values counts them; `PUT` converts them (read through the engine) in the same transaction as the
values; a refused `PUT` changes neither (rollback), as U3's tests check for the others. If D3 is built: an
attribute with a mapped column still refuses a category change with `unit_mismatch` first and allows mg to µg.

**Verify:** the touched tests, the root suite, `npm run gen:api` (no diff expected beyond comments),
typecheck. Commit: "server: an attribute's unit change converts copied source values".

**Built.** As written; the existing whole-`counts` assertions gained `"source_values": 0`.

### Task 5: Web: unit-change texts for source values and linked ingredients

**Files:** modify `web/src/composables/useUnitChange.ts`, `web/src/composables/useUnitChange.test.ts`,
`web/src/components/UnitChangeDialog.test.ts`, `web/src/i18n/en.json`, `web/src/test-data.ts`.

- `refusalText`: `unit_not_for_source` returns `t('ingredients.unitNotForSource')`; the kind test no longer
  keeps its own list (`['goal','ingredient_value','basis','recipe_amount']`, which every slice had to extend):
  `kind` is used when `te('unitChange.subject.' + kind)` is true, else `other` (pass `te` as a second
  function of `Translate`'s kind, or let the caller give `exists`; keep the existing call sites working: the
  composable's pages already pass `t`; add an optional `exists` field to `RefusalContext`, defaulting to the
  old list plus `source_value`, and have the pages pass `te`). If that makes the signature clumsy, keep the list
  and add `source_value`: do the smaller change and note it in the commit.
- `en.json`: `unitChange.counts.source_values` ("no source values | 1 source value | {n} source values"),
  `unitChange.subject.source_value` ("The source's {attribute} value of {name}"), `ingredients.unitNotForSource`
  (interpretation 15). `unitChange.refusal.*` need nothing new (the type `unit_not_for_source` has its own
  sentence).
- `UnitChangeDialog.test.ts`: the test of an unknown count key uses another invented key (`recipe_lines`);
  the "every count key the server sends" list gains `source_values`; a new case: counts
  `{ingredient_values: 3, source_values: 2}` read "Iron: 3 ingredient values and 2 source values will be
  converted from mg to µg (× 1000)." `useUnitChange.test.ts`: `refusalText` for `unit_not_for_source` and for a
  `conversion_too_large` of kind `source_value` ("The source's Iron value of Oats (… ) would be …"); the
  kinds from earlier slices still read as before.

**Tests (first):** the new cases fail before the code. **Verify:** `npm run lint`, `npm run typecheck`,
`npm test`. Commit: "web: unit change texts for source values and ingredients from a source".

**Built.** The smaller change for `refusalText` (interpretation 17).

### Task 6: Web: C7, Add from data source

**Files:** create `web/src/components/AddFromSourceDialog.vue` (+ `.test.ts`); modify
`web/src/pages/IngredientsPage.vue`, `web/src/pages/IngredientsPage.test.ts`, `web/src/api/types.ts`,
`web/src/i18n/en.json`, `web/src/test-data.ts`.

- `types.ts`: export `FoodSummary`, `FoodPage`, `FoodPreview` (from `Schemas[...]`).
- `test-data.ts`: `foodSummary(fields)`, `foodPreview(fields)` factories with plain defaults.
- `AddFromSourceDialog.vue` (interpretations 13 and 14): props `modelValue: boolean`; a `q-dialog maximized`
  with a header (back arrow with `aria-label` "Close", title "Add from data source"), a `q-select` "Data source"
  (options the loaded sources by name, `emit-value map-options`), the search, results, **Show more**, and the
  preview form with a `tag-choice` toggle per group. Uses `usePreferences` (`load`, `set('last_data_source', key)`),
  `useRouter` for the push after a 201. Local state in `ref`s; the search debounce is a plain `setTimeout`
  cleared on unmount (no new dependency); a request counter discards late replies. All requests through
  `api.GET/POST`; any exception is the failure state, never an unhandled rejection.
- `IngredientsPage.vue`: the `add-from-source` button under the intro and the dialog mounted once.
- `en.json`: `addFromSource.{button, title, close, dataSource, noSources, search, noResults, showMore,
  loadFailed, loadFoodFailed, retry?, measuredIn, valuesPer, valuesNone, skipped, tags, noTags, duplicate,
  add, backToResults, nameInUse, withdrawn}` (reuse `common.name`, `common.saveFailed`,
  `common.retry`; check for existing keys first). `duplicate`: "You already have an ingredient from this
  food: {names}".

**Tests (first), `AddFromSourceDialog.test.ts`** (a small fake server over the `api` client as the page tests
do; `mountApp` or direct mount as `GoalDialog.test.ts` does):
- opens with the remembered source selected (`last_data_source: "b"` of two sources) and with the first when
  none or an unknown key is remembered; changing the source PUTs `{"last_data_source": key}` once and
  clears the results; a failing save changes nothing visible;
- the first 20 foods list on open (alphabetical as the server answers), each with its groups as caption;
  typing sends one request after the debounce (fake timers) with `search` and `offset=0`; a late reply to an
  older search never replaces a newer one; **Show more** requests `offset=20` and appends, and is gone when
  all are shown; "No foods match." when none;
- choosing a food shows the form: name prefilled and editable, the unit and basis text, the values lines,
  `skipped` line only when there are any, tag toggles all on and clickable (aria-pressed), the duplicate
  warning only when `existing` is not empty and joining names;
- **Add** posts `{food_id, name (as edited), tag_ids (only the toggled-on)}` once, closes and navigates to
  `/ingredients/<id>`; the button shows loading while it runs and a second click sends nothing; a 409
  `name_in_use` shows the text under Name and the dialog stays; a 422 `withdrawn` shows its text and reloads
  the preview; a 500 shows "Could not save. Try again."; an empty name shows "Enter a name." and sends nothing;
  no mapped values shows the hint and Add still works;
- **Back to results** returns to the list with the search text kept; failing search and failing preview
  show their messages and **Try again** repeats the request; no sources: "No data sources loaded.";
- unmounting with a pending reply or timer does nothing (no error, no request).
`IngredientsPage.test.ts`: the button is on the page; clicking it opens the dialog; the page's own tests
unchanged otherwise.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`. Commit: "web: Add from data source dialog on the
Ingredients page".

**Built.** As written; its tests use their own fake `fetch` (they need the query string) with real timers
for the 300 ms pause. See interpretation 17 for the small differences.

### Task 7: Web: C4's source chip, Unlink, mass units only

**Files:** create `web/src/components/SourceChip.vue` (+ `.test.ts`), `web/src/colours.ts` (+ `.test.ts`);
modify `web/src/pages/IngredientPage.vue`, `web/src/pages/IngredientPage.test.ts`, `web/src/i18n/en.json`,
`web/src/test-data.ts`.

- `colours.ts`: `contrastText(hex: string): '#ffffff' | '#1d1d1d'` by relative luminance (WCAG formula;
  anything not `#rrggbb` gives the dark text). Pure and tested: `#ffffff` → dark, `#000000` and `#1976d2` →
  white, `#ffeb3b` → dark, garbage → dark.
- `SourceChip.vue` (interpretation 15): props `source: IngredientSource`, `busy: boolean`; emits `unlink`
  after its own confirmation dialog (the confirmation lives in the component, so the page only handles the
  request). The chip has `aria-label`-free plain text; class `source-chip`; withdrawn chip class
  `source-withdrawn`; button class `unlink-button`.
- `IngredientPage.vue`: render the chip under Name when `data.ingredient?.source`; `UnitField :categories`
  becomes `linked ? ['mass'] : ['mass', 'volume', 'piece']`; `unlink()` posts and sets `data.value.ingredient`
  from the answer without `fillDraft`; `showServerErrors` and `confirmUnitChange` map `unit_not_for_source` to
  `ingredients.unitNotForSource` under the unit (the preview path goes through `refusalText` of Task 5; the
  save path through `byField.unit === 'unit_not_for_source'`, next to `unit_not_for_ingredient`).
  `ingredients.unlinkFailed` in `errors.save`. If the page grows past a screenful of added lines, keep the
  new logic in the component and the page's additions to a handful of lines.
- `en.json`: `ingredients.{fromSource, noLongerInSource, unlink, unlinkTitle, unlinkBody, unlinkConfirm,
  unlinkFailed}`; reuse `common.cancel`.

**Tests (first):**
- `SourceChip.test.ts`: the text "From TEST Source: TEST Oats", the background colour from the source and a
  readable text colour, the withdrawn chip only when withdrawn, **Unlink from source** opens the confirmation
  naming the ingredient's source, Cancel emits nothing, **Unlink** emits once, `busy` disables the button.
- `IngredientPage.test.ts`: an ordinary ingredient shows no chip and offers mass, volume and piece units; a
  linked one shows the chip, offers only mass (open the unit list and look at the groups), and a withdrawn one
  shows the second chip; **Unlink** → confirm → `POST /api/ingredients/<id>/unlink` once, the chip disappears,
  an edited name typed before stays (the form is not refilled), the unit list offers all three groups again;
  a failing unlink shows "Could not unlink. Try again." and the chip stays; changing a linked ingredient's
  unit to `dl` shows `unit_not_for_source`'s text under Measured in, from the preview refusal, and the dialog
  does not open; a `PUT` 422 `unit_not_for_source` shows the same text; `g` to `kg` still asks the Convert
  dialog as before.
- `colours.test.ts` as above.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`. Commit: "web: source chip, Unlink and mass units
only on a linked ingredient".

**Built.** As written. The chip's own tests and the page's tests drive the confirmation.

### Task 8: End-to-end step

**Files:** modify `web/e2e/catalog.e2e.ts`.

Re-read the flow as D3 left it first: the step goes at the end, after D3's mapping step, and relies on its end
state (the **TEST Energy** column mapped to the **Energy** attribute in kcal; **TEST Protein** unmapped after
the Protein attribute's deletion; `DATA_SOURCES_DIR` pointing at the fixture, set up by D2's README/CI change).
If D3's end state differs, map the Energy column in this step instead. It must not disturb earlier
single-row locators (`.ingredient-row`).

- Ingredients: **Add from data source** opens the dialog; the source is **TEST Source** (only one); the list
  shows the three foods with their groups; search "oat" leaves **TEST Oats**; choose it: Name "TEST Oats",
  "Measured in g", Energy "389" (one value line; no Protein line, as Protein is unmapped), the **TEST Grains**
  tag on; fill the name `Source oats`; **Add**. C4 opens: chip "From TEST Source: TEST Oats", name "Source
  oats", **Measured in** `g`, the Energy field `389`, the tag **TEST Grains** pressed. Open the unit list:
  only the Mass group. Type `dl` in the unit field and Save: the refusal text under Measured in; set it back.
  Reload the page: the chip is still there (saved, not shown). Back on the list, open **Add from data source**
  again, choose TEST Oats once more: the warning "You already have an ingredient from this food: Source oats"
  shows; close the dialog. Open Source oats, **Unlink from source**, confirm: the chip is gone, Energy is still
  389, the unit list offers Volume again; reload, still unlinked. Update the flow's header comment.

**Verify (the run is the test):** `cd web && npx vite build`; start the server on a temp SQLite file in the
scratchpad with `DATABASE_URL`, `PASSWORD_HASH`, `SESSION_KEY` and
`DATA_SOURCES_DIR=$PWD/tests/data/data_sources`; `E2E_PASSWORD=... E2E_BASE_URL=http://localhost:8000 npm run e2e
-- --trace off`; kill the server. Commit: "e2e: add an ingredient from a data source".

**Built.** As written. D3's end state was as assumed (only TEST Energy mapped, to Energy in kcal).
Checked: `npx vite build`, a server on a temp SQLite file, the flow green (about 25 s).

### Task 9: Docs

**Files:** `README.md`, the master plan, the data source spec, the units spec, the wireframes spec, this plan.

- `README.md` status paragraph: Ingredients can be added from a data source (search, preview, source tags,
  duplicate warning), a linked ingredient shows its source on its page, can be unlinked and is measured in mass
  units only; an attribute's unit change converts copied source values.
- Master plan: after the last "done" line add "D4 done: see `2026-11-08-slice-d4-add-from-data-source.md`."
- Data source spec: "Data model", `ingredients.source food` is `source_food_id` (indexed, no cascade),
  `ingredient_values.source value` is `source_value`; "C7": the food search matches the name ignoring case,
  20 per page, `total`, the preview's `skipped` line and `Not copied`, a food with no mapped values still adds,
  the name cut to 100 characters; "The linked ingredient on C4": chip text, the unit rule's refusal
  `unit_not_for_source`, **Unlink** keeps values and tags; "API": the search and preview shapes, `from-source`,
  `unlink`, `source` on ingredient answers, `last_data_source` in preferences; "Errors": `withdrawn` and
  `not_a_food_tag` on `food_id` / `tag_ids`, `unit_not_for_source`, and the name in use is 409 `name_in_use` as
  for every ingredient (the table said 422 `duplicate`).
- Units spec, "Changing a unit": one sentence that an attribute's unit change also converts the source values
  copied into ingredients, and that a linked ingredient's unit may change only to a mass unit (the data source
  spec decides).
- Wireframes spec: C3 (the **Add from data source** button), a **C7 · Add from data source** section after C6
  (or beside C4: follow the doc's order), C4 (the source chip, **Unlink from source**, mass units only), C5 (its
  unit-change dialog counts source values).
- This plan: Status "Built"; under each task add how it was checked and the differences from the text, as
  earlier slice plans do.

**Verify:** the full checks (both suites, lint, typecheck) and the e2e run once more. Commit: "Docs: slice D4
built, README, data source, units and wireframes specs".

**Built.** As written. Checked: root suite on SQLite (1337 passed) and `tests/server` on Postgres
(1009 passed), lint, typecheck, `npm test` (567 passed), the e2e flow (green on the final code).

## Done when

On the Ingredients page a user can open Add from data source, pick a source (remembered next time), search its
foods, preview the ingredient with its converted values and source tags, add it under a name of their choice (a
taken name is refused on the field, a withdrawn food is refused, an earlier ingredient from the same food gets a
warning) and land on its page, where a chip names the source and food, **Unlink from source** removes the link
and the copied values' memory, and the unit can change only to another mass unit. Changing an attribute's unit
converts the values copied from sources as well as the ingredients' own, with a count and a refusal like the
others. Both test suites, lint, typecheck, the migration test and the end-to-end flow are green; no real data
file and no network were needed.
