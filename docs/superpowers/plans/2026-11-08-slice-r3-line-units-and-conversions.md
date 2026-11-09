# Slice R3 — Line Units and Conversions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** A recipe line has a unit. On C2 each line gets a unit picker (the
ingredient's own unit, the catalogue units that convert to it, the
ingredient's stored conversions with ✨ for AI ones, and **New unit…**), so
"2 dl crème fraîche" or "3 msk olive oil" can be typed as written. On C4 a
saved ingredient gets a **Conversions** card ("1 dl = 100 g ✨", add, edit,
delete). The server converts every line to the ingredient's own unit when a
plan is made (by the line's own unit, a stored conversion, or a catalogue step,
directly or to a unit that has a conversion), and saving a recipe refuses a
line that does not convert. U3's ingredient unit change grows to cover this:
changing oats from g to kg converts the lines in the ingredient's own unit and
every stored conversion's factor, leaves lines in other units as written, and
refuses a change to another category (or to or from free text) while a line in
another unit or a stored conversion exists.

**Architecture:** One new pure module, `server/line_units.py` (no database, no
FastAPI), is the only place the routing rule lives: `route(line_unit,
own_unit, conversions) -> Route | None` (exact `Fraction` factor, and which
stored conversion it went through, if any) and `is_own(line_unit, own_unit)`.
It builds on `units.ratio` and `units.parse`; no second unit table.
`translate.recipe` and `api/recipes._total` both turn a line into an exact
amount in the ingredient's own unit through one helper
(`translate.own_unit_amount(item)`), so the planner, the totals and the editor
agree; the editor mirrors the rule once in `web/src/lineUnits.ts`, tested
against the same cases. One Alembic migration adds `recipe_items.unit` and the
`ingredient_conversions` table. Conversions get their own small router
(`server/api/conversions.py`, add / edit / delete under
`/api/ingredients/{id}/conversions`), and every ingredient answer carries its
`conversions`, each with the number of recipes using it. `server/unit_change.py`
gets two converters for the ingredient (`recipe_amounts` narrowed to lines in
the own unit, and a new `conversions`) and one new hook on `Converter`
(`blocks`), for the two refusals that are not about a number. The app gets a
`LineUnitPicker` for C2, one `ConversionDialog` shared by C2's **New unit…**
and C4's add/edit, and a Conversions card on C4.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, `Fraction`/`Decimal`; Vue 3,
Quasar, vue-i18n, Vitest, Playwright.

**Specs:** the import spec
[`2026-11-07-recipe-import-design.md`](../specs/2026-11-07-recipe-import-design.md)
(decisions 7 and 8; "Data model" `recipe_items.unit` and
`ingredient_conversions`; "Built-in unit steps" as replaced by the master
plan's overlap 2; "Conversion when a plan is made"; "C2 for all recipes", the
unit picker; "C4 · Edit ingredient: Conversions"; "Errors", on save); the units
spec [`2026-11-03-units-design.md`](../specs/2026-11-03-units-design.md)
("The catalogue", "Changing a unit"); the master plan
[`2026-11-08-units-sources-import-slices.md`](2026-11-08-units-sources-import-slices.md)
(R3's entry, "Unit conversion grows slice by slice", and "Overlaps settled
here", points 1 to 3); the GUI wireframes C2 and C4
([`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md)).
Interfaces of earlier slices:
[`2026-11-08-slice-u3-unit-change-converts.md`](2026-11-08-slice-u3-unit-change-converts.md)
(built), [`2026-11-08-slice-r2-servings-sections-instructions.md`](2026-11-08-slice-r2-servings-sections-instructions.md)
(planned; built before this slice),
[`2026-11-08-slice-d4-add-from-data-source.md`](2026-11-08-slice-d4-add-from-data-source.md)
(also extends `unit_change`). Not in this slice: anything with AI (R4's
factor suggestions, the review states, `new_conversions` on the recipe save),
the import page.

**Status:** Built, and reviewed task by task, on branch
claude/implement-remaining-slices-qwrp83.

## Global Constraints

- `meal_planner/` is not changed.
- One migration (Task 2). Its number is the next free one **at build time**:
  D2 shipped `0010`, D3 `0011`, D4 `0012`, D5/D6 take the next ones, and R2's
  planned `0010` was to be renumbered after them; R3 comes after R2. Run
  `alembic heads` (or list `server/migrations/versions`) first and set
  `down_revision` to the real head, which must be R2's migration; if R2 is not
  built, stop: this slice needs R2. The migration test
  (`test_migrations_build_the_tables_the_models_describe`) stays green and gets
  a data test. It runs on SQLite and Postgres (CI runs both): no
  `ALTER ... DROP/ALTER COLUMN`; `add_column` of a not-null column with a
  `server_default` is fine on both.
- All GUI text goes through vue-i18n, English file only
  (`web/src/i18n/en.json`).
- After each task that changes the API (Tasks 3 and 4): `npm run gen:api` in
  `web/` (regenerates `web/openapi.json` and `web/src/api/schema.ts`;
  `web/src/test-units.json` must come out unchanged), then fix the factories in
  `web/src/test-data.ts` so `npm run typecheck` stays green.
- The Playwright flow gets a step (Task 8).
- No test calls the internet or an AI service. `source` `ai` only ever appears
  in tests (rows made through the engine); no code in this slice creates one.
- Checks before each commit: `python3 -m pytest -q` at the root; `npm run lint`,
  `npm run typecheck`, `npm test` in `web/`. On the last server task also
  `TEST_DATABASE_URL="postgresql+psycopg://postgres@localhost:5433/planner_test" python3 -m pytest -q tests/server`
  (not at the same time as another run; start Postgres as the common context says
  if it is down).
- **Built after D3-D6 and R2. This plan was written when none of them was built
  except U3 (and D1, D2).** It names functions, tests, i18n keys and files by
  their planned names, never line numbers. **Before each task, re-read the
  built code it touches** (`server/unit_change.py`, `server/models.py`,
  `server/api/recipes.py`, `server/api/ingredients.py`, `server/translate.py`,
  `server/queries.py`, `tests/server/conftest.py`, the web files named in the
  task, `web/src/test-app.ts`, `web/src/test-data.ts`, the e2e flow's last steps
  and the state they leave). Where this plan and the built code disagree on a
  name, the code wins; on a behaviour, the plan wins. In particular:
  - R2 renames a recipe's `items` to `sections[].items` (models:
    `Recipe.sections`, `RecipeSection`, `Recipe.lines` read-only property, one
    `RecipeItem` per line with its own `id`, `section_id`, `position`,
    `original_text`; web: `DraftSection`, `DraftLine {key, ingredientId, amount,
    originalText}`, `RecipeSection.vue`, `portionTotals(items, attributes,
    servings)`). This plan says "line" for a `RecipeItem` and `row.lines` for a
    recipe's lines in display order. R2 also writes a private helper in
    `unit_change.py` (`_recipe_lines(ingredient_id)` returning the select, joined
    through the section to the recipe); this slice builds on it.
  - D4 adds `ingredients.source_food_id`, `unit_not_for_source` (a linked
    ingredient may change only to another mass unit), `source` on ingredient
    answers and `selectinload`s in `list_ingredients`; it also adds a
    `source_values` converter to the attribute's list. None of this changes
    here; keep D4's checks and add this slice's beside them.
  - D2 already added `models.__all__` entries, `Tag.source_id` and friends;
    just add the new names.

## Interpretations made in this plan

1. **The routing rule** (`line_units.route`), the import spec's "Conversion
   when a plan is made" with the master plan's catalogue steps. For a line
   `unit` of an ingredient with own unit `own` and stored conversions (unit,
   factor) in id order, the first that applies:
   1. `unit` is empty or the same unit as `own` (`units.ratio(unit, own) == 1`,
      so "gram" is `g`, "Pcs" is `st`, a free text compares ignoring case): factor 1,
      `via` none.
   2. A stored conversion whose unit is the same unit as `unit`: its factor,
      `via` that conversion ("a stored conversion for a unit wins over a
      built-in step").
   3. A catalogue step straight to `own` (`units.ratio(unit, own)` is not
      None): that ratio, `via` none.
   4. A catalogue step to the unit of a stored conversion (the first in id
      order whose unit has a `units.ratio` from `unit`): ratio times that
      conversion's factor, `via` that conversion.
   5. Otherwise None: the line does not convert.
   The factor is the exact `Fraction` that multiplies the line's amount to give
   the amount in `own`. A conversion's factor means "how many of `own` one of its
   unit makes" (import spec), so "1 dl = 40 g" is (`dl`, 40) on a g ingredient.
   An energy unit never routes (step 3 and 4 fail as the energy category never
   equals an ingredient's, and the API refuses it earlier, see 4).
2. **Conversions can be for any unit but the ingredient's own.** A conversion's
   unit is a catalogue unit of any category except energy (volume for a g
   ingredient is the usual case; mass for a g ingredient is allowed, as the
   spec lets a stored conversion win over a step) or free text ("pinch",
   "klyfta"). It is stored as the catalogue spelling (`units.normalise`), free
   text as typed (trimmed, inner spaces as typed). Two conversions of one
   ingredient may not be for the same unit (`units.ratio(a, b) == 1`, so "Pinch"
   and "pinch" clash and `dl` and "DL" clash); the database also has a
   unique constraint on (ingredient, unit). The factor is above 0 with the
   usual `Number` limits (15 digits, 6 decimals).
3. **A line stores its unit in one canonical form.** On save: a unit equal to
   the ingredient's own (any spelling) is stored as `""`; one equal to a stored
   conversion's unit is stored in that conversion's spelling; any other unit
   that routes is stored as `units.normalise` gives it. A line whose unit does
   not route is refused, 422 `unit_not_convertible` on
   `sections.{i}.items.{j}.unit` (message "2 dl of Oats doesn't convert to g:
   add a conversion for dl" in plain words, the app shows its own text), and an
   energy unit is refused 422 `unit_not_for_ingredient` on the same field, as
   for an ingredient. `unit` is optional in the request (default `""`), at most
   20 characters, trimmed; every answer carries it. `original_text` is untouched.
4. **Conversions have their own endpoints, and are not part of the ingredient's
   `PUT`.** C4's Conversions card and C2's **New unit…** act at once, as a delete
   with a 409 must, and a new unit made on C2 should be there for the next
   recipe even if this one is abandoned (it is a fact about the ingredient). So:
   `POST /api/ingredients/{id}/conversions` `{unit, factor}` (201, the new
   conversion; `source` is always `user` from here; R4's save creates `ai`
   ones), `PUT /api/ingredients/{id}/conversions/{conversion_id}` `{unit,
   factor}`, `DELETE ...` (204). Refusals: 404 for an unknown ingredient or
   conversion (or one of another ingredient); 422 on `unit`:
   `unit_not_for_ingredient` (energy), `unit_is_own_unit` (the ingredient's own
   unit), `duplicate`; 422 on `factor`: the usual number errors; 409
   `conversion_in_use` for a delete of a used conversion, and for an edit that
   changes the unit of a used conversion (changing only its factor is the point
   of the feature: "correcting a factor fixes every recipe that uses it"). An
   unsaved (new) ingredient has no Conversions card; it says to save first.
5. **"Used" means routed through.** A conversion is used by a line when
   `route(...).via` is that conversion, so "1 US cup" of an ingredient whose only
   conversion is `dl` uses the `dl` conversion. `Conversion.recipe_count` counts
   distinct recipes with at least one such line (the same "recipes, not lines"
   as the ingredient's `recipe_count`). Delete is refused while it is above 0.
   It is computed for every conversion in every ingredient answer (one pass over
   all lines); the data is small.
6. **Editing a conversion makes it `user`** only when its unit (as a
   `units.ratio(a, b) != 1` comparison) or its factor actually changes; a save
   with the same values keeps `ai`. (The review's "Accept" is R4.)
7. **Ingredient unit change** (units spec, master plan overlap 1), with the
   converters in this order: `basis`, `recipe_amounts`, `conversions`.
   - A line is in the **own unit** when `line_units.is_own(line.unit,
     old_unit)`; only these convert: amount × the ratio, and the line's unit is
     written `""` in the same step (so a leftover line written "kg" on a kg
     ingredient converts as an own line when the ingredient goes to g).
     `recipe_amounts` counts these lines. Lines in other units are left as
     written.
   - Every stored conversion's factor is multiplied by the same ratio
     (`Number.kind` `conversion`, `name` the conversion's unit, `field`
     `factor`, `positive=True`; rounding and refusals as for other
     ingredient numbers: half away from zero to 6 decimals,
     `conversion_rounds_to_zero`, `conversion_too_large`). "1 dl = 40 g" to kg is
     "1 dl = 0.04 kg".
   - `kind` `convert` and a stored conversion for a unit that is the **new**
     unit is refused, 422 `conversion_for_new_unit` (it would become a conversion
     of the ingredient's own unit): "Delete the conversion for kg first."
   - `kind` `no_convert` (another category, or to or from free text) is refused,
     422 `unit_has_dependents`, while **any stored conversion exists or any line
     has a non-empty unit** (a line in a unit other than "own", or, rarely, a
     leftover own-unit line written out; stricter than needed, and the message
     says how many of each so the user can fix them). Lines with an empty unit
     (the own unit) never block it: their numbers keep, as U3 already does.
   - `same` and spelling changes touch nothing.
   - The two refusals carry counts (`conversions`, `lines`) so the app can say
     "Oats has 2 conversions and 3 recipe lines in other units".
   - `ingredient_converters` takes the new unit as a third argument (the
     routes pass `body.unit`), because the checks need it; it captures the old
     unit when built, before the save changes the row.
8. **A new `Converter.blocks` hook.** `Converter(key, numbers, blocks=None)`,
   `blocks(db, kind) -> Refusal | None`. `plan()` calls it for every converter
   whose kind is not `same`, before that converter's numbers, and the first
   refusal found wins as before. Only the `conversions` converter has one
   (interpretation 7). The Number machinery is unchanged.
9. **A line that cannot convert at plan time is a bug, not a user error.**
   `translate.recipe` raises `translate.UnconvertibleLine` (a `ValueError`
   naming ingredient and unit). Saving, conversion edits and unit changes keep it
   from happening; a test pins the error.
10. **Exactness.** `own_unit_amount(item)` is `Fraction(amount) * route.factor`.
    `translate.recipe` sums these per ingredient as `Fraction`, divides once by
    `servings` (R2) and turns the result into a `Decimal` as
    `Decimal(num) / Decimal(den)` under the default 28-digit context, so a recipe
    with only own-unit lines gives the library the same numbers as before this
    slice (a test). `api/recipes._total` sums the same fractions. The editor
    does the same with bigint fractions (`web/src/totals.ts`).
11. **The picker's options.** Per line, for an ingredient: **Own unit** (value
    `""`, shown as the ingredient's unit), **Other units**: every offered
    catalogue unit of the mass and volume categories (and `st`) for which
    `lineFactor` is not null, except the own unit and units that have a stored
    conversion, in the catalogue's offered order, then **Conversions**: each
    stored conversion with ✨ for `ai` (tooltip "Suggested by AI, not checked by
    you"), then **New unit…**. For a g ingredient with no conversion this is
    g, then oz, lb, µg ... kg (the mass units); with a `dl` conversion it also
    lists the volume units, all of which convert through `dl`. A line whose unit
    is not among these (stale data) still shows its text, and is marked as not
    converting.
12. **The editor's totals mirror the server** with a unit-aware
    `portionTotals(items, attributes, servings, factorOf)`; a line that does not
    convert counts 0 and is marked on its row (the save is refused until fixed).
    `web/src/lineUnits.ts` has `lineFactor(units, ingredient, unit)` returning a
    bigint fraction or null, `conversionsOf` data from the ingredient answer, and
    its tests use the same cases as `tests/server/test_line_units.py`
    (each file spells the cases out; keep them identical).
13. **`GET /api/ingredients` answers `conversions`** (list and single, create
    and update too): `[{id, unit, factor, source, recipe_count}]` in id order. C2
    loads ingredients already, so the picker needs no extra call. A conversion
    added or edited through the dialog is patched into the page's copy.
14. **Deleting an ingredient** removes its (unused) conversions with it
    (`ondelete CASCADE` and the relationship). C4's delete confirmation names
    them: "This also removes its 2 conversions." Nothing else warns today.
15. **Downgrade.** The migration's downgrade drops the table and the column, and
    is refused (a `RuntimeError` naming the count) while any line has a non-empty
    unit, because the amounts of those lines mean nothing in the ingredient's
    unit. It is a development convenience, as for R2.
16. **Not in this slice, by the master plan:** AI-suggested factors, `ai`
    conversions being created, the review states, and the recipe save taking
    `new_conversions`. A recipe save in R3 never creates a conversion.

17. **Built after U3, D1-D6 and R2; built code wins over the names in this
    text.** The migration is `0015` (`down_revision = "0014"`, R2's). It names
    the foreign key, the primary key and the unique constraint of
    `ingredient_conversions` explicitly, as `0014` does, and drops the column
    with `batch_alter_table` for SQLite. `ingredient_converters(ingredient,
    basis, new_unit)` builds on R2's private `_recipe_lines(ingredient_id)`.
18. **Commits.** Tasks 2, 3 and 4 are one commit (every commit passes its
    checks, and the API tests need the model and the migration); the server
    commit holds `web/openapi.json` (a server test compares it) and Task 5's
    commit holds the regenerated `web/src/api/schema.ts` with the code that
    uses it, as R2 did.
19. **Two numbers in the plan's test cases were wrong.** "1 msk" in dl is 0.15,
    so a g ingredient with `dl = 40` gives 6 g per msk, not 240; and 1 US cup
    is 2.365882365 dl, so through `dl = 40` it is 94.6352946 g (the plan's
    worked-by-hand literal had a stray factor of 10). The tests use the right
    values.
20. **`Conversion.unit` is the catalogue spelling**, so "kilogram" (which the
    catalogue does not know: free text) is stored as typed, and a conversion
    for "KG" is stored `kg`; the refusal `conversion_for_new_unit` therefore
    compares through `units.ratio`, not by text. `refusal.name` is the
    ingredient's and `refusal.unit` the conversion's for that refusal, and
    `unit_has_dependents` carries `conversions` and `lines`.
21. **The web draft marks a line that does not convert with a flag**, not a
    message: `unitErrors` is `{lineKey: true}` (the server's
    `unit_not_convertible` and `unit_not_for_ingredient` map to it as well), and
    the row writes "{unit} of {name} doesn't convert..." from the line, since
    `serverErrors` has no names. `checkRecipe` takes a `converts(line)`
    callback (the page's `lineFactor`) instead of the catalogue.
22. **D4 did not replace the hard-coded list of kinds** in `refusalText`, so
    `conversion` was added to it. `Translate` in `useUnitChange.ts` takes the
    plural count as a third argument.
23. **The picker offers a stored conversion's unit only under Conversions**
    (`dl`, with "= 40 g"), so the e2e step chooses the option `/^dl/`, not `dl
    (decilitre)`. The picker's `q-select` has no `use-input`; its accessible name
    is on the combobox input, "Unit of {name}". Card buttons carry an
    `aria-label` naming the unit ("Edit the conversion for dl").
24. **`fractions.ts`** (exact bigint fractions and `same`) holds what
    `totals.ts` had and `units.ratio` and `lineUnits.ts` need, which avoids a
    cycle; `Amount` in `totals.ts` has an optional `unit`.
25. **Not in the plan, kept small:** the ingredient delete confirmation says
    "This also removes its N conversions." only when there are conversions
    (delete is off while a recipe uses the ingredient, so they are unused).

26. **A stale line degrades, not 500s (review I1).** `translate.recipe` still
    raises `UnconvertibleLine` (a bug if it ever does), but nothing reaches it
    with a stale recipe: `translate.converts(recipe)` says whether every line
    converts; Make plan (`api/solve._read`) and the recipe count leave such
    recipes out (all stale: `no_usable_recipes`), and a recipe answer carries
    `unconvertible: bool` and counts a stale line as 0 in its totals, so the
    list and the editor still open and the user can fix the unit (the picker
    marks the line) and save. `_total` works out each line's amount once
    (`translate.line_amount`, None for a stale one). The conversion delete's
    409 is now the same `conversion_in_use` field-error list as the edit's
    (`loc` `["path", "conversion_id"]`). With no catalogue loaded the editor
    skips its own convert check and the server decides.

## Tasks

### Task 1: Server: `line_units.py`, the routing rule

**Files:** create `server/line_units.py`, `tests/server/test_line_units.py`.

**Build:**

- `Route` (frozen dataclass: `factor: Fraction`, `via: str | None`, the stored
  conversion's unit exactly as stored), `route(line_unit: str, own_unit: str,
  conversions: Sequence[tuple[str, Decimal]]) -> Route | None` per
  interpretation 1, and `is_own(line_unit, own_unit) -> bool` (empty or
  `units.ratio(line_unit, own_unit) == 1`). `conversions` is in id order; the
  first match in that order wins in rules 2 and 4. Pure: imports `units`,
  `fractions`, `decimal` only. Docstring: the import spec's rule, and that the
  unit catalogue stays the only unit table.
- `units.py` is not changed. If `units.ratio` cannot answer "same free text"
  for two spellings that differ only by case or inner spaces, that is a bug to
  fix there (it uses `_clean` and lower case already).

**Tests (write first), `test_line_units.py`:** `route(unit, own, conversions)`,
asserting `(factor, via)`; each of these, with a one-line comment of its rule:
- own: `""`, `"g"`, `"gram"` for `g`; `"stycken"` for `st`; `"Portion"` for
  `portion` (factor 1, via None);
- stored: `("dl", 40)` on g: `"DL"` is (40, "dl") (the catalogue reads case-insensitively);
  free text `("pinch", 0.3)`: `"Pinch"` is (3/10, "pinch"); `("g", 0.01)` on `st`
  ("1 g = 0.01 piece"): `"g"` is (1/100, "g");
- stored wins over a step: g ingredient, conversions `("dl", 40)` and
  `("msk", 10)`: `"msk"` is (10, "msk"), not 15 ml of dl;
- step to own: `"oz"` on g is (28.349523125, None); `"kg"` on g is (1000,
  None); `"msk"` on dl is (3/20 as a Fraction: 15 ml in dl = 0.15)... compute
  with `Fraction(15, 100)`; a volume line `"tsk"` on l;
- step through a conversion: `"msk"` on g with `("dl", 40)` is 40 times
  `units.ratio("msk", "dl")` (= 6) via "dl"; `"US cup"` is `units.ratio("US cup", "dl") * 40`
  exactly (build the expected value from `units.ratio`, and assert the literal
  `Fraction(2365882365, 10**9) * 10 * 40` worked by hand);
- first conversion in order wins in rule 4: conversions `("dl", 40)`,
  `("msk", 6)` on a g ingredient, `"tsk"` goes through `dl`;
- does not convert: `"dl"` on g with no conversion; `"g"` on dl with no
  conversion; `"cup"` (free text) on g; `"kcal"` on g; `"pinch"` on `st` with no
  conversion;
- `is_own` for the same inputs as the own cases and False for `"kg"` on g;
- free text own units match ignoring case and trimming ("Portion", " portion").
Verify: `python3 -m pytest tests/server/test_line_units.py -q`.

**Commit:** "server: the rule that turns a recipe line's unit into the ingredient's".

**Checked:** `tests/server/test_line_units.py` (27 cases, each rule and the
failure cases). Differences: interpretation 19.

### Task 2: Server: models, migration, translation

**Files:** modify `server/models.py`, `server/queries.py`, `server/translate.py`;
create `server/migrations/versions/<next>_ingredient_conversions.py`; modify
`tests/server/test_translate.py`, `tests/server/test_migrations.py`.

**Build:**

- `models.py`: `RecipeItem.unit: Mapped[str] = mapped_column(String(UNIT_LENGTH))`
  (comment: "empty is the ingredient's own unit; otherwise any unit that
  converts to it, see line_units"). New `CONVERSION_SOURCE_LENGTH = 4` ("ai" or
  "user"). New `IngredientConversion(id, ingredient_id FK ondelete CASCADE,
  unit String(UNIT_LENGTH), factor EXACT_NUMBER, source String(4),
  UniqueConstraint("ingredient_id", "unit"))`; `Ingredient.conversions:
  Mapped[list["IngredientConversion"]]` (cascade `all, delete-orphan`,
  `passive_deletes=True`, `order_by="IngredientConversion.id"`). Add it to
  `__all__`. Docstring of `RecipeItem`: amounts are for the whole recipe, in
  `unit` (R2's wording plus this).
- `queries.recipes()`: the ingredient's loader chain also loads
  `Ingredient.conversions`.
- Migration (revision = next free, down = R2's): `op.add_column("recipe_items",
  sa.Column("unit", sa.String(20), nullable=False, server_default=""))`;
  `op.create_table("ingredient_conversions", ...)` with explicit constraint
  names for the primary key, the foreign key and the unique constraint
  (`uq_ingredient_conversions_ingredient_id_unit`) so the models' metadata
  matches what `compare_metadata` sees; check the names against what the naming
  convention of `db.Base` gives and against the earlier migrations' habit.
  Downgrade per interpretation 15, in Python over `op.get_bind()` with
  `sa.text`; then `op.drop_table`, `op.drop_column` (use `batch_alter_table` for
  the column drop if the other migrations do for SQLite).
- `translate.py`: `UnconvertibleLine(ValueError)`;
  `own_unit_amount(item: models.RecipeItem) -> Fraction`: `line_units.route(
  item.unit, item.ingredient.unit, [(c.unit, c.factor) for c in
  item.ingredient.conversions])`, raising `UnconvertibleLine(ingredient name,
  unit)` on None. `recipe(row)`: per ingredient (grouped by the ingredient
  object, in the order of its first line, as R2 wrote) sum
  `own_unit_amount(line)` as `Fraction`, divide by `Fraction(row.servings)`,
  convert to `Decimal` per interpretation 10. Docstring: "amounts are per
  portion, in each ingredient's unit".

**Tests (write first):**

- `test_translate.py`: the builders gain `unit=""` on a line (and an
  ingredient with `conversions=[models.IngredientConversion(unit="dl",
  factor=Decimal("40"), source="user")]` where needed; unsaved rows work). Keep
  every existing assertion. New:
  `test_a_line_in_a_stored_conversions_unit_is_converted` (2.5 dl, 40 g per dl,
  gives 100),
  `test_a_line_in_a_catalogue_unit_is_converted_to_the_ingredients_unit` (2 oz of
  g gives 56.69904625; 200 ml of dl gives 2),
  `test_a_catalogue_step_can_go_through_a_conversion` (1 US cup of an ingredient
  with dl = 40 g gives the exact product to within 1e-20),
  `test_a_stored_conversion_beats_a_catalogue_step`,
  `test_lines_in_different_units_of_one_ingredient_are_summed_in_its_unit` (60 g
  on one line, 1 dl on another, one `IngredientAmount` of 100),
  `test_servings_divide_after_the_conversion` (servings 4: 25),
  `test_only_own_unit_lines_give_the_same_numbers_as_before` (the existing
  porridge helper, equality with the hand-built library `Recipe`),
  `test_an_unconvertible_line_raises_naming_ingredient_and_unit`.
- `test_migrations.py`: `test_lines_from_before_have_the_own_unit_and_no_conversions`:
  upgrade to R2's revision (the one before this migration, read from the
  migration module's `down_revision`, not hard-coded), insert by SQL an
  ingredient and a recipe with one line, upgrade to head, assert the line's `unit`
  is `""` and `ingredient_conversions` is empty, and `translate.recipe` still
  gives the same library `Recipe` through `queries.recipes()`;
  `test_the_downgrade_is_refused_while_a_line_has_a_unit` (set `unit = 'dl'` by
  SQL after the upgrade, `command.downgrade(cfg, down_revision)` raises, and the
  data is unchanged); `test_the_downgrade_drops_the_conversions_and_the_unit_column`
  (no lines in other units: passes, the table and column are gone).

**Verify:** `python3 -m pytest tests/server/test_translate.py tests/server/test_migrations.py -q`;
the migration test on Postgres if `TEST_DATABASE_URL` is available. Other server
tests may be red only where a body or builder needs the new field; fix those in
this task if they are builders (default `unit=""`), leave API tests for Task 3.

**Commit:** "server: recipe line units and ingredient conversions; migration <n>".

**Checked:** `test_translate.py` and `test_migrations.py` on SQLite and
Postgres; a manual up, refused down (a line in dl), down and up again on a
Postgres database with a recipe in it. Differences: interpretations 17 and 18;
committed with Tasks 3 and 4.

### Task 3: Server: API for line units and conversions

**Files:** create `server/api/conversions.py`, `server/conversions.py`
(db-aware helpers, no FastAPI), `tests/server/test_conversions.py`; modify
`server/api/__init__.py`, `server/api/ingredients.py`, `server/api/recipes.py`,
`tests/server/conftest.py`, `tests/server/test_recipes.py`,
`tests/server/test_ingredients.py`, `tests/server/test_delete_cascades.py`.

**Build:**

- `server/conversions.py`: `usage(db) -> dict[int, int]`, conversion id to the
  number of distinct recipes with a line routed through it (interpretation 5),
  from one query of all lines with their recipe, section and ingredient
  conversions (use `queries.recipes()` or a lighter select over
  `RecipeItem`/`RecipeSection`; build the `(unit, factor)` lists once per
  ingredient). `canonical_unit(unit, ingredient) -> str` (interpretation 3's
  storage form: `""`, the matching conversion's spelling, or `units.normalise`).
- `api/conversions.py`: models `ConversionFields {unit: trimmed 1 to 20
  characters, factor: Number > 0}` and `Conversion {id, unit, factor (string
  as typed), source: Literal["ai", "user"], recipe_count: int}`; the three
  routes of interpretation 4 under `prefix="/ingredients"`, with their
  `responses`. Checks in a `_check(ingredient, fields, ignore_id)`: energy unit,
  own unit (`units.ratio(unit, ingredient.unit) == 1`), duplicate among the
  ingredient's other conversions, collected into one 422 (`References`-style
  `FieldError`s on `unit`). Edit keeps `source` unless unit or factor changed
  (interpretation 6). Included in `api/__init__.py` after `ingredients`. A
  `used` check for delete and for a unit-changing edit answers 409 with detail
  "Recipes use this conversion" (the same shape as the ingredient's 409) and, for
  the structured form the app can map, `{"type": "conversion_in_use"}` in a
  `FieldErrors` body on `unit` for the edit; the delete answers the plain
  `detail` string as `delete_ingredient` does.
- `api/ingredients.py`: `Ingredient` gains `conversions: list[Conversion]`
  (import the model from `conversions.py` of the api package); `_response`
  takes the usage dict next to the recipe counts; the list and get routes
  compute `usage(db)` once; create and update answer `conversions` too (a
  created ingredient has none). `list_ingredients` loads conversions with
  `selectinload` beside D4's loaders. Nothing about `_fill` changes.
- `api/recipes.py`: the line model gains `unit` (interpretation 3; the field
  is `str` trimmed, max `models.UNIT_LENGTH`, default `""`); the response lines
  carry it. In `_fill`, once the ingredients are loaded (`refs.rows` gives them by
  id), check each line: energy, then route (`line_units.route` with the
  ingredient's conversions) and add `FieldError`s `unit_not_for_ingredient` /
  `unit_not_convertible` at `["sections", i, "items", j, "unit"]` to the same
  422 as the other reference errors; store `conversions.canonical_unit(...)`.
  `_total` multiplies each amount by `translate.own_unit_amount(line)` instead of
  `item.amount` (the value and basis arithmetic is unchanged), so totals, the
  planner and the editor agree.
- `tests/server/conftest.py`: `recipe_body`'s lines carry `"unit": ""` (or leave
  them out: the field defaults) and a `lines=` option is not needed; add
  `Catalog.conversion(ingredient_id, unit, factor) -> int` (POSTs the new
  endpoint, answers the id). `Catalog.ingredient` stays.

**Tests (write first).** `test_conversions.py` (API):
- create: 201 with `{id, unit, factor, source: "user", recipe_count: 0}`; unit
  stored in catalogue spelling ("tbsp" is `msk`, "DL" is `dl`); free text as typed
  ("pinch"); factor read back as typed ("0.040" is "0.04"); listed on the
  ingredient (`conversions` in id order) and on `GET /api/ingredients/{id}`;
- refusals (422, `type` and `loc` checked): energy unit; the ingredient's own
  unit in another spelling ("gram" on a g ingredient); a second conversion for
  the same unit ("dl" then "DL") and free text differing
  by case; an empty unit; a unit over 20 characters; factor 0, -1, "abc", and
  more than 6 decimals; a missing field; several errors at once in one 422;
- 404: unknown ingredient on each route; a conversion id of another ingredient
  on put and delete; 401 without a session on each route;
- edit: changing the factor of a `user` one stays `user`; of an `ai` one (a row
  made through the engine with `source="ai"`) becomes `user`; saving the same
  unit and factor keeps `ai`; a spelling-only change of unit keeps `ai`; the
  own-unit and duplicate refusals apply with the conversion itself excluded
  (editing without changing the unit is not a duplicate);
- used: with a recipe line `1 dl` (made through the recipes API, see below),
  `recipe_count` is 1 in the ingredient answer; delete answers 409 and the
  conversion is still there; editing its factor answers 200 and the recipe's totals
  change; editing its unit answers 409 `conversion_in_use` and nothing changes; two
  lines in one recipe count once; a line `1 US cup` routed through the `dl`
  conversion counts as use of it; after the line is removed the conversion deletes
  with 204;
- an ingredient delete with unused conversions removes them (`test_delete_cascades.py`;
  count through a session) and a used ingredient is still 409.

`test_recipes.py`:
- `test_a_line_in_another_unit_is_saved_and_read_back_canonical` (own spelling
  "gram" is stored `""`; "tbsp" with a `msk` conversion is stored `msk`; unit
  "DL" with a `dl` conversion is stored `dl`; a catalogue step ("oz") is stored `oz`);
- `test_totals_convert_lines_to_the_ingredients_unit` (60 g and 1 dl of 40 g per
  dl: totals as for 100 g; with servings 2 half; the same ingredient on lines in
  two units is summed);
- `test_a_solve_uses_the_converted_amounts` (a recipe of 2 dl of milk-like
  ingredient measured in g with `dl = 100`, fixed portion 1 in a one-meal plan:
  the planned meal item reads 200 g, through the existing solve helpers, as the
  other solve test does);
- refusals (422): a line in a unit that does not convert
  (`unit_not_convertible` at `body.sections.0.items.1.unit`, the position named);
  an energy unit (`unit_not_for_ingredient`); a unit over 20 characters; both
  errors with a bad amount in one 422; nothing is saved on a refusal (recipe
  count unchanged);
- `test_a_recipe_without_units_in_the_body_still_saves` (default `""`);
- `test_the_same_line_unit_survives_a_second_save`.
- Existing tests updated only for the new field; none weakened.

**Then:** `cd web && npm run gen:api`; add `conversions: []` to the ingredient
factory and `unit: ''` to the line factory/helper in `web/src/test-data.ts`.

**Verify:** `python3 -m pytest -q`; `git diff --stat` shows `openapi.json` and
`schema.ts` changed and `test-units.json` not. `npm run typecheck` may be red
until Task 5 if the web code reads the changed types; fix only factories here.

**Commit:** "server: recipe lines have units, ingredients have conversions".

**Checked:** the whole root suite on SQLite and `tests/server` on Postgres;
`test_conversions.py` (31 cases), the new `test_recipes.py` tests, the cascade
tests. `web/src/test-units.json` came out unchanged. Differences:
interpretations 18 and 20.

### Task 4: Server: the ingredient unit change converts lines and conversions

**Files:** modify `server/unit_change.py`, `server/api/unit_changes.py`,
`server/api/ingredients.py`, `tests/server/test_unit_change.py`,
`tests/server/test_unit_change_api.py`.

**Build (re-read the built `unit_change.py` first; D4 also edited it):**

- `Converter` gains `blocks: Callable[[Session, str], Refusal | None] | None =
  None`; `plan()` calls it per interpretation 8. `Refusal` and the API's
  `UnitChangeRefusal` gain `conversions: int | None` and `lines: int | None`;
  the refusal `Literal` gains `unit_has_dependents` and `conversion_for_new_unit`
  (keep D3's `unit_mismatch`, D4's `unit_not_for_source`). The `Number.kind`
  comment and `UnitChangeRefusal.kind` comment list `conversion`.
- `ingredient_converters(ingredient, basis, new_unit)`: captures `old =
  ingredient.unit`; `basis` as now; `recipe_amounts` over R2's `_recipe_lines`
  helper, keeping only lines with `line_units.is_own(line.unit, old)`, each
  `Number("recipe_amount", row.id, recipe name, "amount", ..., positive=True)`
  whose setter writes the amount and sets `row.unit = ""`; a `conversions`
  converter: one `Number("conversion", conversion.id, conversion.unit,
  "factor", conversion.factor, setter, positive=True)` per stored conversion in
  id order, with `blocks` per interpretation 7 (counting conversions and lines
  with a non-empty unit for `no_convert`, naming the first conversion's unit for
  `conversion_for_new_unit`). Messages in plain English as the others
  (`"Oats has 2 conversions and 3 recipe lines in another unit, so its unit can't
  change to dl."`). Both routes (`preview_unit_change`, `update_ingredient`) pass
  `body.unit`.
- The converters' order, the `Change`/`apply` arithmetic and `refuse` are as they
  are.

**Tests (write first).** `test_unit_change.py` (engine; extend `world()` or add a
`world_with_lines()` helper building Oats (g, basis 100), a conversion `dl = 40`
and `pinch = 0.3`, and a recipe with lines `60` own, `1 dl`, `2 oz` through the
API):
- g to kg: counts `{"basis": 1, "recipe_amounts": 1, "conversions": 2}`, `factor
  "0.001"`, `apply()` sets basis 0.1, the own line 0.06 with unit `""`, the `dl`
  and `oz` lines untouched (amount and unit), the conversions 0.04 and 0.0003;
- kg back to g round-trips every number exactly;
- an explicit own-unit line (set `unit = "kg"` through the session on a kg
  ingredient) counts and converts to g with unit `""` (the leftover case);
- recipe amounts of lines in other units are not counted, and two own lines in
  two recipes count two;
- a conversion that rounds to 0 (`0.0004` g to kg gives 0.0000004) is refused
  `conversion_rounds_to_zero` with `kind "conversion"`, `name` the unit, `field
  "factor"`, and nothing applied; a conversion that reaches 10^9 is
  `conversion_too_large`; digits lost from a factor count in `rounded`;
- `conversion_for_new_unit`: Oats g with a conversion for `kg` (and one for
  "kilogram") changing to kg is refused, naming the unit; to `mg` it is not;
- `unit_has_dependents`: g to dl refused with a conversion (counts carried), refused
  with only a `dl` line, allowed with only own-unit (empty) lines (kind
  `no_convert`, numbers untouched, as before this slice); `st` to free text
  `portion` refused with a conversion; free text to `st` likewise; g to `st` with
  nothing depending is allowed;
- `same` (g to gram) touches nothing and is not blocked by conversions;
- the refusal names the first problem in converter order (a basis that rounds to 0
  beats a conversion problem).
`test_unit_change_api.py`:
- preview and `PUT` agree for each case above (the existing parametrised helper
  style: `test_preview_and_put_agree`); `PUT` converts in one transaction and a
  refused `PUT` changes nothing (basis, lines, conversions and unit all as they
  were);
- the recipes API's totals for the recipe are the same before and after g to kg
  (the whole point), and the planned amount in a solve is the same quantity;
- a linked ingredient's (D4) `unit_not_for_source` and the energy refusal keep
  their order and codes; the preview still answers `unit_not_for_ingredient` for
  an energy unit;
- the existing U3 and R2 assertions on counts get `"conversions": 0`; none
  weakened.
Then `npm run gen:api` (the refusal types and counts' fields change `schema.ts`).

**Verify:** `python3 -m pytest -q`; and the Postgres run of the whole server suite
(`TEST_DATABASE_URL=... python3 -m pytest -q tests/server`).

**Commit:** "server: an ingredient's unit change converts its line amounts and conversions".

**Checked:** `test_unit_change.py` and `test_unit_change_api.py` (counts,
round trip g to kg and back, the leftover own-unit line, both refusals, nothing
applied on a refusal, preview and `PUT` agree for seven units, the totals and a
solve keep their quantity); the whole suite on both databases. Differences:
interpretation 20.

### Task 5: Web: types, unit maths, draft, totals, texts (no pages yet)

**Files:** create `web/src/lineUnits.ts`, `web/src/lineUnits.test.ts`; modify
`web/src/units.ts`, `web/src/units.test.ts`, `web/src/totals.ts`,
`web/src/totals.test.ts`, `web/src/composables/useRecipeDraft.ts`,
`.../useRecipeDraft.test.ts`, `web/src/composables/useUnitChange.ts`,
`.../useUnitChange.test.ts`, `web/src/components/UnitChangeDialog.test.ts`,
`web/src/api/types.ts`, `web/src/test-data.ts`, `web/src/i18n/en.json`.

**Build:**

- `api/types.ts`: `Conversion` (the schema's) next to the other aliases.
- `units.ts`: `useUnits().ratio(from, to): Fraction | null`: exact, from the
  catalogue's `factor` strings with bigints, the same rule as `units.ratio`
  (same catalogue unit is 1, free texts equal ignoring case and trimming are 1,
  different categories or a missing factor is null). `Fraction` is the type
  `totals.ts` already uses; export it and its `fraction()` parser from
  `totals.ts` (or move both to a small `fractions.ts` if that avoids a cycle).
- `lineUnits.ts`: `lineFactor(ratio, ingredient, unit): Fraction | null`, the
  interpretation 1 rule in TypeScript over `ingredient.unit` and
  `ingredient.conversions`, with `ratio` being `useUnits().ratio` (a parameter, so
  the file is pure); `isOwn(ratio, ingredient, unit)`; `pickerOptions(ratio,
  offered, ingredient)` giving the groups of interpretation 11 (a pure function:
  `{own, steps: CatalogueUnit[], conversions: Conversion[]}`).
- `totals.ts`: `portionTotals(items, attributes, servings = 1, factorOf =
  () => ONE)`; each item is `{ingredient, amount, unit}`; the amount is
  multiplied by `factorOf(ingredient, unit)` (null counts 0). Rounding unchanged.
- `useRecipeDraft.ts`: `DraftLine` gains `unit` (`''` own); `draftOf` copies it;
  `checkRecipe` sends `unit` (trimmed) and refuses a line that does not convert
  (`recipes.unitNotConvertible`, errors by line key in `unitErrors`);
  `serverErrors` maps `sections.{i}.items.{j}.unit` (`unit_not_convertible`,
  `unit_not_for_ingredient`) to the line's key; `addIngredient` starts a line
  with unit `''`. The derived-tags watcher is unchanged.
- `useUnitChange.ts`: `refusalText` handles `unit_has_dependents` and
  `conversion_for_new_unit` from the refusal's `conversions`, `lines` and `name`;
  the subject for kind `conversion` comes from `te('unitChange.subject.conversion')`
  as D4's generic rule does (re-read; D4 replaced the hard-coded kind list).
- `en.json`: `recipes.unitOf` "Unit of {name}", `recipes.unitGroups.own`
  "Ingredient's unit", `.steps` "Other units", `.conversions` "Conversions",
  `recipes.newUnit` "New unit…", `recipes.unitNotConvertible` "{unit} of {name}
  doesn't convert. Pick another unit or add a conversion.", `recipes.aiTooltip`
  and `conversions.aiTooltip` "Suggested by AI, not checked by you";
  `conversions.title` "Conversions", `.empty` "No conversions yet.", `.row` "1
  {unit} = {factor} {own}", `.add` "+ Add conversion", `.addTitle` "New unit",
  `.editTitle` "Edit conversion", `.unit` "Unit", `.factor` "How many {own} one
  makes", `.unitRequired` "Enter a unit.", `.factorInvalid` "Enter a number above
  0.", `.numberTooLong` "Use at most 9 digits before the point and 6 after.",
  `.unitIsOwn` "That is the ingredient's own unit.", `.duplicate` "This
  ingredient has a conversion for that unit already.", `.unitNotForIngredient`
  (reuse `ingredients.unitNotForIngredient`), `.saveFailed`, `.deleteFailed`,
  `.usedIn` "Used in {recipes}", `.inUse` "Can't be deleted while a recipe uses
  it.", `.unitInUse` "A recipe uses this unit, so only the number can change.",
  `.saveFirst` "Save the ingredient to add conversions.", `.deleteTitle`;
  `ingredients.deleteConversions` "This also removes its {n} conversion. | This
  also removes its {n} conversions."; `unitChange.counts.conversions` "no
  conversions | 1 conversion | {n} conversions"; `unitChange.subject.conversion`
  "The conversion for {name}"; `unitChange.fields.factor` "number";
  `unitChange.refusal.unit_has_dependents` ("{name} has {conversions} and
  {lines} in other units that depend on {from}, so it can't change to {to}.
  Delete or change them first." built with pluralised parts; write the pieces as
  `unitChange.dependents.conversions` / `.lines` plural strings),
  `unitChange.refusal.conversion_for_new_unit` ("{name} has a conversion for
  {to}. Delete it first.").
- `test-data.ts`: `conversion()` factory; ingredient factory `conversions: []`
  (done in Task 3), line factory `unit: ''`.

**Tests (write first):**

- `lineUnits.test.ts`: the same cases as `test_line_units.py` (own, stored,
  stored beats step, step to own, step through a conversion, first conversion
  wins, does not convert), run against `useUnits().ratio` loaded from
  `test-units.json`; `pickerOptions`: g ingredient with no conversions lists the
  mass units and no volume ones; with a `dl` conversion lists the volume units
  too, the `dl` itself only under Conversions; a `st` ingredient lists no
  catalogue unit; an `ai` conversion is flagged.
- `units.test.ts`: `ratio` for g to kg (1000 / 1), oz to g, tsk to msk, US cup to
  dl exactly, mass to volume null, `st` to `Stycken` 1, "Pinch" to "pinch" 1,
  unknown to unknown null.
- `totals.test.ts`: units: 60 g plus 1 dl at 40 g per dl; the same total as the
  server test (`Energy 389` shape; use the server test's numbers); a line that
  does not convert counts 0; servings with units; ties still round as before.
- `useRecipeDraft.test.ts`: the draft keeps and sends `unit`; a line that does not
  convert is refused with its key; `serverErrors` maps `unit_not_convertible` to
  the line.
- `useUnitChange.test.ts`: the two new refusal texts with their counts (0
  conversions or 0 lines are left out of the sentence); the kind `conversion`
  subject.
- `UnitChangeDialog.test.ts`: counts with `conversions` ("the basis, 1 recipe
  amount and 2 conversions will be converted from kg to g (× 1000)").

**Verify:** `npm run lint`, `npm run typecheck`, and `npx vitest run
src/lineUnits.test.ts src/units.test.ts src/totals.test.ts src/composables
src/components/UnitChangeDialog.test.ts` (page tests may still be red until
Task 6 only if a page reads a changed signature; fix those minimally).

**Commit:** "web: line units, ratios and conversions in the draft and the totals".

**Checked:** `npm run lint`, `npm run typecheck`, `npm test` (676 tests at this
commit); `lineUnits.test.ts` repeats the cases of `test_line_units.py` against
`useUnits().ratio` loaded from `test-units.json`. Differences: interpretations
21, 22 and 24.

### Task 6: Web: C2's unit picker and **New unit…**

**Files:** create `web/src/components/LineUnitPicker.vue`, `.test.ts`,
`web/src/components/ConversionDialog.vue`, `.test.ts`; modify
`web/src/components/RecipeSection.vue` and its test (R2's component),
`web/src/pages/RecipePage.vue` and its test.

**Build:**

- `LineUnitPicker.vue`: props `ingredient`, `modelValue` (the line's unit,
  `''` own), `name` (for the label), `error`; emits `update:modelValue` and
  `new-unit`. A `q-select` (menu, outlined, dense, `aria-label` "Unit of {name}")
  with the groups of `pickerOptions`: **Own unit** (the option shows the
  ingredient's unit symbol), **Other units** (`units.label`: `oz (ounce)`),
  **Conversions** (the unit, "= 40 g", ✨ with the tooltip for `ai`), and a last
  entry **New unit…** which emits `new-unit` and does not change the value. The
  box shows the unit symbol (own unit for `''`). Headers as `UnitField.vue` does
  (`q-item-label header`, disabled). A unit not among the options shows its text
  with the error colour.
- `ConversionDialog.vue`: props `ingredient` and an optional `conversion` (edit);
  v-model for open; `UnitField` for the unit (groups volume, mass, `st`; free text
  allowed, no energy), a number field "1 {unit} = [ ] {own unit}"; **Save** posts
  or puts (`POST` / `PUT /api/ingredients/{id}/conversions[/{cid}]`) and emits
  `saved(conversion)`; field errors from the server show on the fields (`unit`:
  `unit_not_for_ingredient`, `unit_is_own_unit`, `duplicate`, `conversion_in_use`
  as `conversions.unitInUse`; `factor`: number errors); client checks for an empty
  unit and a factor that is not above 0; Cancel. One dialog for C2 and C4.
- `RecipeSection.vue`: each line's unit suffix becomes the `LineUnitPicker`
  (the amount input and its `aria-label` "Amount of {name}" stay); the section
  passes `new-unit` up with the line.
- `RecipePage.vue`: passes each line's ingredient (with its `conversions`) and
  `unit`; one `ConversionDialog` for the ingredient of the line that asked; on
  `saved` the conversion is patched into the page's copy of that ingredient
  (`data.ingredients`) and the asking line's unit is set to it; the per-portion
  totals use `portionTotals(..., servingsNumber, factorOf)` with `factorOf` from
  `lineFactor`; a line that does not convert shows the error under its row
  (`recipes.unitNotConvertible`).
  Load `useUnits().load()` with the page (as `UnitField` does) so the catalogue is
  there; while it is missing the picker offers only own unit and the conversions
  and the totals count only own-unit lines (a failed load keeps the page usable,
  as the unit fields do).

**Tests (write first):**

- `LineUnitPicker.test.ts`: groups and order for a g ingredient (own first, mass
  units, no volume ones) and with a `dl` conversion (volume units appear, `dl`
  only under Conversions with "= 40 g"); ✨ for an `ai` conversion and not for a
  `user` one; choosing `oz` emits `'oz'`; choosing Own unit emits `''`; **New
  unit…** emits `new-unit` and leaves the value; a `st` ingredient offers only
  own, its conversions and New unit…; a unit not in the options is shown and
  marked.
- `ConversionDialog.test.ts`: add posts `{unit, factor}` and emits the saved
  conversion; edit puts; each server refusal shows on its field; client checks;
  Cancel sends nothing; the factor label names the ingredient's unit.
- `RecipeSection.test.ts`: the picker shows on every line and a change edits the
  draft line's `unit`.
- `RecipePage.test.ts` (existing tests keep passing with `unit: ''`):
  `a line in dl of a g ingredient with a dl conversion converts in the per-portion
  total` (the server test's numbers); `New unit… adds a conversion through the
  API, selects it on the line and updates the total`; `a line that does not
  convert is marked and Save sends nothing`; `Save sends each line's unit`; `the
  server's unit_not_convertible shows on the line`; `an existing recipe opens with
  its line units`; `with the catalogue not loaded the page still works for
  own-unit lines`.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test` (whole web suite),
`python3 -m pytest -q`.

**Commit:** "web: C2 unit picker per line and New unit".

**Checked:** `npm run lint`, `npm run typecheck`, `npm test`; the picker,
dialog, section and page tests listed above. Differences: interpretation 23.

### Task 7: Web: C4's Conversions card and the unit-change texts

**Files:** create `web/src/components/ConversionsCard.vue`, `.test.ts`; modify
`web/src/pages/IngredientPage.vue` and its test.

**Build:**

- `ConversionsCard.vue` (props `ingredient`: the saved ingredient with its
  `conversions`; emits `changed(conversions)`): title **Conversions**; a row
  `.conversion-row` per conversion, "1 dl = 100 g" with ✨ (and its tooltip) for
  `ai`, **Edit** (opens `ConversionDialog` with it) and **Delete** (a
  `ConfirmDelete`: "Delete the conversion for dl?"; `DELETE`; on 409 the message
  `conversions.inUse`); Delete is disabled while `recipe_count` is above 0 and
  the row says "Used in N recipes"; **+ Add conversion** opens the dialog; "No
  conversions yet." when empty. After a save or delete the card emits the new list
  and the page patches its copy (no page reload).
- `IngredientPage.vue`: for a saved ingredient show the card after the tags and
  before "Used in N recipes"; a new ingredient shows `conversions.saveFirst`
  instead. `confirmDelete`'s warning names the conversions (`ingredients.deleteConversions`)
  when there are any. The unit-change flow is unchanged: the dialog and the
  refusals under **Measured in** come from the server's answer through
  `refusalText` (Task 5); check by test that the new count text and both refusals
  show.

**Tests (write first):**

- `ConversionsCard.test.ts`: rows read "1 dl = 100 g"; ✨ with its tooltip for
  `ai`; none for `user`; an empty list says so; Add opens the dialog and a saved
  conversion is listed; Edit saves and emits; Delete confirms, calls `DELETE`, and
  removes the row; Delete is disabled with "Used in 2 recipes"; a 409 shows
  `conversions.inUse` and keeps the row.
- `IngredientPage.test.ts`: a saved ingredient shows the card, a new one the
  save-first hint; saving a unit change shows the dialog with "the basis, 1
  recipe amount and 2 conversions" and Convert saves; `unit_has_dependents` and
  `conversion_for_new_unit` refusals (from the preview) show under **Measured in**
  and the form stays open and nothing is saved; the delete confirmation names the
  conversions; existing tests unchanged.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`, `python3 -m pytest -q`.

**Commit:** "web: C4 Conversions card".

**Checked:** `npm run lint`, `npm run typecheck`, `npm test` (724 tests).
Differences: interpretations 23 and 25.

### Task 8: End-to-end step

**Files:** `web/e2e/catalog.e2e.ts`.

**Build:** re-read the flow's steps as they are (U3's unit change leaves Oats in
kg and Porridge's Oats line at `0.06`; R2's step restores Porridge to servings 1
and one Oats line; D-slices add steps before). Add one step after R2's and before
the Tags step; do not hard-code what an earlier step may have changed, read it:

- Open Oats (Ingredients): the Conversions card says "No conversions yet."; **+
  Add conversion**, Unit `dl`, "How many kg one makes" `0.04`; **Save**: the row
  reads `1 dl = 0.04 kg`. A second add with unit `dl` is refused ("This
  ingredient has a conversion for that unit already."); Cancel.
- Open Porridge (Recipes): **+ Add ingredient**, Oats (a second line); the second line's **Unit of Oats** picker lists `oz (ounce)`, and, as a conversion exists,
  `msk (tablespoon)`; choose `dl (decilitre)`; amount `1`; the per-portion total
  reads `Energy 389 kcal` (233.4 plus 155.6). **Save**; the list row reads `Per
  portion: Energy 389 kcal`.
- Oats again: the conversion row says "Used in 1 recipe" and its **Delete** is
  disabled. Change **Measured in** to `st` and **Save**: the refusal "has 1
  conversion and 1 recipe line in other units" shows under the field and the form
  stays open. Change it to `g (gram)` instead; **Save**; the dialog reads "Oats:
  the basis, 1 recipe amount and 1 conversion will be converted from kg to g (×
  1000)."; **Convert**. Open Oats: the row reads `1 dl = 40 g`.
- Porridge: the first line reads 60, the second still `dl` and `1`, the total
  `Energy 389 kcal`. Remove the second line; **Save**; the list row reads `Energy
  233 kcal` again, so the plan steps after this are unchanged. Back on Oats the
  conversion's Delete is enabled; delete it (confirm) and the card is empty.
- Update the header comment of the file: line units and conversions.

**Verify (the e2e recipe in the common context):** `cd web && npx vite build`;
uvicorn on an empty SQLite file in the scratchpad with `PASSWORD_HASH`,
`SESSION_KEY` and `DATA_SOURCES_DIR=tests/data/data_sources` as the README says;
`E2E_PASSWORD=... E2E_BASE_URL=http://localhost:8000 npm run e2e -- --trace off`;
kill the server.

**Commit:** "e2e: line units and conversions".

**Checked:** the flow passes on SQLite and on Postgres (`DATA_SOURCES_DIR` as
the README says). Differences: the step sits after R2's "back to one portion"
step and before the Tags step; it ends with Oats in g (it was in kg after U3's
step) and no conversion; the dl option is chosen as `/^dl/` (interpretation
23).

### Task 9: Docs

**Files:** `README.md`, the master plan, the import spec, the units spec, the
wireframes spec, this plan.

- `README.md`: in the status paragraph add that recipe lines have units (own,
  catalogue, stored conversion), that C4 manages an ingredient's conversions, and
  that changing an ingredient's unit converts its lines and conversions. Any
  list of API routes or screens in the README gets the new routes and card.
- Master plan: after the latest "done" line add "R3 done: see
  `2026-11-08-slice-r3-line-units-and-conversions.md`."; mark R3's Overview row
  as done only if the others in that table are marked.
- Import spec: under "Data model" and "Built-in unit steps" add a short "As built
  in R3" note: the routing rule (interpretation 1), `unit` storage form (3), the
  conversion endpoints and refusals (4), "used" (5), and that the "Built-in unit
  steps" table is replaced by the catalogue (master plan overlap 2); replace the
  sentence "An ingredient's unit can't be changed while a recipe line or
  conversion depends on it" with the rule of interpretation 7; state that the
  recipe save taking `new_conversions` is R4's.
- Units spec: under "Changing a unit", a "Settled in slice R3" paragraph (what
  converts for an ingredient now: lines in the own unit, conversion factors; the
  two new refusals and when) and the two codes in the Errors table.
- Wireframes spec: C2 (the unit picker per line and **New unit…**), C4 (the
  **Conversions** list, its rows, Add, Edit, Delete disabled while used with
  "Used in N recipes", ✨ and its tooltip).
- This plan: Status "Built"; under each task add how it was checked and the
  differences from the text, as earlier slice plans do.

**Verify:** the full checks (both suites, lint, typecheck, the Postgres run, the
e2e) once more.

**Checked:** the full root suite on SQLite (1568 passed), `tests/server` on
Postgres (1240 passed), `npm run lint`, `npm run typecheck`, `npm test`, and the
flow on both databases, at the last commit. Differences: the master plan's
Overview table has no done marks for any slice, so R3's row is not marked
either; only the "R3 done" line was added.

## Done when

A recipe line can be saved in a unit other than the ingredient's, as long as it
converts (own, catalogue, stored conversion, or a catalogue step to one); the
server's totals and the planner's amounts, and the editor's live totals, are the
lines converted and summed per ingredient and divided by servings; C2 has a unit
picker per line with **New unit…**; C4 lists, adds, edits and deletes an
ingredient's conversions, the delete disabled and 409 while a recipe uses one;
changing an ingredient's unit within its category converts its own-unit lines
and its conversions and leaves other lines alone, and a change to another
category or free text is refused while a line in another unit or a conversion
exists; a recipe from before the migration reads back unchanged; both test
suites (also on Postgres), lint, typecheck, the migration test and the
end-to-end flow pass; and the docs say so.
