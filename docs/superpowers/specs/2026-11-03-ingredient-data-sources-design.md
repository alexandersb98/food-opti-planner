# Ingredients from External Data Sources

**Status:** Approved by the user. Decisions 1–14 and the data model
were agreed in brainstorming; the sections marked *(proposed)* were
written for this spec and approved in its review.

**Path:** Architectural (new tables, a data file and its import, new
screens, tag groups, a change to how tags reach the library).

**Context:** The app works but has very little data: every ingredient
and its values are typed in by hand (design doc decision #8, a
user-maintained ingredient database). This is the first of three
sub-projects that bring in outside data, built in this order:
**ingredients** (this spec), then recipes, then prices; each gets its
own spec. It relies on
[`2026-11-03-units-design.md`](2026-11-03-units-design.md) (the "units
spec"), which is built first.

The first source is Livsmedelsverket's food database (the Swedish Food
Agency; about 2 500 foods, 50+ nutrients each, per 100 g). Others, such
as an American database, can be added later with the same tables.

Screen ids follow the GUI spec
([`2026-10-21-gui-wireframes-design.md`](2026-10-21-gui-wireframes-design.md));
new screens are S2 (data source) and C7 (add from data source).

## Decisions

1. **The server keeps a read-only reference copy of each source.** A
   source food becomes an ingredient only when the user adds it, and
   the ingredient keeps a link to its source food.
2. **The copy comes from a data file in the repository.** A script
   downloads the source through its API into a data file (a few MB),
   committed like code; updates arrive as pull requests. The server
   loads the file at startup when its version differs from the stored
   one. A scheduled GitHub Action that opens the update PR can come
   later.
3. **Source foods are matched by the source's own id** across updates.
   A food the source drops is marked withdrawn, never deleted.
4. **Values are copied into the ingredient when it is added.** After a
   source update, an ingredient whose source values changed is marked
   **Updated values available**, with **Accept** or **Keep mine**.
5. **The app owns attributes.** Each source has a mapping from its
   columns to the app's attributes, set on the source's page. Columns
   start unmapped; there are no name-based suggestions. Each column has
   a **Create attribute** action.
6. **The reference copy keeps every column,** mapped or not, so mapping
   another column later needs no new download.
7. **A mapping needs convertible units** (units spec): the column's
   unit and the attribute's must be in the same category, or be the
   same free text. Values are converted when copied.
8. **Foods are added from the Ingredients page only,** with **Add from
   data source**. The recipe editor's ingredient picker is unchanged.
9. **The data source drop-down remembers its last choice** across
   visits and devices (stored on the server).
10. **The name is prefilled from the source and can be edited.** A name
    already taken is refused, as for any ingredient.
11. **The same source food can be added twice,** with a warning such as
    "You already have an ingredient from this food: Havregryn".
12. **Source tags are their own tags,** made from the source's food
    groups and shown in the source's colour (configurable per source).
    Users can't create, rename or delete them, but they work in filters
    and derivation like any tag, and their rule can be changed.
13. **Tags can be made equivalent with tag groups.** A group is a set
    of tags with no name of its own; a tag is in at most one group.
    Filtering on any member includes recipes whose ingredients have any
    member. Removing a tag from a group, or deleting it, leaves the
    others equivalent (no chain of pairs to break).
14. **All tags in a group share their derive rule** (recipe gets the
    tag when all / any ingredients have it). Changing one member's rule
    warns that it changes every tag in the group and applies only when
    the user approves. Adding a tag with another rule asks to switch it
    to the group's rule. Source tags outside a group default to Any.

## Data model

Generic tables, for any source.

| Table | Columns (besides `id`) | Notes |
|---|---|---|
| `data_sources` | key (unique, e.g. `livsmedelsverket`), name, colour, version, attribution (nullable text), imported at | One row per data file loaded. `colour` is `#rrggbb`; a load never changes it. |
| `source_columns` | source, key (the source's own id, at most 100 characters), name (at most 200), unit, `attribute_id` (nullable, `ON DELETE SET NULL`; D3), withdrawn | `unit` as normalised by the import script. Unique (source, key); unique (source, mapped attribute): an attribute is fed by at most one column per source. Deleting the attribute sets the mapping to NULL. |
| `source_foods` | source, key (the source's id, at most 100 characters), name (at most 200), withdrawn | Unique (source, key). |
| `source_food_values` | food, column, value | `NUMERIC`, per 100 g, in the column's unit. |
| `source_food_tags` | food, tag | The food's food groups as source tags. |
| `tag_groups` | — | Just an id. A group left with one member is deleted. |
| `preferences` | key, value | From the units spec; adds `last_data_source`. |

Changes to existing tables:

| Table | New column | Notes |
|---|---|---|
| `tags` | `source_id` (nullable), group (nullable, from D6) | `source_id` set: a source tag (decision 12). |
| `ingredients` | `source_food_id` (nullable, indexed, no cascade) | The link (decision 1). Deleting is never needed, as source foods are never deleted. |
| `ingredient_values` | `source_value` (nullable) | The source's value when last copied or answered, converted to the attribute's unit. Drives decision 4. Converted with the value when the attribute's unit changes (units spec). No other column is needed for updates: the comparison is computed (D5). |

## The data file and its import *(proposed)*

**The script:** `scripts/import_livsmedelsverket.py`, run by hand. It
downloads every food with its nutrient values and food groups through
the source's API and writes
`server/data_sources/livsmedelsverket.json.gz`:

```json
{
  "key": "livsmedelsverket",
  "name": "Livsmedelsverket",
  "version": "2024-05-29",
  "licence": "CC BY 4.0",
  "attribution": "Source: Livsmedelsverket, …",
  "columns": [{"key": "PROT", "name": "Protein", "unit": "g"}],
  "foods": [{"key": "1", "name": "Havregryn", "groups": ["Gryn"],
             "values": {"PROT": "13.5"}}]
}
```

- A column is a nutrient as the source defines it. Its key is the
  source's EuroFIR code, or its name when there is none. If one key
  appears with several units in the download (energy is expected in kJ
  and kcal), each of those columns gets the key `<key>:<unit>`
  (`ENERC:kJ`, `ENERC:kcal`) and a name made distinct by the unit.
- `attribution` is the credit line S2 shows; the loader treats it as
  optional text. Absent, a given `licence` becomes `Licence: <licence>`;
  else S2 shows no attribution.

- `version` is the source's own version, or the download date when it
  has none.
- Units are normalised to the catalogue's spelling where the source
  writes them otherwise (e.g. "ug" → "µg"); other units, such as
  "kg CO2e", stay as
  written.
- Values are written as decimal strings, never floats.
- The script never touches a database.

**File validation (D2).** The loader checks a file fully before it writes
anything, and refuses it with a message naming what and where: gzip, UTF-8
JSON, an object with `key` (`[a-z0-9][a-z0-9_-]*`, at most 50), `name`
(1-100), `version` (1-50), columns with unique keys, foods with unique keys,
`groups` as non-empty names of at most 100 characters, and `values` as
decimal strings of known columns (no JSON numbers, no exponents; more than 6
decimals are rounded, more than 9 digits before the point are refused).

**Source tag names (D2).** A tag is named as its food group. If another tag
has that name (one made by hand, or a group of another source) the source
tag is named `<group> (<source name>)`; if that is taken too the file's load
fails (logged, rolled back). Later loads find the source's own tag by either
name. A group that leaves the file keeps its tag.

**Loading at startup**, after the migrations: for each data file whose
version differs from `data_sources.version` (or that has no row yet),
in one transaction:

- add or update columns, foods, values and source tags by their keys;
- mark withdrawn every column and food the file no longer has, and
  clear withdrawn on those it has again;
- create a source tag per food group the first time it appears; a
  group the file no longer has keeps its tag (ingredients may carry
  it);
- set version and imported at.

A failure rolls back, is logged, and the app runs on the copy it had.
The data file never needs the network at runtime. At about 2 500 foods
× 55 values, the copy is about 140 000 value rows, well inside Neon's
free 0.5 GB.

**First task of the plan:** check the API's current endpoints, its
licence and attribution terms, the shape of its food groups (one level
or a tree), and its units. A web check found the API and a 2024-05-29
version, but not these details.

### API check findings (D1)

*2026-11-08. The dataportal host could not be reached from the session
(DNS failure, then the proxy's 403), so everything below comes from web
search summaries and third-party client code and is **unverified**.
The script and its readers are built so that each item can be corrected
from the command line or in one place.*

- **Base URL and endpoints:** `https://dataportal.livsmedelsverket.se/livsmedel/api/v1`;
  `GET /livsmedel` (the list of foods), `GET /livsmedel/{nummer}/naringsvarden`
  (nutrient values), `GET /livsmedel/{nummer}/klassificeringar`
  (classifications). Swagger UI at `/livsmedel/swagger/index.html`.
- **Field names:** food `nummer`, `namn`; nutrient `euroFIRkod`, `namn`,
  `varde`, `enhet`, `viktGram`. The readers also accept a few other
  spellings and either a bare list or an object holding the list.
- **Per 100 g:** `viktGram` is always 100 according to the documentation;
  the script scales a value if it ever differs.
- **Licence:** CC BY 4.0, Livsmedelsverket must be credited. The file
  carries the credit line "Source: Livsmedelsverket, Livsmedelsdatabasen
  (open API, dataportal.livsmedelsverket.se), licence CC BY 4.0." in
  `attribution`, which S2 shows.
- **Units** come per nutrient (`enhet`); energy is expected as two rows
  of the same code, kJ and kcal.
- **Vitamin D changed in 2025** (two values, with and without 25-OH-D3):
  a missing value is not zero, so the script leaves it out.

**Open points (unverified), to close on the first real run:**

1. *Food groups.* Treated as a flat list, one group name per food, taken
   from the classification whose type matches "livsmedelsgrupp" (or the
   type given with `--group-type`). Whether the API exposes a tree
   (LanguaL or FoodEx2 hierarchy, parent links) is not known; if it
   does, the change is confined to `extract_groups` in the script and
   the tag mapping in D2.
2. *Paging and language.* `offset` and `limit` for paging and `sprak`
   (1 = Swedish) for the language are guesses; all are options of the
   script.
3. *Unit strings as the source writes them* (the micro spelling) and the
   codes of the two energy rows. The summary of the run lists every unit
   as read and as written.
4. *The exact attribution wording* Livsmedelsverket requires.
5. *Whether a source version exists.* The file uses the download date.

## Settings and the data source page *(proposed)*

**Settings page (S1)** gets a second card, **Data sources**: one row
per source with its name, colour dot, version and how many columns are
mapped. A row opens S2.

**S2 · Data source** (e.g. Livsmedelsverket):

- Name, version, imported at, and the source's attribution text.
- **Colour:** a colour picker; source tags show in it.
- **Columns:** a searchable list. Each row shows the column's name and
  unit and an **Attribute** drop-down:
  - only attributes whose unit converts with the column's are offered;
  - an attribute already mapped from another column of this source is
    shown taken, with that column's name;
  - **Create attribute** opens the attribute form with the name empty
    and the unit set to the preferred unit of the column's category
    (the column's own unit when it has no category); on save it is
    mapped.
  - An attribute taken by another column is shown disabled, with that
    column's name ("taken by TEST Protein"); choosing saves at once.
- Withdrawn columns are listed last, greyed, and keep their mapping,
  which can still be changed or removed (otherwise an attribute a
  withdrawn column holds could never be freed).
- A new data file that gives a mapped column a unit that no longer
  converts with its attribute clears that mapping (a change within the
  category keeps it), so every stored mapping converts.

Mapping a column later doesn't change ingredients already added: they
get **Updated values available** for it (see below).

## C7 · Add from data source *(proposed)*

The Ingredients page (C3) gets **Add from data source** beside **+**.
It opens a full-screen dialog:

1. **Data source** drop-down, starting at the last choice
   (`last_data_source`); a change is saved.
2. **Search** by food name (server-side, 20 results at a time, with
   **Show more**): the name contains the text, ignoring case, names that
   start with it first; an empty search lists the first 20. The answer has
   a `total`. Withdrawn foods are not offered. A result shows the food's
   name and food group.
3. Choosing a food shows the ingredient to be made:
   - **Name**, prefilled with the food's name (cut to 100 characters),
     editable;
   - **Measured in** the preferred mass unit, with basis 100 g in that
     unit (rounded to 6 decimals);
   - the **values** to be copied: one row per mapped column with a
     value, converted to the attribute's unit; unmapped columns are not
     shown. A value too large to store is left out and named in a "Not
     copied" line. A food with no mapped values says so and can still be
     added (an ingredient with a name and a link);
   - the food's **source tags**, each on/off, on by default;
   - a warning when an ingredient already links to this food
     (decision 11).
4. **Add** creates the ingredient, with `source value` set on each
   copied value, and opens it on C4. The server works out the unit,
   basis and values again at that moment from the mapping as it stands.
   A name already taken is refused on the name field; a food withdrawn
   in the meantime is refused and the preview shows it.

## The linked ingredient on C4 *(proposed)*

- A chip under the name, "From Livsmedelsverket: Havregryn", in the
  source's colour (with a readable text colour). A withdrawn food adds "No longer in the source"; the
  ingredient keeps its values.
- Values can be edited as for any ingredient.
- The unit can change to another mass unit (the basis is converted,
  units spec). Volume or free text is refused while linked, as the
  source's values are per 100 g of food (422 `unit_not_for_source`,
  also in the unit-change preview). **Unlink from source** (with a
  confirmation) removes the link and the source values and keeps the
  values, tags and basis, so unsaved edits on the form stay; the
  ingredient is then an ordinary one.
- **Updated values available**: a banner when, for any mapped column,
  the source's current value (converted) differs from `source value`,
  including a value the ingredient has never had because the column
  was mapped later. The banner lists each attribute with the
  ingredient's current value and the new one, in the ingredient's basis
  (not the previous source value): "Protein 13.5 g → 13.8 g", "Protein
  none → 13.8 g". A value the ingredient already has (typed by the user)
  is not offered. **Accept** copies the new values; **Keep mine** keeps the
  values and records the new ones as answered, so the banner returns
  only on the next change; an attribute the ingredient had no value for
  gets an explicit 0. A value with no mapped column any more is
  left alone. The comparison is computed from the source as it stands,
  never stored, and treats numbers a last decimal apart as equal (a unit
  change rounds the stored number step by step).
- The Ingredients list (C3) marks ingredients with updated values and
  can filter on them.

## Tags and tag groups *(proposed)*

**On C6 (Tags):**

- Source tags show in their source's colour with the source's name, and
  have no rename or delete; their rule can be changed (decision 12). New
  source tags default to the Any rule.
- The tag editor gets **Equivalent tags**: the other members of its
  group, as chips, and a picker to add a tag.
  - Adding a tag that is in no group puts it in this tag's group,
    which is made if this tag had none.
  - Adding a tag that is in another group asks first: "Seafood is
    equivalent to Fisk och skaldjur. Move Seafood here?" Only that tag
    moves; its old group keeps the others (and is deleted if one is
    left).
  - Adding a tag with another derive rule asks: "Seafood gets a recipe
    tag when any ingredient has it; the group uses all. Switch Seafood
    to all?" No means it isn't added.
  - Changing the rule of a tag in a group asks: "This changes the rule
    of all 3 tags in the group: Fish, Seafood, Fisk och skaldjur."
  - Removing a chip takes that tag out of the group.
- Deleting a tag (user tags only) takes it out of its group first.

**In the plan.** The library is not changed. When the server builds the
`PlanRequest`, every tag in a group is replaced by one library tag for
the group, with the group's rule. Its name is made from the group's id
and checked against the stored tag names, so it can't clash with one.

- an ingredient or recipe carrying any member carries the group tag;
- an Only or Never filter on any member becomes the same filter on the
  group tag;
- a recipe's extra tags the same way.

So "Only Fish" includes recipes whose ingredients carry Seafood or Fisk
och skaldjur. The recipe-count endpoint uses the same translation. The
screens keep showing the members themselves (a recipe's derived tags
list Seafood, not the group).

## API *(proposed)*

| Endpoint | For |
|---|---|
| `GET /api/data-sources` | The sources, by name: `key, name, colour, version, imported_at, food_count, column_count` (not withdrawn) and `mapped_count`, the not withdrawn columns that are mapped (S1). |
| `GET/PATCH /api/data-sources/{key}` | The summary plus `attribution` and all `columns` (`id, key, name, unit, withdrawn, attribute_id`; active by name, then withdrawn); `PATCH` takes `{"colour": "#rrggbb"}` (S2). |
| `PUT /api/data-sources/{key}/columns/{id}` | `{attribute_id \| null}`; answers the column. 404 for an unknown source or column, 422 `unknown_attribute`, `unit_mismatch`, `attribute_taken` (S2). `GET /api/attributes` gains `mapping_count`. |
| `GET /api/data-sources/{key}/foods?search=&offset=` | The search (C7): `{foods: [{id, name, groups}], total, offset, limit}`, `limit` fixed at 20; 422 for a negative `offset`. |
| `GET /api/data-sources/{key}/foods/{id}` | A food as it would become an ingredient (C7): `id, name, withdrawn, source, suggested_name, unit, basis, values, skipped, groups` (with tag ids) and `existing` (ingredients already linked, for the warning of decision 11). 404 for a food of another source. |
| `POST /api/ingredients/from-source` | `{food_id, name, tag_ids}`; 201 with the ingredient (C7). |
| `POST /api/ingredients/{id}/source-values` | `{answer: "accept" \| "keep"}` (C4); answers the ingredient. What is answered is what the server finds now; nothing to answer is a 200 no-op. 404 unknown ingredient; 422 `not_linked` on `path.ingredient_id`. |
| `POST /api/ingredients/{id}/unlink` | C4; answers the ingredient; unlinking an unlinked one is a no-op. |
| `PUT /api/tags/{id}` | Gains `equivalent_tag_ids` and a `confirm` flag for the questions above. |
| `GET/PUT /api/preferences` | Preferred units, and `last_data_source` (null until set; `PUT` refuses a key that is not a loaded source: 422 `invalid_data_source`). |

Ingredient responses gain `source` (`key, name, colour, food_id, food_name, withdrawn`, or null)
and (slice D5) `updated_values`, a list ordered by attribute id of `{attribute_id, value, new_value}`
(the ingredient's current value, or null, and the proposed one, in its basis; empty without a link). Tag
responses gain `source` and `group` (member ids).

## Errors *(proposed)*

| Case | Answer |
|---|---|
| Mapping to an attribute whose unit doesn't convert | 422 `unit_mismatch`, on `attribute_id` |
| Attribute already mapped from another column of the source | 422 `attribute_taken`, on `attribute_id` |
| An attribute's unit change that would stop a mapped column converting | 422 `unit_mismatch`, on `unit` (the refusal names the column) |
| Ingredient name taken | 409 `name_in_use` on `name`, as for every ingredient (not 422 `duplicate`) |
| Withdrawn food added | 422 `withdrawn`, on `food_id` |
| A tag that is not one of the food's source tags | 422 `not_a_food_tag`, on `tag_ids[i]` |
| Rename or delete of a source tag | 422 `source_tag`, on `body.name` (rename) or `path.tag_id` (delete) |
| Group change needing an answer, sent without `confirm` | 409 with the question's facts |
| Linked ingredient changed to a volume or free-text unit | 422 `unit_not_for_source` |
| Answering updated values of an ingredient with no link | 422 `not_linked`, on `path.ingredient_id` |
| A data file that fails to load | Logged at startup; the old copy stays. |

## Testing *(proposed)*

- **Import script:** run on a recorded API response (a few foods) in
  `tests/`; no network in tests. Until a real capture replaces it, the
  recorded response is hand-made from the documentation (foods named
  `TEST ...`, made-up numbers). Checks the file's shape, decimal
  strings and unit normalisation.
- **Loading:** a small fixture data file; first load; a new version
  adds, updates and withdraws by key; a group's tag survives its group
  leaving; the same version loads nothing; a broken file rolls back.
- **API:** mapping refusals; add from source copies converted values
  and chosen tags; the duplicate warning; Accept and Keep mine; a later
  mapping shows as updated values; unlink; source tags can't be renamed
  or deleted; tag groups move, dissolve and share a rule, with the
  confirmations.
- **Translation:** a group becomes one library tag for ingredients,
  recipes, filters and extra tags; a real solve with "Only Fish" picks a
  recipe whose ingredient carries Seafood only.
- **App:** S2's mapping and Create attribute; C7's remembered source,
  search, preview and warning; C4's chip and banner; C6's group editor
  and its questions.
- **End-to-end:** map one column, add a food from the fixture source,
  see its value on the ingredient, filter a plan on an equivalent tag.

## Later

- A scheduled GitHub Action that runs the script and opens the PR.
- More sources (e.g. USDA FoodData Central) with their own script.
- Recipes and prices from outside sources: their own specs.
