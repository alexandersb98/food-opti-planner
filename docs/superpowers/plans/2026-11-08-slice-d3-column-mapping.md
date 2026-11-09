# Slice D3 — Column Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** On the data source page (S2) each column gets an **Attribute**
drop-down that links it to one of the app's attributes. Only attributes whose
unit converts with the column's unit are offered; an attribute already fed by
another column of the same source is shown taken, with that column's name; a
**Create attribute** entry opens a small form (name empty, unit the preferred
unit of the column's category, or the column's own unit when it has no
category) and maps the new attribute on save. The server refuses a mapping
whose units don't convert (422 `unit_mismatch`) and a second column for the
same attribute (422 `attribute_taken`). Deleting an attribute clears its
mappings, and the delete warning counts them. S1's Data sources card shows how
many columns are mapped. Mapping changes nothing in any ingredient (there is no
link from ingredients to source foods until D4).

**Architecture:** One new nullable column, `source_columns.attribute_id`
(migration `0011`), foreign key to `attributes.id` with `ON DELETE SET NULL`
(the database clears the mapping when an attribute goes, as it already removes
values and goals), unique per (source, attribute). The mapping rules sit in the
one API router D2 creates, `server/api/data_sources.py`, as a `PUT
/api/data-sources/{key}/columns/{column_id}` route; the unit rule itself is
`units.factor` (nothing new in `server/units.py`). Two places that already
exist learn about mappings: the attribute router (`mapping_count` in its
response, for the delete warning, and a refusal when a unit change would break
a mapping, built next to the other refusals in `server/unit_change.py`) and
`server/source_loader.py` (a new file version that gives a mapped column a unit
that no longer converts clears that mapping). The app mirrors this: S2's column
rows gain a drop-down, a `NewAttributeDialog` component builds on the shared
attribute form fields, and `units.ts` gains `convertible()`, the client's copy
of the server's rule (the server stays the authority).

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic; Vue 3, Quasar, vue-i18n,
Vitest, Playwright.

**Specs:** the data source spec
[`2026-11-03-ingredient-data-sources-design.md`](../specs/2026-11-03-ingredient-data-sources-design.md)
(decisions 5, 6 and 7; "Data model", `source_columns`; "Settings and the data
source page"; "API", the `PUT .../columns/{id}` row; "Errors"; "Testing");
slice D3 and the rules of
[`2026-11-08-units-sources-import-slices.md`](2026-11-08-units-sources-import-slices.md);
the units spec [`2026-11-03-units-design.md`](../specs/2026-11-03-units-design.md)
("Changing a unit", S1); screens C5 and S2 in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md).
Interfaces of earlier slices:
[`2026-11-08-slice-d2-reference-copy.md`](2026-11-08-slice-d2-reference-copy.md)
and [`2026-11-08-slice-u3-unit-change-converts.md`](2026-11-08-slice-u3-unit-change-converts.md).

**Status:** Built and reviewed task by task on branch
claude/implement-remaining-slices-qwrp83.

## Global Constraints

- `meal_planner/` is not changed.
- Ships Alembic migration `0011` (revision `0011`, down `0010`: D2's); the
  migration test (`tests/server/test_migrations.py`) stays green.
- API tests run on SQLite and, in CI, on Postgres: no SQLite-only SQL. A
  unique constraint on a nullable column is used: several NULLs are allowed on
  both.
- All GUI text goes through vue-i18n, English file only
  (`web/src/i18n/en.json`).
- After the API change (Task 2): `npm run gen:api` in `web/` (regenerates
  `web/openapi.json`, `web/src/api/schema.ts`; `web/src/test-units.json` should
  come out unchanged).
- The Playwright flow gets a step (Task 6).
- No test calls the internet. The real data file is not in the repository
  (D2): tests and e2e use D2's fixture source (`testsource`, "TEST Source").
- **D2 is planned but not yet built when this plan was written.** This plan
  names D2's code by its planned names (`server/source_loader.py`,
  `server/api/data_sources.py`, `DataSourcesCard.vue`, `DataSourcePage.vue`,
  `tests/server/data_source_files.py`, the `data_client` fixture,
  `tests/data/data_sources/testsource.json.gz`). **Before starting each task,
  re-read the D2 code it touches as built** (it may differ in detail:
  function names, field names, i18n keys, test helpers) and adapt; where this
  plan and the built code disagree on a name, the code wins, on a behaviour the
  plan wins.
- Units of the fixture columns (D2): `PROT` "TEST Protein" `g`, `ENERC:kcal`
  "TEST Energy" `kcal`, `VITD` "TEST Vitamin D" `µg`.
- Checks before each commit: `python3 -m pytest -q` at the root; `npm run lint`,
  `npm run typecheck`, `npm test` in `web/`.

## Interpretations made in this plan

1. **The column's mapping is `source_columns.attribute_id`** (the spec's "mapped
   attribute"), nullable, FK `attributes.id` `ON DELETE SET NULL`, unique
   constraint `uq_source_columns_source_id_attribute_id` on (`source_id`,
   `attribute_id`). The database does the clearing on an attribute delete, as it
   does for ingredient values and goals (SQLite has foreign keys on in the app's
   engine, `server/db.py`).
2. **The API.** `PUT /api/data-sources/{key}/columns/{column_id}` with body
   `{"attribute_id": <int> | null}` (`extra="forbid"`; the field is required,
   `null` unmaps). It answers the column: `id, key, name, unit, withdrawn,
   attribute_id`. D2's `SourceColumn` response model gains `attribute_id: int |
   None`, so `GET /api/data-sources/{key}` carries every column's mapping too.
   Mapping the same attribute again to the column that already has it is a no-op
   200. Answers: 404 `No such data source`, 404 `No such column` (also for a
   column of another source); 422 `unknown_attribute` on `["body","attribute_id"]`
   for an id that names nothing (the `References` helper of
   `server/api/catalog.py`); 422 `unit_mismatch`; 422 `attribute_taken`. Both
   named 422s sit on `["body","attribute_id"]` in the `FieldErrors` shape.
3. **`unit_mismatch` is `units.factor(column.unit, attribute.unit) is None`**,
   which is exactly spec decision 7: the same category, or the same free text
   (compared as the catalogue does, case-insensitively, `st` equals `st.`).
   Consequences accepted: an empty column unit never maps (two empty units are
   not "the same free text"); a free-text pair such as `dose`/`Dose` maps; an
   `st` column maps to an `st` attribute. The message names both units.
4. **`attribute_taken`** is: another column **of the same source**, withdrawn or
   not, already has the attribute. The message names that column ("Protein is
   already mapped from TEST Protein."). A concurrent double mapping is caught by
   the unique constraint (`IntegrityError` on commit, rolled back, answered the
   same way after re-reading the holder). Another source may map the same
   attribute: the constraint is per source.
5. **Withdrawn columns can be re-mapped or unmapped.** The spec says they keep
   their mapping; it does not forbid changing it, and without that an attribute
   held by a withdrawn column could never be freed. S2 keeps the drop-down
   enabled on a greyed row.
6. **A column's unit changing in a new data file** (D2's loader updates
   `source_columns.unit` by key): after the update, a mapping whose attribute no
   longer converts with the new unit is cleared and logged at warning level
   ("column %s of %s now in %s; mapping to %s cleared"). A change within the
   category (g to mg) keeps the mapping; the spec has no rule for it and this
   keeps decision 7's invariant (every stored mapping converts) true after every
   load.
7. **An attribute's unit change must keep its mappings convertible.** U3 lets an
   attribute's unit change to another category and converts nothing. With a
   mapping that would break decision 7, so, as one more refusal alongside U3's
   (preview and `PUT`): a unit change is **refused with `unit_mismatch`** when a
   column mapped to the attribute would no longer convert (`units.factor(column
   unit, new unit)` is None). The refusal facts: `kind "source_column"`,
   `name` the column's name, `source` the source's name, `unit` the column's
   unit; the text tells the user to unmap the column first. A change within the
   category (mg to µg, g to kg) is fine: the mapping still converts, and stored
   values are converted by U3 as before (D4 adds its converter for copied
   source values). The first mapped column in (source id, column id) order is the
   one reported. `UnitChangeRefusal.type`'s Literal and the app's `refusalText`
   get the new type, as U3's notes say a later slice must.
8. **The attribute's `mapping_count`** is the number of columns (withdrawn
   included, as they keep their mapping) mapped to it, added to the `Attribute`
   response beside `ingredient_count` and `goal_count`. C5's delete warning adds
   "Its mapping from 2 source columns is cleared." (only when above 0; when the
   other counts are 0 it is the whole warning).
9. **S1's count.** `DataSourceSummary` gains `mapped_count`: columns not
   withdrawn that have an attribute (`column_count` counts non-withdrawn columns
   too, so the card can say "2 of 55 columns mapped"). The card's caption becomes
   "Version 2026-01-01 · 3 foods · 2 of 55 columns mapped".
10. **The drop-down's options (S2).** For a column, in order: "Not mapped"
    (the null choice); each attribute whose unit converts with the column's
    (client rule `convertible`, interpretation 11), in the attributes' own
    order; attributes held by another column of this source are shown disabled
    with the caption "taken by <column name>"; last, "Create attribute…". The
    attribute currently mapped is always shown selected. Choosing saves at once
    (PUT); the select is disabled while the request runs; a failure shows a
    message under the row and the select goes back to the stored value.
    `attribute_taken` and `unit_mismatch` answers show their own text and reload
    the source (the page was stale).
11. **The client rule.** `useUnits().convertible(a, b)` in `web/src/units.ts`
    mirrors `units.factor`'s test: both texts name catalogue units with the same
    non-null category (same unit included), or neither names a unit and the
    cleaned, lower-cased texts are equal and non-empty. It uses the same
    `clean` and `findUnit` the file already has. The server's 422 stays the
    authority; the client copy exists to filter the list without a request per
    attribute. A web test pins the cases to the catalogue fixture
    (`test-units.json`), including the ones in interpretation 3.
12. **Create attribute.** A dialog (`NewAttributeDialog.vue`), opened from the
    drop-down's last entry, with Name (empty), Unit and Decimals (default 3, the
    attribute page's default), the same fields and hints as C5. The unit starts
    as the preferred unit of the column's category (`unit.mass`, `unit.volume`,
    `unit.energy` preference); for a column whose unit is not a catalogue unit,
    or has no category, the column's own unit. The unit field offers the
    column's category only (all three categories are not offered: the attribute
    must convert with the column); for a free-text column it is a plain text box.
    **Add** first checks `convertible(column unit, typed unit)` in the browser
    (error under Unit: "Must convert with <column unit>."), then `POST
    /api/attributes`; on success the dialog closes and the page maps the column
    with the `PUT`. If the `PUT` then fails, the attribute exists unmapped (it
    shows in every drop-down) and the row shows "The attribute was created but
    could not be mapped." The two calls are not one transaction: there is one
    spec'd endpoint for mapping, and the spec's "on save it is mapped" is about
    the user's flow. A name in use is shown on the name field as on C5.
13. **S2 loads the attributes too.** `DataSourcePage` fetches the source and
    `GET /api/attributes` together (`loadAll`); either failing is the page's
    load-failed state. The attribute list lives in the page, so a created
    attribute is appended without a refetch.
14. **Shared attribute form fields.** The refactor (see `d3-refactor.md`, if the
    controller accepted it) moves C5's three inputs, their two hint lines, the
    decimals range and the decimals example into `AttributeFields.vue` plus
    `web/src/attributeFields.ts` before this slice. Task 5 uses them; if the
    refactor was not done, Task 5 does that extraction first (it is mechanical)
    and says so in its commit.
15. **No ingredient effect.** Mapping, unmapping and clearing change no
    ingredient, value or goal; D4 reads the mapping when it copies values, D5
    when it compares. `server/unit_change.py` gets the one refusal of
    interpretation 7 and no converter (there is still no stored number in an
    attribute's unit that comes from a source until D4).

16. **The client rule knows "MJ".** The server reads a capital M before a milli
    unit (`MJ`, `Ml`) as mega, so free text; the app's `findUnit` does not. A
    `unitNamed` in `units.ts` (also used by the Create attribute dialog) applies
    that rule on top of `findUnit`, so `convertible` agrees with `units.factor`
    for `MJ` against `J` (false). `findUnit` itself is unchanged.
    *(Superseded after the D3 review: the rule moved into `findUnit` and
    `unitNamed` was deleted, so one lookup exists; see the D4 commits.)*
17. **S2's row is a component, `SourceColumnRow.vue`,** with D2's class
    `column-row` (not `source-column-row`) and a `column-name` label; D2's tests
    that compared a row's whole text now compare names and captions. It has no
    test of its own: the page tests drive it.
18. **S2 loads the unit catalogue** (`useUnits().load()`), as the drop-downs need
    it; without it only equal spellings convert. A row's error for a refused
    `attribute_taken` is built after the reload from the holder it shows; if the
    reload can't name one, the plain "Could not save the mapping.".
19. **S1's caption** pluralises on the column count: "1 of 1 column mapped".
20. **Create attribute.** Error text for a failed save is the existing
    `common.saveFailed` ("Could not save. Try again."); the button key is
    `dataSource.add`. While the catalogue or preferences load, the dialog's start
    unit follows them until the user touches the unit.
21. **D2 follow-up.** The data file reader strips group names and food names, so a
    source tag's name always equals the trimmed name the tags `PUT` uses.

## Tasks

### Task 1: Server: the column, migration, delete clears, loader keeps it valid

**Files:** modify `server/models.py`, `server/api/attributes.py`,
`server/source_loader.py`, `tests/server/test_delete_cascades.py`,
`tests/server/test_attributes.py`, `tests/server/test_source_loader.py`,
`tests/server/test_migrations.py` (only if a new assertion helps), `web/src/test-data.ts`
(the `attribute()` factory default `mapping_count: 0`, so typecheck stays green
after Task 2's `gen:api`; add it in Task 2 if `schema.ts` is not regenerated
here); create `server/migrations/versions/0011_column_mapping.py`.

- Model: `SourceColumn.attribute_id: Mapped[int | None]` with
  `ForeignKey("attributes.id", ondelete="SET NULL")`, a
  `UniqueConstraint("source_id", "attribute_id", name="uq_source_columns_source_id_attribute_id")`
  in `__table_args__` next to D2's (source, key) one; a comment: "set: the
  attribute this column feeds (data source spec, decision 5)".
- Migration `0011`: `op.batch_alter_table("source_columns")` with `add_column`
  (`attribute_id`, Integer, nullable), `create_foreign_key("fk_source_columns_attribute_id_attributes",
  "attributes", ["attribute_id"], ["id"], ondelete="SET NULL")` and
  `create_unique_constraint("uq_source_columns_source_id_attribute_id",
  ["source_id", "attribute_id"])` (batch, as SQLite cannot add either by
  `ALTER`); `downgrade` drops the constraint, the foreign key and the column in
  reverse, in batch mode. Follow how D2's `0010` names things.
- `server/api/attributes.py`: `Attribute` gains `mapping_count: int`;
  `_counts` adds `"mapping_count": count_by(db, models.SourceColumn.attribute_id)`
  (a NULL group appears in the dict and is never looked up).
- `server/source_loader.py`: in `load_file`, after columns' names and units are
  updated, a step `_clear_broken_mappings(db, source)`: for each column of the
  source with `attribute_id` set whose `units.factor(column.unit, attribute.unit)`
  is None, set it to None and `logger.warning(...)` as in interpretation 6. One
  query joining columns to attributes; nothing when no column is mapped. (D2's
  `load_file` commits at its end; this runs before the commit, inside the same
  transaction.)

**Tests (first):**
- `test_migrations_build_the_tables_the_models_describe` fails until the
  migration exists, then passes; add an upgrade-from-`0010`-with-data test only
  if the existing migration tests have such a pattern (copy it): a column row
  made at `0010` survives with `attribute_id` NULL.
- `test_delete_cascades.py`: deleting an attribute sets the mapping of its
  column to NULL (set the column's `attribute_id` through `app.state.engine`,
  as D2's tests do; `data_client`), leaves the column and the other columns'
  mappings alone, and an attribute counts its mapped columns in `mapping_count`
  (two columns of two sources, withdrawn one included).
- `test_attributes.py`: the created attribute's body now has `"mapping_count": 0`
  (update the exact-dict test).
- `test_source_loader.py`: a mapped column (`PROT` to a `g` attribute) whose
  unit becomes `kcal` in version 2 loses its mapping (warning in `caplog`); one
  whose unit becomes `mg` keeps it; an unmapped column and a column not in
  version 2 are untouched; a withdrawn column that keeps its unit keeps its
  mapping.

**Verify:** the touched test files, then `python3 -m pytest -q`. Commit:
"server: source columns can hold a mapped attribute, the loader keeps it valid".

**Built.** As written, plus the D2 follow-up, committed first as "server: data
file group and food names are trimmed" (`source_loader.py` strips group and food
names, a blank one is refused; test added). The upgrade-from-`0010` pattern did
not exist in the migration tests; checked by hand instead (a column row made at
`0010` survives upgrade with `attribute_id` NULL, and downgrade drops it). A
`two_sources_client` fixture (source `other`) went into `tests/server/conftest.py`.
`gen:api` already ran here, as `test_openapi` fails otherwise. Checked: root
suite, lint, typecheck, `npm test`.

### Task 2: Server: the mapping route, counts and the unit-change refusal

**Files:** modify `server/api/data_sources.py`, `server/api/unit_changes.py`,
`server/api/attributes.py`, `server/unit_change.py`, `tests/server/test_data_sources_api.py`,
`tests/server/test_unit_change_api.py`, `tests/server/test_unit_change.py`,
`web/src/test-data.ts`, `web/openapi.json`, `web/src/api/schema.ts`.

**`server/api/data_sources.py`** (names as D2 planned them; note the Pydantic
`SourceColumn` there is not `models.SourceColumn`):

```python
class SourceColumn(BaseModel):          # D2's, plus the mapping
    id: int; key: str; name: str; unit: str; withdrawn: bool
    attribute_id: int | None

class DataSourceSummary(BaseModel):     # D2's, plus mapped_count
    ...; column_count: int; mapped_count: int

class ColumnMapping(BaseModel):
    model_config = ConfigDict(extra="forbid")
    attribute_id: int | None
```

- `mapped_count`: a grouped query beside the column counts (no per-row query):
  columns not withdrawn with `attribute_id IS NOT NULL`, by source.
- `PUT /{key}/columns/{column_id}` -> `SourceColumn`, `responses` with the 404s
  and `{422: FieldErrors}` so `schema.ts` knows the shape. Steps: find the source
  by key (404 `No such data source`), the column by id **and** source (404 `No
  such column`); `null` clears the mapping and answers; else the attribute through
  `References.rows(models.Attribute, [(["attribute_id"], id)], "attribute")` then
  `check()`; `units.factor` None -> `unit_mismatch` ("TEST Protein is in g, and
  Energy in kcal: they don't convert."); the holder: another column of this
  source with the attribute -> `attribute_taken`; set, `commit`; an
  `IntegrityError` on commit -> rollback and `attribute_taken` with the holder
  re-read. Same attribute as now: 200 with no write. The error list for a bad
  request holds the one error; `unknown_attribute` wins over the rest.
- The summary/detail answers include the new fields; D2's tests that compare a
  whole summary or column dict get `mapped_count: 0` / `attribute_id: None`.

**`server/unit_change.py` and `server/api/unit_changes.py`** (interpretation 7):
`Refusal` (dataclass) gains optional `source: str | None` and `unit: str | None`;
`UnitChangeRefusal` gains the same two optional fields and `"unit_mismatch"` in
its `type` Literal. New function
`mapped_column_refusal(db, attribute, new_unit) -> Refusal | None` in
`unit_change.py`: the first column (by source id, column id) mapped to the
attribute with `units.factor(column.unit, new_unit) is None`, as
`Refusal(type="unit_mismatch", msg=..., kind="source_column", name=column name,
source=source name, unit=column unit)`. In `server/api/attributes.py`, after
`unit_change.plan(...)` in both the preview and `update_attribute`:
`change.refusal = change.refusal or unit_change.mapped_column_refusal(db, attribute, body.unit)`
(`Change` is a plain dataclass, so this is allowed; only when the unit text
differs from the stored one). `refuse()` already raises the 422 on
`["body","unit"]`. The route's `responses` already list the 422.

**Tests (first), `tests/server/test_data_sources_api.py`** (`data_client`; build
attributes through `Catalog(data_client)`, as the `catalog` fixture is on the
plain `client`; find column ids through `GET /api/data-sources/testsource`):
- 401 without a session; 404 for an unknown source, an unknown column, and a
  column id of another source (load a second fixture source, or write a second
  file with key `other` in the same directory);
- maps `PROT` to a `g` attribute: 200, body has `attribute_id`; the detail GET
  shows it; the summary's `mapped_count` is 1; mapping to an `mg` attribute
  works too (same category); `ENERC:kcal` to an attribute in `kcal`, and in
  `kJ`, both work;
- `PROT` to a `kcal` attribute: 422 `unit_mismatch` on `["body","attribute_id"]`,
  nothing stored; a free-text pair: a column whose unit is `dose` (a second
  fixture file with such a column) maps to an attribute with unit `Dose`, and
  not to one in `g`; a column with an empty unit maps to nothing (422);
- the same attribute for `PROT` and then `VITD` (`µg` and `g` convert):
  422 `attribute_taken` naming `TEST Protein`, `VITD` stays unmapped; mapping
  `PROT` again to the attribute it has is 200; unmap `PROT` (`null`), then `VITD`
  can take the attribute; a withdrawn column holding the attribute still blocks
  it, and can itself be unmapped or re-mapped (withdraw through `app.state.engine`);
  two different sources may map the same attribute;
- a missing `attribute_id`, an extra field, a string id: standard 422; an id that
  names nothing: 422 `unknown_attribute`; none of the refusals changes a stored
  mapping;
- counts: `mapped_count` ignores a withdrawn mapped column; `column_count` unchanged;
- **attribute side** (put in `test_attributes.py` or `test_delete_cascades.py`
  with `data_client`): `mapping_count` reads 1 after mapping, 0 after unmap, and
  after deleting the attribute the column answers `attribute_id: null`.

**Tests (first), `test_unit_change.py` / `test_unit_change_api.py`:** with `PROT`
(g) mapped to attribute Protein (g): the preview of g to kg is `convert` with no
refusal; mg and µg likewise; **kcal** gives `refusal.type == "unit_mismatch"`,
`kind "source_column"`, `name "TEST Protein"`, `source "TEST Source"`, `unit "g"`,
and `PUT` with that unit is 422 `unit_mismatch` on `["body","unit"]`, nothing
changed (name, unit, an ingredient value, the mapping); free text `portion`
refused the same way; with the column unmapped the same change is allowed
(`no_convert`, as U3 tested); a refusal from U3's own converters still wins when
both apply (first refusal kept); a spelling change (g to gram) is `same` and not
refused.

**Then:** `cd web && npm run gen:api`; `git diff --stat` shows only `openapi.json`
and `schema.ts` (and `test-units.json` not); add `mapping_count: 0` to the
`attribute()` factory default in `web/src/test-data.ts`, and `mapped_count: 0` /
`attribute_id: null` to D2's `dataSourceSummary()` / `sourceColumn()` factories.

**Verify:** the touched tests, the root suite, `npm run typecheck`. Commit:
"server: map data source columns to attributes".

**Built.** As written. The refusal's `source` and `unit` fields are always in
the answer (null for U3's refusals), so U3's exact-dict test got the two nulls.
A unit_mismatch refusal and a U3 conversion refusal cannot both apply (a mapping
breaks only where nothing converts), so "first refusal kept" is not testable;
the test pins that a conversion refusal inside the category is U3's own.

### Task 3: Web: the client rule, C5's delete warning and the new refusal

**Files:** modify `web/src/units.ts`, `web/src/units.test.ts`,
`web/src/composables/useUnitChange.ts`, `web/src/api/errors.ts`,
`web/src/pages/AttributesPage.vue`, `web/src/pages/AttributesPage.test.ts`,
`web/src/i18n/en.json`, `web/src/test-data.ts`.

- `units.ts`: `convertible(a: string, b: string): boolean` in `useUnits()`
  (interpretation 11), using `clean`/`findUnit` already there; exported from the
  returned object. Not a composable-state change.
- `useUnitChange.ts` `refusalText`: `unit_mismatch` -> `t('unitChange.refusal.unit_mismatch',
  {attribute, name: refusal.name, source: refusal.source, column: refusal.unit,
  to: context.to})`; `unitChange.subject` needs no new key.
- `errors.ts` `conversionRefusal`: also accept `type === 'unit_mismatch'` (a save
  that raced a mapping made elsewhere shows the server's `msg`), keeping the
  existing `conversion_` prefix case; rename nothing, update its doc comment.
- `AttributesPage.vue`: `deleteWarning` counts `mapping_count`: parts as in
  interpretation 8; `NEW_ROW` gets `mapping_count: 0`.
- `en.json`: `unitChange.refusal.unit_mismatch` ("{attribute} is mapped from
  {name} ({source}), which is in {column}, so it can't become {to}. Unmap the
  column on the data source page first."); `attributes.deleteUnmaps` ("Its mapping
  from {columns} is cleared.") and `count.sourceColumns` ("no source columns | 1
  source column | {n} source columns"); `attributes.deleteRemoves` stays as it is.

**Tests (first):**
- `units.test.ts`: `convertible` for g/kg, g/mg, g/ml (false), kcal/kJ (true),
  `st`/`stycken` (true: both name the catalogue unit `st`), `dose`/`Dose`
  (true), `dose`/`portion` (false), `''`/`''` (false), `g`/`''` (false), text
  and a catalogue unit (false), `MJ` (free text) and `J` (false), spelling
  `gram`/`g` (true).
- `AttributesPage.test.ts`: an attribute with `mapping_count: 2` warns "Its
  mapping from 2 source columns is cleared." after the values sentence; one with
  only mappings (`ingredient_count 0, goal_count 0`) shows just that sentence
  (`common.deleteNothing` still shows when all three counts are 0); a preview refusal of
  type `unit_mismatch` shows the sentence under Unit and no dialog; a `PUT`
  422 of that type shows the server's message.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test` in `web/`. Commit:
"web: units converts() rule, mapped columns in the attribute delete warning and
unit refusal".

**Built.** As written, with the rule named `convertible` and one addition (interpretation 16).

### Task 4: Web: S2's Attribute drop-down and S1's mapped count

**Files:** modify `web/src/pages/DataSourcePage.vue`, `web/src/pages/DataSourcePage.test.ts`,
`web/src/components/DataSourcesCard.vue`, `web/src/components/DataSourcesCard.test.ts`,
`web/src/i18n/en.json`, `web/src/test-data.ts`; create
`web/src/components/SourceColumnRow.vue` (+ `.test.ts`) if D2's page builds its
rows inline (move the row into it; keep D2's classes and texts so D2's tests stay
as they are; if D2 already made a row component, extend it).

- `DataSourcePage.vue`: load with `loadAll({source, attributes})` (interpretation
  13). Keep the search (it filters in the browser and does not re-sort; matches
  the column name only). Each row: name, unit caption (D2's), the column's
  **Attribute** drop-down (`q-select`, dense, outlined, `label` "Attribute",
  `data-testid`-free: tests find it by label and the row's class
  `source-column-row`), options per interpretation 10 as `{label, value, disable,
  caption}` plus the sentinel `'create'` (label "Create attribute…", not
  disable-able). `update:model-value`: `'create'` opens the dialog of Task 5
  (here a placeholder `createFor = ref<Column | null>(null)` that Task 5 wires);
  `null` or an id runs `map(column, attributeId)`:

  ```ts
  async function map(column: SourceColumn, attributeId: number | null)
  // saving[column.id] = true; PUT /api/data-sources/{key}/columns/{id} {attribute_id};
  // success: replace the column in data.columns with the answer (order kept);
  // 422 attribute_taken / unit_mismatch: row error text, then reload the source;
  // any other failure or exception: row error t('dataSource.mapFailed');
  // errors cleared on the next attempt for that row.
  ```

  The select shows the stored `attribute_id`'s attribute name as its value; it
  is `disable`d while saving. A row error is `role="alert"` under the select.
  Withdrawn rows keep their greying and caption and an enabled select.
  "taken by X": a `Map` of attribute id to the column name, built from the
  source's columns other than this row's.
- `DataSourcesCard.vue` caption: add " · {mapped} of {columns} columns mapped"
  (`settings.dataSources.mapped`, plain pluralisation on `mapped`).
- `en.json`: `dataSource.{attribute, notMapped, createAttribute, takenBy,
  mapFailed, takenError, mismatchError}` (`takenBy`: "taken by {column}";
  `takenError`: "{attribute} is already mapped from {column}."; `mismatchError`:
  "{column} and {attribute} don't convert."), `settings.dataSources.mapped`.

**Tests (first):**
- `DataSourcePage.test.ts` (fake server: the source with three columns, one
  mapped, plus `GET /api/attributes` with Protein g, Fat g, Energy kcal, Iron mg):
  the drop-down of the `g` column lists "Not mapped", Protein, Fat, Iron (g and
  mg convert), not Energy, then "Create attribute…", in that order; the `kcal`
  column lists Energy only; a `µg` column lists Protein, Fat, Iron; an attribute
  mapped from another column shows disabled with "taken by TEST Protein"; the
  mapped one is selected and shown by name; choosing Fat sends `PUT
  /api/data-sources/testsource/columns/<id>` with `{attribute_id: 3}` once and
  the row then shows Fat; "Not mapped" sends `{attribute_id: null}`; the select
  is disabled while the request is pending (a promise reply); a failing PUT
  (500) shows "Could not save the mapping." and the select shows the old value;
  a 422 `attribute_taken` shows the taken text and re-GETs the source; a withdrawn
  column has an enabled select; the search still narrows the rows without
  disturbing their order or the selects' values; a column with an empty unit
  lists no attribute at all (only Not mapped and Create); with attributes
  failing to load the page shows the load-failed message.
- `DataSourcesCard.test.ts`: "2 of 55 columns mapped" in a row's caption; with 0
  mapped "0 of 3 columns mapped".

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`. Commit: "web: attribute
drop-down per source column, mapped count on the Data sources card".

**Built.** As written, with the differences of interpretations 17 to 19.

### Task 5: Web: Create attribute from a column

**Files:** create `web/src/components/NewAttributeDialog.vue` (+ `.test.ts`),
and, unless the refactor (interpretation 14) was done, `web/src/components/AttributeFields.vue`
and `web/src/attributeFields.ts` (extracted from `web/src/pages/AttributesPage.vue`
first, its tests unchanged); modify `web/src/pages/DataSourcePage.vue`,
`web/src/pages/DataSourcePage.test.ts`, `web/src/i18n/en.json`.

- **`NewAttributeDialog.vue`**: props `modelValue: boolean`, `column: SourceColumn
  | null`; emits `update:modelValue`, `created: [Attribute]`. A `q-dialog` (not
  persistent: Escape or a click outside cancels) with a `q-card`: title "New
  attribute", the shared fields (Name empty and autofocused, Unit via
  `UnitField` offering the column's category only (`[]` plus plain text for a
  column with no category), Decimals "3"), buttons **Cancel** and **Add**. The
  starting unit: `startUnit(column)`: `useUnits().findUnit(column.unit)?.category`
  then `usePreferences().preferences.value?.['unit.' + category]`, else
  `column.unit` (also while the catalogue or preferences have not loaded). The
  form is reset each time the dialog opens. On **Add**: name required
  (`common.nameRequired`), decimals range as C5; unit must be non-empty and
  `convertible(column.unit, unit)` else error "Must convert with {unit}."
  (`dataSource.createUnitMismatch`); then `POST /api/attributes` `{name, unit,
  decimals}`; 201: emit `created` with the answer and close; 409 `name_in_use`
  on the name field (`attributes.nameInUse`); any other failure: "Could not
  save." (`common.saveFailed`) in a `role="alert"` line; **Add** shows loading
  while it runs.
- `DataSourcePage.vue`: `createFor` opens the dialog; on `created`: append the
  attribute to the page's attribute list and `map(column, attribute.id)`; if that
  fails the row shows `dataSource.createdNotMapped` ("The attribute was created
  but could not be mapped.") and the attribute stays in the list. The select goes
  back to its stored value when the dialog is cancelled.
- `en.json`: `dataSource.{newAttribute, add?}` (reuse `common.cancel`; check for
  an existing "Add"-like key before adding), `dataSource.createUnitMismatch`,
  `dataSource.createdNotMapped`.

**Tests (first):**
- `NewAttributeDialog.test.ts`: opens with the name empty and the unit the
  preferred unit of the column's category (column `g` with preference `kg`
  starts `kg`; column `kcal` starts the preferred energy unit; column `dose`
  starts `dose`; column `st` starts `st`); the unit list offers only that
  category; empty name and out-of-range decimals show their errors and send
  nothing; a unit that doesn't convert (typed `kcal` for a `g` column) shows
  "Must convert with g." and sends nothing; a good form POSTs `{name, unit,
  decimals}` and emits `created` with the answer; a 409 shows the name-in-use text
  and stays open; a 500 shows "Could not save." and stays open; opening again
  after a cancel shows a fresh form.
- `DataSourcePage.test.ts`: choosing "Create attribute…" on the `g` column opens
  the dialog; adding "Protein" POSTs the attribute, then PUTs the mapping with
  the new id, and the row shows "Protein"; the new attribute is offered in the
  other columns' lists (taken, for them); cancelling leaves the select as it
  was and sends nothing; a PUT failing after a good POST shows the "created but
  could not be mapped" text and the attribute is listed unmapped.
- If the extraction was done here: `AttributesPage.test.ts` passes unchanged.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`. Commit: "web: Create
attribute from a data source column".

**Built.** As written; the attribute fields were already a component (interpretation 14), so
no extraction. Differences: interpretation 20.

### Task 6: End-to-end step

**Files:** modify `web/e2e/catalog.e2e.ts`.

The step goes **at the end of the flow**, after the plan, clash and fix steps, so
the earlier steps' single-row locators (`.attribute-row`, the delete warning's
exact text) are unaffected, and ends with the state the flow already ends in plus
two mapped columns. D2's e2e step has already opened the source page once (a
colour change); this one does not repeat that.

- Settings, Data sources, **TEST Source**: the **TEST Energy** column's
  Attribute drop-down lists **Energy** (kcal; the attribute made at the start of
  the flow) and not Vitamin D's `µg` attribute; choose **Energy**; reload the
  page, it is still chosen (saved, not just shown). The **TEST Protein** column:
  open its drop-down, **Create attribute…**, the dialog's unit field starts
  `g`, fill Name `Protein`, Decimals `1`, **Add**; the drop-down shows Protein;
  reload, still there. The **TEST Vitamin D** drop-down offers **Protein** shown
  taken ("taken by TEST Protein") and cannot choose it. Back to Settings: the
  card says "2 of 3 columns mapped".
- Attributes: two rows. Open **Energy**, change its unit to `g`: the refusal
  under Unit names TEST Energy and the form stays open; set it back. Open
  **Protein**, **Delete**: the dialog says "Its mapping from 1 source column is
  cleared." and nothing else is removed; **Delete** it; back on the Data source
  page the Protein column is **Not mapped** again and the card says "1 of 3
  columns mapped". Update the flow's header comment.

**Verify (the run is the test):** `cd web && npx vite build`; start the server on
a temp SQLite file in the scratchpad with `DATABASE_URL`, `PASSWORD_HASH`,
`SESSION_KEY` and `DATA_SOURCES_DIR=$PWD/tests/data/data_sources` (D2's README
paragraph); `E2E_PASSWORD=... E2E_BASE_URL=http://localhost:8000 npm run e2e --
--trace off`; kill the server. Commit: "e2e: column mapping step".

**Built.** As written, with two differences: the flow has no `µg` attribute, so the
Energy column is simply offered Energy only; and the unit list is closed with Escape
before Done. The step caught a real bug, the column rows overflowing a phone's width
(the select pushed the row wider), fixed by letting the row wrap. Checked: `npx vite
build`, a server on a temp SQLite file with `DATA_SOURCES_DIR`, the flow green.

### Task 7: Docs

**Files:** `README.md`, the master plan, the data source spec, the units spec, the
wireframes spec, this plan.

- `README.md` status paragraph: S2 now maps source columns to attributes (only
  convertible ones, one column per attribute, Create attribute), deleting an
  attribute clears its mappings, S1's card counts mapped columns.
- Master plan: after the D2 line add "D3 done: see
  `2026-11-08-slice-d3-column-mapping.md`."
- Data source spec: "Data model", `source_columns.mapped attribute` is the column
  `attribute_id` (`ON DELETE SET NULL`); "Settings and the data source page":
  taken attributes are shown disabled with the holder's column, a withdrawn column's
  mapping can still be changed, a new data file that makes a mapping stop
  converting clears it (interpretation 6); "API": the `PUT` body, answer and its
  404/422s, `mapped_count` on the summary, `attribute_id` on a column; "Errors":
  `unit_mismatch` and `attribute_taken` on the field `attribute_id`, and `unit_mismatch`
  also from an attribute's unit change that would break a mapping.
- Units spec, "Changing a unit": one sentence, an attribute whose unit change
  would stop a mapped data source column converting is refused (decision 7 of the
  data source spec), with the facts of the refusal.
- Wireframes spec: C5's delete warning counts mapped source columns and its unit
  refusal can name a column; S1's card line with mapped counts; S2: the Attribute
  drop-down and the **Create attribute** dialog (replace "read-only until D3").
- This plan: Status "Built"; under each task add how it was checked and the
  differences from the text, as earlier slice plans do.

**Verify:** the full checks (both suites, lint, typecheck) and the e2e run once more.
Commit: "Docs: slice D3 built, README, data source, units and wireframes specs".

**Built.** As written. Checked: root suite on SQLite and `tests/server` on Postgres
(927 passed), lint, typecheck, `npm test`, e2e.

## Done when

On a source's page every column can be mapped to a convertible attribute, left
unmapped, or given a new attribute made on the spot; an attribute can feed only
one column per source and an attribute that doesn't convert is not offered and
is refused by the server; deleting an attribute clears its mappings after a
warning that counts them; changing an attribute's unit within its category keeps
its mappings and values converting, while a change that would break a mapping
is refused; a new data file can't leave a mapping that doesn't convert; S1 shows
how many columns are mapped. Both test suites, lint, typecheck, the migration
test and the end-to-end flow are green; no real data file and no network were
needed.
