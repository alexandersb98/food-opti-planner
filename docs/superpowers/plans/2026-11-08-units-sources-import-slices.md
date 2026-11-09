# Units, Data Sources and Recipe Import — Vertical Slices

**Status:** Proposed; awaiting the user's review.

**Specs:**

- [`2026-11-03-units-design.md`](../specs/2026-11-03-units-design.md)
  (the "units spec"), slices **U1–U3**;
- [`2026-11-03-ingredient-data-sources-design.md`](../specs/2026-11-03-ingredient-data-sources-design.md)
  (the "data source spec"), slices **D1–D6**;
- [`2026-11-07-recipe-import-design.md`](../specs/2026-11-07-recipe-import-design.md)
  (the "import spec"), slices **R1–R5**. Its own three slices are split
  further here: its slice 2 becomes R2 and R3, its slice 3 becomes R4
  and R5.

Slices are lettered by spec so they don't mix with the GUI slices 0–11
(`2026-10-22-gui-slices.md`) or with numbered decisions.

**What this is:** the order in which these specs get built. As for the
GUI slices, each slice goes through the whole stack, is planned,
implemented, reviewed and merged on its own, and `main` works after
each merge. Each slice gets its own detailed implementation plan just
before it is built. This document does not contain those plans.

## Rules for every slice

The GUI slices' rules still hold: `meal_planner/` is not changed; a
slice ships its own Alembic migration and the migration test stays
green; API tests run on SQLite and, in CI, on Postgres; new text goes
through vue-i18n; `schema.ts` is regenerated; the Playwright suite gets
a step when the flow changes. In addition:

- **Unit conversion grows slice by slice,** as delete warnings did. A
  unit change converts whatever stored numbers exist by then: U3 the
  values, goals, basis and recipe amounts; D4 the copied source values;
  R3 the recipe line units and ingredient conversions. Each slice
  extends the unit-change preview, its counts and its tests: each slice
  adds a converter in `server/unit_change.py`.
- **The units catalogue (`server/units.py`) is the only place unit
  rules live.** Later slices add to it; none keep their own unit table
  (see "Overlaps settled here").
- **No test calls the internet or a real AI service.** Scripts that do
  (D1, R1) are run by hand and are never part of CI.

## Overlaps settled here *(proposed)*

The import spec was written after the units spec but does not refer to
it. These slices assume the following; the import spec is updated to
match in its pending review.

1. **Changing an ingredient's unit.** The import spec forbids it while a
   recipe line or conversion depends on it; the units spec converts.
   Proposed: the units spec wins within a category. Changing oats from
   g to kg multiplies the basis and every line in the ingredient's own
   unit by 0.001, and divides every stored conversion's factor by 1000
   ("1 dl = 40 g" becomes "1 dl = 0.04 kg"). Lines in other units (dl,
   msk) are left as written; they still convert at plan time. A change
   to another category, or to or from free text, is refused while a
   line in another unit or a stored conversion exists, as those
   factors would lose their meaning.
2. **Built-in unit steps are the catalogue's.** The import spec's own
   table (g/kg, ml…l, krm/tsk/msk) and name normalisation are dropped.
   Within a category, any two catalogue units convert, so a recipe line
   in oz or US cup also works. Recipe-specific spellings are added to
   the catalogue as aliases ("matsked", "msk." → msk; "tesked" → tsk).
3. **`st` (pieces).** The catalogue gains **known free-text units**: a
   normalised spelling with aliases ("st", "st.", "stycken", "styck",
   "pcs", "piece", "pieces" → `st`) but no category and no factor. They
   convert only through a stored conversion or to themselves. This
   comes in U1, so ingredient unit fields offer `st` from the start.

## Overview

| # | Slice | Screens | Usable result after merge |
|---|---|---|---|
| U1 | Unit catalogue and Settings | S1 | Known units understood; preferred units chosen |
| U2 | Unit fields | C4, C5 | Units picked from a list; new ingredients start in the preferred unit |
| U3 | Changing a unit converts | C4, C5 dialogs | mg → µg or g → kg converts every stored number |
| D1 | Livsmedelsverket data file | — | The source's foods in a committed data file |
| D2 | Reference copy | S1 card, S2 (read-only), C6 | Source loaded at startup; source tags visible and protected |
| D3 | Column mapping | S2 | Source columns linked to attributes |
| D4 | Add from data source | C3, C7, C4 chip | **Ingredients with nutrition from Livsmedelsverket** |
| D5 | Updated values | C4 banner, C3 marker | Source updates reach linked ingredients |
| D6 | Tag groups | C6 | "Only Fish" includes Seafood and Fisk och skaldjur |
| R1 | Model comparison | — | The default AI model chosen on real recipes |
| R2 | Servings, sections, instructions | C2 | Cookbook recipes typed in with their structure |
| R3 | Line units and conversions | C2, C4 | "2 dl crème fraîche" in a recipe |
| R4 | Import from pasted text | C1, I1, C2 review | **Recipes imported by AI** from pasted text |
| R5 | Import from a link | I1 | Recipes imported from a URL |

U1 done: see `2026-11-08-slice-u1-unit-catalogue.md`.
U2 done: see `2026-11-08-slice-u2-unit-fields.md`.
U3 done: see `2026-11-08-slice-u3-unit-change-converts.md`.
D1 script done: see `2026-11-08-slice-d1-livsmedelsverket-data-file.md`.
The data file itself is generated and committed by the owner (README).
D2 done: see `2026-11-08-slice-d2-reference-copy.md`.
D3 done: see `2026-11-08-slice-d3-column-mapping.md`.
D4 done: see `2026-11-08-slice-d4-add-from-data-source.md`.
D5 done: see `2026-11-08-slice-d5-updated-values.md`.
D6 done: see `2026-11-08-slice-d6-tag-groups.md`.
R2 done: see `2026-11-08-slice-r2-servings-sections-instructions.md`.
R1 built, run pending the owner: see `2026-11-08-slice-r1-model-comparison.md`.

**Dependencies:**

- U1 → U2 → U3.
- D1 needs U1 (unit normalisation). D1 → D2 → D3 → D4 → D5. D6 needs
  only D2.
- R1 needs nothing and can run any time; it should be done before R4
  merges, so R4 ships with a chosen default model.
- R2 needs nothing. R3 needs R2 and U3. R4 needs R3. R5 needs R4.

**Suggested order:** U1, U2, U3, then D1–D6 (the data source spec comes
first in the user's order: ingredients, then recipes, then prices),
then R2–R5. R1 and R2 fit anywhere earlier, e.g. while waiting for D1's
API check. The two tracks D and R don't touch the same tables, apart
from R3 extending U3's unit change, so they can also be interleaved.

## Units

### U1 · Unit catalogue and Settings (S1)

- `server/units.py`, a pure module: categories, prefixes, listed units
  with factors and aliases, known free-text units (`st`), `parse`,
  `factor`, display names.
- `GET /api/units` sends the catalogue; the app keeps it in a store.
- `preferences` table (key, value); `GET/PUT /api/preferences` with
  `unit.mass`, `unit.volume`, `unit.energy` (defaults g, dl, kcal);
  unknown keys and units of the wrong category refused.
- Settings page S1, a sixth menu entry, last: the **Preferred units**
  card, saving on change.

**Tests:** `units.py` as listed in the units spec, plus `st` and its
aliases; preferences read and written, refusals; the units endpoint.
Vitest: the menu has six entries; the card saves on change.

### U2 · Unit fields (C4, C5)

- The unit field on C4 and C5 becomes a combo box: units grouped by
  category, preferred unit first, free text still allowed. A unit
  chosen from the list is stored in its catalogue spelling.
- Ingredient: mass, volume and `st` offered; a new ingredient starts in
  the preferred mass unit; an energy unit is refused (422
  `unit_not_for_ingredient`). The basis default uses the catalogue
  (100 for mass and volume, 1 otherwise).
- Attribute: mass, volume and energy offered; the help text under the
  field.

**Tests:** API refusal of an energy unit on an ingredient. Vitest: the
combo box groups and orders units and takes typed text; a new
ingredient starts in the preferred mass unit.

### U3 · Changing a unit converts

- `POST /api/attributes/{id}/unit-change` and
  `POST /api/ingredients/{id}/unit-change` preview a change: kind,
  factor, counts, rounded, refusal.
- `PUT` converts in the same transaction, with the same refusals:
  attribute values, goal Min/Max and zero-bound reference; ingredient
  basis and recipe amounts. Exact `Decimal`, rounding to 6 decimals,
  `conversion_needs_decimals`, `conversion_too_large`. Saved and
  unsaved plans untouched.
- C4 and C5 call the preview before saving and show the Convert or
  Change unit dialog.

**Tests:** as in the units spec: converts within a category, plans
untouched, other category converts nothing, rounding, both refusals,
the preview matches `PUT`. Component tests for both dialogs.
Playwright: change an ingredient from g to kg; its recipe amount is
converted.

## Data sources

### D1 · Livsmedelsverket data file

- **First task** (from the data source spec): check the API's current
  endpoints, licence and attribution terms, the shape of its food
  groups (one level or a tree) and its units. Write the findings into
  the data source spec. If the food groups are a tree, the plan stops
  and asks how they become tags.
- `scripts/import_livsmedelsverket.py`: download, normalise units with
  `units.py`, decimal strings, write
  `server/data_sources/livsmedelsverket.json.gz`. Never touches a
  database.
- Outcome of the first task: the API could not be reached, so the
  findings are recorded as unverified and the food groups are treated
  as a flat list (the extraction is isolated for a later tree).
- The script is run by hand and the data file committed in this slice.
  If the session's network can't reach the API, the owner runs it and
  commits the file.

**Tests:** the script on a recorded API response of a few foods: the
file's shape, decimal strings, unit normalisation.

### D2 · Reference copy (S1 card, S2 read-only, C6)

- Tables `data_sources`, `source_columns`, `source_foods`,
  `source_food_values`, `source_food_tags`; `tags.source`.
- Loading at startup after the migrations: by key, withdrawing what the
  file no longer has, a source tag per new food group, one transaction,
  a failure logged and rolled back.
- S1's **Data sources** card; S2 with name, version, imported at,
  attribution, **Colour**, and the column list (search, withdrawn last)
  without mapping yet. `GET /api/data-sources`,
  `GET/PATCH /api/data-sources/{key}`.
- C6: source tags in their source's colour with its name; rename and
  delete refused (422 `source_tag`) and hidden. Source tags default to
  the Any rule.

**Tests:** loading with a small fixture file: first load, a new version
adds, updates and withdraws, a group's tag survives its group leaving,
the same version loads nothing, a broken file rolls back. Source tags
can't be renamed or deleted. Component test for S2's colour.

### D3 · Column mapping (S2)

- `source_columns.mapped attribute`; `PUT
  /api/data-sources/{key}/columns/{id}`; refusals `unit_mismatch` and
  `attribute_taken`; an attribute delete clears its mappings (and the
  delete warning counts them).
- S2's **Attribute** drop-down per column: only convertible attributes,
  taken ones shown with their column; **Create attribute** opens the
  attribute form with the preferred unit of the column's category and
  maps on save. S1's card shows how many columns are mapped.

**Tests:** both refusals; attribute delete clears the mapping.
Component test for the drop-down and Create attribute.

### D4 · Add from data source (C3, C7, C4 chip)

- `ingredients.source food`, `ingredient_values.source value`;
  `last_data_source` preference.
- Food search and food preview endpoints;
  `POST /api/ingredients/from-source` (values converted, chosen tags,
  `withdrawn` and `duplicate` refusals); `POST
  /api/ingredients/{id}/unlink`.
- C3's **Add from data source** and the C7 dialog: remembered source,
  search, preview with values and tag toggles, the duplicate-food
  warning.
- C4: the source chip ("No longer in the source" when withdrawn),
  **Unlink from source**; a linked ingredient's unit may change only
  to another mass unit (`unit_not_for_source`).
- U3's attribute unit change now also converts source values.

**Tests:** add from source copies converted values and the chosen tags;
duplicate warning; withdrawn refused; unlink; unit change refused while
linked; an attribute unit change converts source values. Component
tests for C7. Playwright: map one column, add a food from the fixture
source, see its value on the ingredient.

### D5 · Updated values (C4 banner, C3 marker)

- Ingredient responses gain `updated_values`, including values for
  columns mapped after the ingredient was added.
- `POST /api/ingredients/{id}/source-values` with Accept or Keep mine.
- C4's **Updated values available** banner; C3 marks such ingredients
  and filters on them.

**Tests:** a new fixture version changes a value → banner; Accept
copies; Keep mine hides it until the next change; a later mapping shows
as an update; a value with no mapped column any more is left alone.
Component test for the banner.

### D6 · Tag groups (C6)

- `tag_groups`, `tags.group`; `PUT /api/tags/{id}` gains
  `equivalent_tag_ids` and `confirm`; 409 with the question's facts
  when an answer is needed; a group left with one tag is deleted; a
  deleted tag leaves its group first.
- C6's **Equivalent tags** chips and picker with the three questions
  (move from another group, switch rule, change the group's rule).
- Translation: each group becomes one library tag with the group's
  rule, for ingredients, recipes' extra tags and Only/Never filters;
  the recipe-count endpoint uses the same translation.

**Tests:** groups move, dissolve and share a rule, with the
confirmations; translation tests for each case; a real solve with "Only
Fish" picks a recipe whose ingredient carries Seafood only. Component
test for the questions. Playwright: filter a plan on an equivalent tag.

## Recipes

### R1 · Model comparison

- About 10 real recipes, Swedish and English, tidy and messy, each with
  a hand-written expected draft, kept as test data.
- The `RecipeConverter` and `FactorSuggester` interfaces, the prompt
  and JSON schema, and one adapter per candidate provider. These are
  kept for R4.
- A script in `scripts/` runs each candidate and reports correct
  amounts, units, matches, servings, not-an-ingredient flags and cost.
  Prices are checked on the providers' pages at that time.
- Run by hand with real keys; the result and the chosen default
  `AI_MODEL` are written into the import spec. The run and the final
  default are the owner's; the slice ships a provisional default.

**Tests:** each adapter against a recorded response; the scoring
function on a hand-made draft.

### R2 · Servings, sections, instructions (C2)

- One migration: `recipes.servings`, `instructions`, `source_url`;
  `recipe_sections`; `recipe_items` re-keyed by its own id with
  `section_id`, `position` and `original_text`. Existing recipes get one
  unnamed section in their current order and servings 1.
- `unit` on `recipe_items` is added in R3, not here.
- Translation: amount ÷ servings, lines summed per ingredient.
- `/api/recipes` and C2: **Serves N** (per-portion totals divide by N),
  sections (one unnamed section looks like today), several lines for
  one ingredient, **Instructions**, **Source** link. C4's "Used in N
  recipes" counts recipes, not lines.

**Tests:** migration data test: a recipe from before gives the same
library `Recipe` after; translation for servings and summing; servings
under 1 refused. Component tests for sections and Serves N.

### R3 · Line units and conversions (C2, C4)

- `recipe_items.unit`; `ingredient_conversions` with `source`
  (`ai` / `user`).
- Translation: per line, into the ingredient's unit by its own unit, a
  stored conversion, or a catalogue step (directly or to a unit with a
  conversion). Saving a recipe refuses a line that doesn't convert.
- C2: a unit picker per line (own unit, same-category units, the
  ingredient's conversions with ✨ for AI ones, **New unit…**).
- C4: the **Conversions** list; editing one makes it `user`; delete
  disabled while used (409).
- U3's ingredient unit change extends to lines and conversions as
  settled in "Overlaps settled here", point 1.

**Tests:** translation for each conversion route; a line that doesn't
convert refused; a used conversion can't be deleted; the ingredient
unit change converts own-unit lines and conversion factors and refuses
a change of category. Component tests for the unit picker and C4's
conversions.

### R4 · Import from pasted text (C1, I1, C2 review)

- Settings `AI_PROVIDER` (with `fake`), `AI_MODEL` (R1's choice), the
  key from Secret Manager, `AI_DAILY_LIMIT`; health says whether a key
  is set; `docs/deploy.md` gains the secret.
- `POST /api/recipe-imports` with `{text}`: convert, check on the
  server (matches, units, line status), suggest factors; one retry on a
  bad answer; the daily limit. `POST /api/recipe-imports/factor`.
- Saving takes the new conversions with their `source`.
- C1's **+** menu with **Import recipe** (disabled without a key); I1
  with the paste box only; C2's review states: banner, source lines,
  Pick ingredient with **+ New ingredient** in a dialog, factor with ✨
  and Accept, not-an-ingredient lines, Save disabled until done.

**Tests:** API with the fake converter, broken drafts included; the
daily limit; matching ignores case; factor suggestions per status.
Component tests for each review state. Playwright: import a pasted
recipe with the fake converter, match a line, save.

### R5 · Import from a link (I1)

- `{url}` on `POST /api/recipe-imports`: http and https only, 10 s,
  2 MB, 3 redirects, HTML only, internal addresses refused on every
  redirect.
- schema.org `Recipe` JSON-LD when present, else the visible text; cut
  to the maximum length.
- I1's **Link** field becomes the default, with the Paste text switch;
  the error messages for a page that can't be read and a page with no
  recipe; C2's banner names the site; the recipe keeps its source URL.

**Tests:** against a stubbed transport: JSON-LD page, plain page, too
large, not HTML, refused address, redirect to a refused address. Unit
tests for the internal-address check. Component test for the Link and
Paste switch.

## Not in any slice

As in the specs: a scheduled GitHub Action for the data file; more data
sources; prices; showing every amount in the preferred unit; mass ↔
volume from density; recipe lists; nutrition suggestions from
Livsmedelsverket during import; photo import; sub-recipes; bulk import.
