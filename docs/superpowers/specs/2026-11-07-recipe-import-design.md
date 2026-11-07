# Recipe Import with AI, Sections, Servings and Unit Conversions

**Status:** Agreed with the user section by section; awaiting spec
review.

**Path:** Architectural (new tables, new endpoints, a new page, an
external AI service).

**Context:** The app needs a growing catalog of recipes to choose from,
so that plans vary from week to week. The size of the catalog matters
less than having a decent choice. No open recipe API fits: the free ones
are small (TheMealDB), the large ones are paid and forbid keeping their
data (Spoonacular, Edamam), and the big open datasets are English,
US-centric and non-commercial (RecipeNLG, Food.com). Recipes are
therefore imported one at a time from a link or pasted text, and an AI
model turns the source's own format into ours. Bulk sources (scraping
whole sites, datasets) can feed the same pipeline later.

This is sub-project 1 of 2. Sub-project 2, **recipe lists** (named
subsets of the catalog chosen on the Plan page), gets its own spec once
the catalog is large; see `future-features.md`.

Screen ids follow the GUI spec
([`2026-10-21-gui-wireframes-design.md`](2026-10-21-gui-wireframes-design.md)):
C1 recipe list, C2 edit recipe, C4 edit ingredient. The import page is
**I1**.

## Decisions

1. **Curated import, one recipe at a time.** The user gives a link or
   pastes text; the app builds a draft; the user reviews it and saves.
   Nothing is stored until Save.
2. **Inputs: a URL or pasted text.** Photos (cookbook pages,
   handwritten recipes) are deferred.
3. **An AI model converts the source into our format.** Rule-based
   parsing was rejected: it can't read sites without schema.org data or
   pasted text, and hand-written line rules for Swedish and English are
   fiddly and fail quietly.
4. **The provider is not fixed.** One interface, one adapter per
   provider, and the provider and model are settings. The default is
   picked by a comparison on real recipes (see "Choosing the model").
   Every candidate looked at costs well under a cent per recipe
   (research of 2026-11-04: Claude Haiku 5.5 about $0.001, Gemini
   Flash-Lite and GPT-5.4 nano about $0.001–0.004; only the Anthropic
   prices were checked against the provider's own pages), so the choice
   is made on quality, not price.
5. **An unmatched ingredient line is resolved by the user.** The user
   picks one of their ingredients or creates a new one by hand. The AI
   suggests a match from the user's own catalog; it never invents
   ingredients or nutrition values. Suggesting new ingredients with
   nutrition from Livsmedelsverket's food database is deferred.
6. **Recipes keep their instructions, source link and source lines.**
   Instructions are one text per recipe; the source URL is kept when
   there is one; each line keeps the text it was parsed from.
7. **Conversions are remembered per ingredient** (design doc decision
   #36). A factor such as "1 dl crème fraîche = 100 g" is stored on the
   ingredient with its `source`: `ai` when the user accepted the AI's
   suggestion, `user` when the user typed or changed it. AI factors are
   marked with ✨ wherever they are shown.
8. **Recipes store amounts as the source wrote them.** A line is an
   amount in a unit, for the whole recipe. The server converts to the
   ingredient's unit and one portion each time a plan is made, so
   correcting a factor fixes every recipe that uses it.
9. **Recipes have a "serves N" field.** Amounts are for N portions; the
   server divides by N. Existing recipes get N = 1. This carries out the
   "recipes that serve several portions" item in `future-features.md`.
10. **Recipes are divided into sections.** Each line belongs to a
    section with an optional name ("Guacamole", "Salsa"). The same
    ingredient may appear on several lines, in one section or several.
    Sections are display only: the recipe is still one unit to the
    optimizer. Reusing a recipe inside another is deferred.
11. **The solver library does not change.** `server/translate.py` turns
    the stored recipe into the `Recipe` the library already takes:
    amounts in each ingredient's own unit, for one portion, one
    `IngredientAmount` per ingredient.

## Data model

All changes are in the server's database, in one Alembic migration.

### `recipes`: new columns

| Column | Type | Notes |
|---|---|---|
| `servings` | integer, ≥ 1 | Default 1. |
| `instructions` | text | May be empty. |
| `source_url` | string | May be empty. |

### `recipe_sections` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Primary key. |
| `recipe_id` | integer | Cascades with the recipe. |
| `position` | integer | From 0. |
| `name` | string | May be empty. |

Every recipe has at least one section. A recipe with one unnamed
section shows no heading, and looks exactly like today's flat list.

### `recipe_items`: new shape

The key changes from (recipe, ingredient) to its own `id`, so one
ingredient can appear on several lines.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Primary key. |
| `section_id` | integer | Cascades with the section. |
| `position` | integer | Order within the section, from 0. |
| `ingredient_id` | integer | Restrict: an ingredient used by a recipe can't be deleted, as today. |
| `amount` | exact number, > 0 | For the whole recipe, in `unit`. |
| `unit` | string | Empty means the ingredient's own unit. |
| `original_text` | string | The source line; may be empty. |

### `ingredient_conversions` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Primary key. |
| `ingredient_id` | integer | Cascades with the ingredient. |
| `unit` | string | Normalized, e.g. `dl`, `st`, `msk`. Unique per ingredient. |
| `factor` | exact number, > 0 | How many of the ingredient's own unit one `unit` makes. |
| `source` | `ai` or `user` | |

A conversion that a recipe line uses can't be deleted (the API answers
409, as for a used ingredient). An ingredient's unit can't be changed
while a recipe line or conversion depends on it; this keeps factors
meaningful.

### Built-in unit steps

A small table in the code, not the database, converts within a
dimension with no stored conversion: g/kg; ml/cl/dl/l; and the Swedish
spoon measures krm (1 ml), tsk (5 ml), msk (15 ml) as volumes. A stored
conversion for a unit wins over a built-in step. Unit names are
normalized when read ("matsked", "msk." → `msk`; "gram" → `g`;
"stycken", "st." → `st`).

### Migration of existing data

Each recipe gets one unnamed section holding its lines in their current
order, `servings` 1, and empty `unit`, `instructions`, `source_url` and
`original_text`. Every existing recipe therefore gives exactly the same
library `Recipe` as before.

### Conversion when a plan is made

For each line: `amount ÷ servings`, then into the ingredient's unit:
directly if `unit` is empty or the ingredient's own unit, else by a
stored conversion, else by a built-in step (to the ingredient's own
unit or to a unit the ingredient has a conversion for). The lines are
then summed per ingredient. Saving a recipe checks that every line
converts, so a plan can't meet a line that doesn't.

## Import flow

### 1. Get the text: `POST /api/recipe-imports`

Body: `{url}` or `{text}`.

- **URL.** The server fetches the page: http and https only; a 10 s
  timeout; at most 2 MB; at most 3 redirects; HTML only. Addresses that
  resolve to private, loopback, link-local (including the Cloud Run
  metadata server) or otherwise internal networks are refused, checked
  on every redirect.
- If the page has schema.org `Recipe` JSON-LD, that is sent on; it is
  shorter and cleaner. Otherwise the page's visible text is sent, with
  scripts, styles and navigation removed. The text is cut to a fixed
  maximum length (set in the plan).
- **Pasted text** is sent as is, with the same maximum.

### 2. Convert: `RecipeConverter.convert(text, catalog) → Draft`

The catalog is each ingredient's name, unit and the units it has
conversions for. The model gets no tools and must answer in a fixed
JSON schema:

- `name`, `servings`, `instructions`
- `sections`: each with `name` and `lines`; each line with
  `original_text`, `amount`, `unit`, `food` (as written),
  `match` (an ingredient name from the catalog, or null) and
  `not_an_ingredient` (for lines like "salt och peppar efter smak").

The recipe's language is kept; nothing is translated.

### 3. Check on the server (no AI)

- `match` must name an existing ingredient, compared ignoring case;
  otherwise the line is unmatched.
- Units are normalized.
- Each matched line gets a status: **own unit**, **built-in step**,
  **stored conversion** or **needs a factor**.

### 4. Suggest factors: `FactorSuggester.suggest(ingredient, unit, food) → number`

A separate step behind the same provider setting, for each line that
needs a factor. It is separate so that a cheaper number-picking model
(such as TypeSafe AI's Jev) can be tried for it alone. It also runs
from `POST /api/recipe-imports/factor` when the user matches a line by
hand on the review screen.

The answer to steps 1–4 is the draft: the recipe fields, and per line
the parsed values, its status, and a suggested factor where needed.

### 5. Save

The ordinary recipe create, extended with the new fields (sections,
units, servings, instructions, source URL, source lines) and a list of
new conversions to create, each with its `source`. One transaction.

### Settings

`AI_PROVIDER` (including `fake` for tests), `AI_MODEL`, the provider's
API key (from Secret Manager in production), and `AI_DAILY_LIMIT`
(default 50 model calls a day; a call over the limit is refused). The
health answer says whether a key is configured.

### Safety

Page text is untrusted. The model has no tools, and its answer is only
a draft the user reviews, so a page that tries to steer the model can
at worst produce a bad draft. The internal-address check keeps fetched
URLs away from Google's internal services.

## Screens

### C1 · Recipes

The round **+** opens a menu: **New recipe**, **Import recipe**.
Import recipe is disabled with "Needs an AI key" when no key is set.

### I1 · Import (`/recipes/import`)

- A **Link** field, or a **Paste text** switch that shows a large text
  box instead.
- **Import** shows "Reading the recipe…" while the server works (about
  5–15 s).
- Errors stay on this page and keep the input (see "Errors").
- On success, opens C2 with the draft.

### C2 · Edit recipe: import review

An unsaved imported recipe opens in the ordinary editor, with:

- A **banner**: "Imported from *site*. *N* lines need you." Tapping it
  goes to the next such line.
- Each line shows its **source line** in small grey text above it.
- An **unmatched** line shows a red **Pick ingredient**: the usual
  picker, its search filled with the food text, plus **+ New
  ingredient**, which opens C4 in a dialog with the name filled in and
  returns with the line matched.
- A line that **needs a factor** shows "1 dl = [100] g ✨" and
  **Accept**. Typing a different number removes ✨; the conversion is
  then saved as `user`.
- A **not an ingredient** line is greyed, with **Add anyway**.
- **Save** is disabled until every line is matched and converts, or is
  skipped. Leaving asks first, as in the other editors.

### C2 · Edit recipe: for all recipes

- **Serves [N]**; amounts are for the whole recipe; the per-portion
  totals divide by N.
- **Sections**: one unnamed section looks like today's list. **+ Add
  section** adds headings; a line's menu moves it to another section.
- **A unit picker per line**: the ingredient's own unit, the built-in
  steps, its conversions (AI ones with ✨), and **New unit…**, which
  adds a `user` conversion.
- **Instructions** (text box) and **Source** (a link, shown when set).

### C4 · Edit ingredient: Conversions

Rows like "1 dl = 100 g ✨", each editable (which makes it `user` and
removes ✨) and deletable (disabled while used, with "Used in *N*
recipes"), and **+ Add conversion**.

✨ always has the tooltip "Suggested by AI, not checked by you".

## Errors

**On I1** (input kept, nothing stored):

| Case | Message |
|---|---|
| Page can't be read: timeout, error status, over 2 MB, not HTML, refused address | "Couldn't read this page. Paste the recipe text instead." |
| Page read, but no recipe found by the model | "No recipe found on this page. Paste the recipe text instead." |
| The AI service fails or times out | "The AI service didn't answer. Try again." |
| The AI answer doesn't fit the schema | One automatic retry, then the message above. |
| Daily limit reached | "Today's import limit is reached." |

**On save** (422 field errors, as elsewhere): a line whose unit doesn't
convert; servings under 1; a factor of 0 or less; two conversions for
one ingredient and unit; an ingredient deleted meanwhile ("No such
ingredient"). Deleting a used conversion answers 409.

## Choosing the model

The first task of the implementation. About 10 real recipes, Swedish
and English, tidy and messy, each with a hand-written expected draft,
kept as test data. A script in `scripts/` runs each candidate model on
them and reports, per model: correct amounts, units, matches, servings
and not-an-ingredient flags, and the cost. It needs real API keys, is
run by hand and is never part of CI. The best model at an acceptable
cost becomes the default `AI_MODEL`. Candidates: Claude Haiku 5.5,
Gemini Flash-Lite, GPT-5.4 nano, Mistral Small; and Jev for factor
suggestions only, if its API takes a numeric answer. Prices are checked
on the providers' own pages at that time.

## Testing

No automated test calls a real AI service or the internet.

- **Server unit tests:** conversion (÷ servings, built-in steps, stored
  conversions, summing per ingredient); unit normalization; checking
  the model's matches; the internal-address check.
- **API tests** with `AI_PROVIDER=fake`, which returns canned drafts,
  broken ones included; page fetching against a stubbed transport
  (JSON-LD page, plain page, too large, refused address, redirect to a
  refused address).
- **Adapters:** each is thin and tested against a recorded response.
- **Migration:** the existing test (all migrations against the models)
  plus a data test: a recipe from before the migration gives the same
  library `Recipe` after it.
- **Web:** component tests for I1, C2's review states, units and
  sections, and C4's conversions. The Playwright flow gets an import
  step using the fake converter.

## Slices

1. **Model comparison:** the script and the test recipes.
2. **Data model, C2 and C4 without AI:** sections, servings, units,
   conversions, instructions, source link. Useful on its own for typing
   in cookbook recipes.
3. **Import:** I1, page fetching, the converter, factor suggestions, and
   C2's review states.

## Not in this spec

Recipe lists; nutrition suggestions from Livsmedelsverket; photo
import; reusable sub-recipes; per-section instructions; bulk import
from datasets or whole sites. All are in `future-features.md`.
