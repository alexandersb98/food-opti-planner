# Recipe Import with AI, Sections, Servings and Unit Conversions

**Status:** Agreed with the user section by section; built (slices R1-R5,
see the master plan). The R1 model comparison still waits for the owner to run
it with real keys, so the default model is provisional.

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
409, as for a used ingredient). An ingredient's unit change converts
its lines in the own unit and its conversions, and is refused for
another category or free text while a conversion or a line in another
unit exists (see "As built in R3").

### Built-in unit steps

A small table in the code, not the database, converts within a
dimension with no stored conversion: g/kg; ml/cl/dl/l; and the Swedish
spoon measures krm (1 ml), tsk (5 ml), msk (15 ml) as volumes. A stored
conversion for a unit wins over a built-in step. Unit names are
normalized when read ("matsked", "msk." → `msk`; "gram" → `g`;
"stycken", "st." → `st`), by the unit catalogue (`server/units.py`),
the one place these rules live.

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

**As built in R5.** Exactly one of `url` and `text` is given (`input_required`,
`one_input_only`). A link that is not http or https with a host, or over 2000
characters, is `url_invalid`; an empty one `url_required`; both before any network
call. Everything found out by looking (user info, port, host name, address,
unreachable, wrong content, too big, too slow, too many redirects) is the one
answer `page_unreadable`, with the same words for an internal address as for a
dead site, so the answer is no probe of the internal network; the reason goes to
the log with the host name only. Only ports 80 and 443 are fetched. The address
tables are one sentence: IPv4 is a deny-list of every special-purpose range
(including CGNAT and the 169.254.0.0/16 metadata range), IPv6 an allow-list of
global unicast minus its special ranges (IPv4-mapped, NAT64 and 6to4 are refused),
and Python's `is_global` must agree; they live in `server/address_policy.py`. Per
hop the fetcher resolves the name once, refuses the hop if any answer is internal,
and connects to the checked address with the name kept in `Host` and the TLS SNI
(no second lookup). The 10 s is a deadline for the whole fetch and 2 MB is 2 MiB,
read in chunks and stopped at the first byte over; compressed bodies are refused.
The JSON-LD route keeps only `name`, `description`, `recipeYield`,
`recipeIngredient`, `recipeInstructions`, `recipeCategory`, `recipeCuisine`,
`inLanguage` and the three times; the visible-text route drops scripts, styles,
navigation, forms and hidden elements. A page with no text is `no_recipe` without a
model call, and the fetch uses none of the daily limit. `source_url` is the last
page's URL without the fragment.

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

`AI_PROVIDER` (including `fake` for tests), `AI_MODEL` (default: the provisional one in
Model comparison), `AI_API_KEY` (the one key variable, holding the key of
whichever provider `AI_PROVIDER` names; from Secret Manager in production), and
`AI_DAILY_LIMIT` (default 50 model calls a day; a call over the limit is
refused). The health answer (`GET /api/health`) says whether the AI is configured,
in `ai_configured`: provider `fake`, or a provider with a key.

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
| Page can't be read: timeout, error status, over 2 MB, not HTML, refused address (`page_unreadable`) | "Couldn't read this page. Paste the recipe text instead." |
| Page read, but no recipe found by the model | "No recipe found on this page. Paste the recipe text instead." |
| The link is empty or isn't http(s) (`url_required`, `url_invalid`) | "Enter the link to the recipe." / "Enter a link that starts with http:// or https://." |
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

## Model comparison

**Status: built, run pending the owner.** Slice R1 built the test data
(`tests/data/recipe_import/`), the `RecipeConverter` and `FactorSuggester`
interfaces, the prompt and JSON schema, one adapter per provider
(Anthropic, Google Gemini, OpenAI, Mistral) over plain HTTP, and
`scripts/compare_models.py`. The run needs real keys and was not made.
The adapters follow the providers' documentation as remembered when the
plan was written and were not checked against the live services, so the
first real run may need small adapter fixes.

**How to run it:**

1. Install `.[server]`.
2. Set the key variables of the providers to try: `ANTHROPIC_API_KEY`,
   `GEMINI_API_KEY`, `OPENAI_API_KEY`, `MISTRAL_API_KEY`.
3. Copy each model's prices from the provider's page on the day into a
   `prices.json`: `{"anthropic:<id>": {"input_per_mtok": 1.0,
   "output_per_mtok": 5.0}}`, USD per million tokens.
4. Run `python3 scripts/compare_models.py --models anthropic:<id>
   gemini:<id> openai:<id> mistral:<id> --prices prices.json --report
   /tmp/report.md --record /tmp/recorded`. It makes about 10 conversion
   calls and 12 factor calls per model and costs real money. Model ids
   are the providers' exact ids, not the display names above.
5. Read the table, decide, and write the result and the default below.
6. If an adapter needed a fix, send the `--record` folder back, so the
   hand-written fixtures in `tests/data/ai_responses/` can be replaced by
   real replies. `--replay DIR` repeats a run from such a folder without
   keys.

**What is scored**, per candidate: for each expected line, whether the
model's paired line has the right amount (within 1 %), unit (after unit
normalisation), match (the catalogue name, or none) and
not-an-ingredient flag; servings per recipe; whether the recipe-free
text got no lines; and whether each suggested factor is within 25 % of
the reference. Model lines are paired with expected lines by similarity
of their original text; lines the model invented are counted but do not
change the percentages. Cost comes from the token counts the providers
return and the prices file. Not scored: section names, recipe names and
the instructions text. The overall figure in the report is a guide for
reading the table, not the decision.

**Provisional default `AI_MODEL`:** provider `anthropic`, model
`claude-sonnet-5-5`. **Provisional:** chosen without a run. R4 ships with
it as the default; replacing it is a change of the setting's default and
of this paragraph. After the run, replace this paragraph with the result
table and the decision. The list above names Claude Haiku 5.5 first and
puts every candidate under a cent per recipe, so a cheaper model may
win; that is what the run decides.

**Not covered:** Jev (TypeSafe AI), for factor suggestions, has no
adapter until its API is known; the `ChatProvider` seam in
`server/ai/chat.py`, or a `FactorSuggester` of its own, is where it goes.
Native schema enforcement per provider is a possible later improvement
if a candidate often gives bad answers.

**Reused by R4:** `server/ai/` as it is. R4 did: the settings, the `fake`
provider, the one retry on a bad answer, the daily limit, and the mapping of
`NoRecipeFound`, `AIServiceError` and `BadAnswerError` to the error messages
above; and the two review follow-ups, every `<` in the recipe text and catalogue
escaped as `&lt;`, and `schema._sane` refusing a tiny exponent as it refuses a
huge one. One `HttpxTransport` is shared by the app and closed at shutdown.
The provisional default model stays as it is until the comparison has been run.

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

## As built in R2

Slice R2 built the data model without units and without AI. Settled
details (the migration is `0014`, the next free number then):

- **API.** A recipe is `{id, name, servings, instructions, source_url,
  sections: [{name, items: [{ingredient_id, amount, original_text}]}],
  extra_tag_ids, ...portion fields, derived_tag_ids, totals}`; `items` of
  the flat shape is gone, with no compatibility shim. A save rebuilds the
  sections and lines, so a line's `id` is not known to the client.
- **Limits.** `servings` is an integer from 1 to 1000. `instructions` at
  most 20000 characters (kept as sent). `source_url` at most 2000
  characters, empty or starting `http://` or `https://` (422 `invalid_url`
  on `source_url`), trimmed. `original_text` at most 500 characters, always
  sent. At most 50 sections and 200 lines per section.
- **Section names** are trimmed, 0 to 100 characters. With more than one
  section every section needs a name (422 `name_required` on
  `sections.{i}.name`); one section may be unnamed. A section may be empty,
  but a recipe needs at least one line (422 `no_items` on `sections`).
- **Planner amounts and totals.** An ingredient's lines are summed exactly,
  then divided once by `servings`; the library still gets one amount per
  ingredient, for one portion. Totals are exact fractions, divided once,
  rounded half away from zero, in the server and in the editor.
- **`recipe_count`** of an ingredient counts distinct recipes. Deleting an
  ingredient a recipe uses is still refused.
- **Downgrade of the migration is lossy:** each ingredient's lines of a
  recipe are summed and divided by `servings`; sections, instructions and
  the source link are dropped.
- **Not in R2:** `recipe_items.unit` and the unit picker per line are R3 (see
  "As built in R3").

## As built in R3

Slice R3 built units on lines and conversions, without AI (migration
`0015`). Settled details:

- **The routing rule** (`server/line_units.py`, mirrored in
  `web/src/lineUnits.ts`), for a line's `unit` and an ingredient with own unit
  `own` and conversions in id order, the first that applies: the unit is empty
  or the same unit as `own` (factor 1); a stored conversion for the same unit
  (its factor: a stored conversion wins over a catalogue step); a catalogue
  step straight to `own`; a catalogue step to the unit of a stored conversion
  (the first reachable) and on by its factor; otherwise the line does not
  convert. The factor is an exact `Fraction`. The "Built-in unit steps"
  table above is replaced by the unit catalogue, as the master plan's overlap 2
  says: the catalogue is the only unit table.
- **A line's unit** is stored in one form: empty for the ingredient's own unit
  (any spelling), a conversion's spelling for its unit, else the catalogue
  spelling. At most 20 characters, optional in the request (default empty). A
  line that does not convert is refused 422 `unit_not_convertible` on
  `sections.{i}.items.{j}.unit`, an energy unit 422 `unit_not_for_ingredient`.
- **Conversions** have their own endpoints, not part of the ingredient's
  `PUT`: `POST /api/ingredients/{id}/conversions`, and `PUT` and `DELETE` on
  `.../conversions/{conversion_id}`. The unit is any catalogue unit but energy,
  or free text; not the ingredient's own unit and not one it has (in any
  spelling): 422 `unit_not_for_ingredient`, `unit_is_own_unit`, `duplicate`.
  A conversion is **used** by a line when the line routes through it; deleting
  a used conversion, or changing its unit, answers 409 (`conversion_in_use` on
  `unit`); its factor can change, which fixes every recipe that uses it.
  Editing makes a conversion `user` only when its unit or factor changes. Every
  ingredient answer carries its `conversions` with `recipe_count`.
- **An ingredient's unit change** converts the lines in the own unit (and
  empties their unit) and every conversion's factor, and leaves lines in other
  units as written. Another category or free text is refused (422
  `unit_has_dependents`, with the counts) while a conversion exists or a line
  has a unit; a conversion for the new unit is refused too (422
  `conversion_for_new_unit`). This replaces "can't be changed while a recipe
  line or conversion depends on it".
- **Not in R3:** AI-suggested factors, the review states and the recipe save
  taking `new_conversions` belong to R4.

## As built in R4

Slice R4 built the import from pasted text (migration `0016`, table `ai_calls`).
Settled details:

- **Text** is 1 to 200 000 characters trimmed (422 `text_required`, `too_long`);
  the model gets the first 20 000, cut before escaping, and `cut` in the answer
  says it happened. Every `<` in the text and in the catalogue names becomes
  `&lt;`, and the prompt says so; no `<` reaches the model but the two tags.
- **Per line, in order:** `not_an_ingredient` (a match is ignored); `match`
  compared with the catalogue names ignoring case and spaces (none is
  `unmatched`; the model's text never creates anything); the unit normalised
  and stored as a recipe line stores it (empty for the own unit; over 20
  characters is cut and `bad_unit`); then the route (`line_units.route`):
  `own_unit`, `stored_conversion`, `built_in_step`, `needs_factor`, and an
  energy unit is `bad_unit`. The banner counts `unmatched`, `needs_factor` and
  `bad_unit` as `needs_you`.
- **Cleaning:** amounts rounded half up to 6 decimals (0 or 10^9 and over is a
  bad answer); name cut to 100, instructions to 20 000, `original_text` to 500,
  `food` to 200; empty sections dropped; with several sections an unnamed one
  is "Section n"; over 50 sections or 200 lines in one is a bad answer.
- **Factors:** one suggestion per distinct ingredient and unit among the
  `needs_factor` lines, at most 15 an import, none for the rest; a failed one is
  left empty and an outage or the limit stops the rest. `POST
  /api/recipe-imports/factor` does the same for one line matched by hand.
- **Retry and limit:** a bad answer (and an amount out of range) is retried
  once, an outage is not; the daily limit counts model calls (UTC day), also
  failed ones, and a refused factor call inside an import just leaves the
  factor out.
- **Errors**, all in the `FieldErrors` shape with fixed sentences, never the
  provider's text: 422 `text_required`, `too_long`, `no_recipe` ("No recipe
  found in this text."), 429 `limit_reached`, 502 `ai_failed`, 503
  `ai_not_configured`.
- **Saving** takes `new_conversions` (`ingredient_id`, `unit`, `factor`,
  `source` `ai` or `user`), validated as the conversion endpoints validate and
  created in the same transaction before the lines are routed.
- **The fake provider** (`AI_PROVIDER=fake`) answers a canned porridge draft; the
  sentinels `[fake:none]`, `[fake:broken]`, `[fake:broken-once]` and
  `[fake:down]` in the text pick failures.

## Slices

1. **Model comparison:** the script and the test recipes (built; run
   pending, see Model comparison).
2. **Data model, C2 and C4 without AI:** built as R2 (sections,
   servings, instructions, source link) and R3 (units, conversions, the
   unit picker per line). R2 alone is useful for typing in cookbook
   recipes.
3. **Import from pasted text:** built as R4 (I1, the converter, factor
   suggestions, C2's review states). **Import from a link:** built as R5
   (page fetching and the `url` input).

## Not in this spec

Recipe lists; nutrition suggestions from Livsmedelsverket; photo
import; reusable sub-recipes; per-section instructions; bulk import
from datasets or whole sites. All are in `future-features.md`.
