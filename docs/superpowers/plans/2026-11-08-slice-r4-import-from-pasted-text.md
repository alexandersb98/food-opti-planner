# Slice R4 — Import from Pasted Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** Recipes can be imported by AI from pasted text. On C1 the round **+**
opens a menu (**New recipe**, **Import recipe**; Import is disabled with "Needs
an AI key" when none is set). I1 (`/recipes/import`) has a paste box and
**Import**; the server asks the configured model for a draft, checks it without
AI (matches against the user's own ingredients, unit spellings, a status per
line), asks for a conversion factor where a line needs one, and answers the
draft. C2 opens it as an unsaved recipe in the review state: a banner counting
the lines that need the user, the source line above each line, **Pick
ingredient** (with **+ New ingredient** in a dialog) for unmatched lines, "1 dl =
[100] g ✨ **Accept**" for lines that need a factor, greyed not-an-ingredient
lines with **Add anyway**, and **Save** disabled until every line is matched and
converts, or is skipped. Saving also creates the accepted conversions, with
their `source` (`ai` or `user`), in the same transaction. Settings `AI_PROVIDER`
(with `fake`), `AI_MODEL` (provisional default `claude-sonnet-5-5`), `AI_API_KEY`,
`AI_DAILY_LIMIT`; the health answer says whether the AI is configured;
`docs/deploy.md` gains the secret. Nothing is stored until Save.

**Architecture:** R1's `server/ai/` is reused as it is, plus three small changes
(Task 1): a `fake` provider (a `ChatProvider` that answers canned JSON, so the
real prompt, parser, retry and limit all run in API and e2e tests), the two R1
review follow-ups (escape every `<` in the recipe body; bound negative exponents
in `schema._sane`), and `build_chat` creating no HTTP transport for `fake`. Four
new server modules, each one job:

- `server/ai_runtime.py` (`AIRuntime`): built once per app from the settings; owns
  the one shared `HttpxTransport` and the one `ChatProvider` built over it, and
  closes the transport at shutdown (`KeyScrubbingTransport` hides `close()`, so the
  runtime keeps its own reference to the transport it made). `configured` says
  whether import can run.
- `server/ai_usage.py`: the daily limit. A table `ai_calls(day, calls)`;
  `reserve(engine, limit)` adds one call atomically or raises `DailyLimitReached`;
  `LimitedChat` wraps a `ChatProvider` and reserves before every call.
- `server/recipe_import.py` (no FastAPI): `import_recipe(db, text, converter,
  suggester) -> ImportedDraft`: the catalogue from the database, the AI step with
  one retry, the checks and statuses of the import spec's step 3, the factor
  suggestions of step 4 (one per distinct ingredient and unit, capped).
- `server/api/recipe_imports.py`: `POST /api/recipe-imports` (`{text}`) and
  `POST /api/recipe-imports/factor`, errors in the `FieldErrors` shape.

The recipe save (`api/recipes.py`) gains `new_conversions`. The web app gets a
module-level hand-off (`importDraft.ts`: I1 puts the draft there, C2 takes it), a
pure review module (`importReview.ts`: each line's state from the draft and the
catalogue, mirroring R3's `lineFactor`), `AddMenuButton`, `ImportPage` (I1), and
review pieces in `RecipePage` (banner, `ImportLineReview`, a dialog around the
ingredient form).

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, httpx (already in the `server` extra
since R1); Vue 3, Quasar, vue-i18n, Vitest, Playwright.

**Specs:** the import spec
[`2026-11-07-recipe-import-design.md`](../specs/2026-11-07-recipe-import-design.md)
(decisions 1 to 8; "Import flow" steps 1 (pasted text only), 2, 3, 4 and 5;
"Settings"; "Safety"; "Screens" C1, I1, C2 import review; "Errors"; "Model
comparison", whose provisional default and "Reused by R4" this slice follows); the
master plan's R4 entry
([`2026-11-08-units-sources-import-slices.md`](2026-11-08-units-sources-import-slices.md));
R1's plan ([`2026-11-08-slice-r1-model-comparison.md`](2026-11-08-slice-r1-model-comparison.md),
built; `server/ai/` as it is) and its review follow-ups; R2 and R3's plans
([`-r2-servings-sections-instructions.md`](2026-11-08-slice-r2-servings-sections-instructions.md),
[`-r3-line-units-and-conversions.md`](2026-11-08-slice-r3-line-units-and-conversions.md);
planned, built before this slice: sections, `original_text`, `servings`,
`recipe_items.unit`, `ingredient_conversions`, `server/line_units.py`,
`LineUnitPicker`, `ConversionDialog`, `lineUnits.ts`). Not in this slice: the
`url` input, page fetching, JSON-LD, the internal-address check, the "Couldn't
read this page" message, the site name in the banner (all R5).

**Status:** Planned; to be built task by task on branch
claude/implement-remaining-slices-qwrp83.

## Global Constraints

- `meal_planner/` is not changed.
- One Alembic migration (Task 2; table `ai_calls`). Its number is the next free
  one **at build time** (D-slices and R2/R3 take `0010` onward; run `alembic
  heads` first and set `down_revision` to the real head, which must be R3's
  migration; if R3 is not built, stop: this slice needs R2 and R3). The migration
  test stays green; no `ALTER ... DROP/ALTER COLUMN`.
- **No test calls the internet or a real AI service.** Server tests use the
  `fake` provider, or a real adapter over a fake `Transport` returning a hand-made
  reply in the provider's shape (`tests/data/ai_responses/` has the shapes); the
  web tests use the fake server; e2e runs the server with `AI_PROVIDER=fake`.
- **Page text is untrusted** (spec "Safety"): the model gets no tools, its answer
  is a draft, it creates nothing by itself (an invented `match` is just an
  unmatched line; nothing is written until the user presses Save), and every `<` in
  the recipe text and the catalogue names is escaped (Task 1).
- **The API key never leaves the server and is never logged or echoed.** No
  response body or log line contains provider error text or the key; the API
  answers its own fixed messages (Task 3, a test pins it).
- All GUI text goes through vue-i18n, English file only (`web/src/i18n/en.json`).
- After each task that changes the API (Tasks 2, 3, 4): `npm run gen:api` in `web/`
  (`web/openapi.json`, `web/src/api/schema.ts`; `web/src/test-units.json` must come
  out unchanged), then fix factories in `web/src/test-data.ts` so `npm run
  typecheck` stays green.
- The Playwright flow gets a step (Task 8) and CI's e2e container gets
  `AI_PROVIDER=fake`.
- Checks before each commit: `python3 -m pytest -q` at the root; `npm run lint`,
  `npm run typecheck`, `npm test` in `web/`. On the last server task (4) also
  `TEST_DATABASE_URL="postgresql+psycopg://postgres@localhost:5433/planner_test" python3 -m pytest -q tests/server`
  (not at the same time as another run).
- **Built after R2 and R3. This plan was written when neither was built.** It names
  functions, tests, i18n keys and files by their planned names, never line numbers.
  **Before each task, re-read the built code it touches** (`server/api/recipes.py`,
  `server/api/conversions.py`, `server/conversions.py`, `server/line_units.py`,
  `server/models.py`, `tests/server/conftest.py`, `web/src/composables/useRecipeDraft.ts`,
  `web/src/lineUnits.ts`, `RecipePage.vue`, `RecipeSection.vue`, `LineUnitPicker.vue`,
  `ConversionDialog.vue`, `web/src/test-data.ts`, `web/src/test-app.ts`, the e2e
  flow's last steps and the state they leave). Where this plan and the built code
  disagree on a name, the code wins; on a behaviour, the plan wins.
- **Do first (separate commit, before Task 1):** the refactoring in
  `.superpowers/sdd/2026-11-08-units-sources-import-slices/r4-refactor.md` (extract
  the ingredient form from the ingredient page), if the controller has it done by
  then. Task 7 says what to do either way.

## Interpretations made in this plan

1. **Settings.** `AI_PROVIDER` (default `anthropic`; one of R1's adapters or
   `fake`; empty means "no AI", import disabled), `AI_MODEL` (default
   `claude-sonnet-5-5`, **provisional**, see the import spec's Model comparison),
   `AI_DAILY_LIMIT` (default 50, a whole number from 0; 0 refuses every call) and
   **`AI_API_KEY`**, one generic variable holding the key of whichever provider
   `AI_PROVIDER` names. (R1's per-provider `ANTHROPIC_API_KEY` etc. stay what the
   comparison script reads; the app takes one key because it runs one provider.
   This keeps the deploy to a single secret.) An unknown provider name or a bad
   limit stops the app at startup with a message naming the known providers, as the
   login settings do. **Configured** means: provider `fake`, or a provider with a
   non-empty key. The default model id is the only model id in the code; prices stay
   out.
2. **Health.** `GET /api/health` answers `{database, ai_configured}`. It stays
   open (as now); it says nothing about the provider or model, only whether import
   can run. The web app reads it on C1 and I1.
3. **The daily limit counts model calls, not imports** (spec: "50 model calls a
   day; a call over the limit is refused"): the conversion call, the retry of a bad
   answer, and each factor call each count; a call that fails still counts (it may
   cost). The day is the UTC date. The reservation is one atomic `UPDATE ... WHERE
   calls < limit` (insert the day's row if missing) on its own short transaction,
   independent of the request's session, so a refused or failed import does not give
   the call back. The convert call over the limit answers 429 `limit_reached`
   ("Today's import limit is reached."); a factor call over the limit inside an
   import just leaves that factor unsuggested (the draft is still returned); the
   by-hand factor endpoint answers 429.
4. **The retry.** A `BadAnswerError` from the converter (not JSON, wrong shape, an
   amount out of range) is retried once with the same input, then answers 502
   `ai_failed`. An `AIServiceError` (timeout, HTTP error) is **not** retried (spec:
   only a bad answer). `NoRecipeFound` is not retried: 422 `no_recipe`. Factor
   calls follow the same two rules with their own retry; a factor that still fails
   is `null` for that line, never an error for the import.
5. **Error answers all use the `FieldErrors` shape**
   (`{"detail": [{"loc": [...], "type": ..., "msg": ...}]}`), so the app reads them
   with one helper. Types: `text_required` and `too_long` (422, `loc` `["body",
   "text"]`), `no_recipe` (422, same loc), `limit_reached` (429, `["body"]`),
   `ai_failed` (502, `["body"]`), `ai_not_configured` (503, `["body"]`). `msg` is a
   fixed English sentence written here; provider text never appears.
6. **Messages on I1** (spec "Errors"). "Page can't be read" is R5's. For pasted text
   the no-recipe message reads "No recipe found in this text." (the spec's wording
   says "on this page", which is wrong for pasted text; R5 keeps the spec's message
   for the link input). `ai_failed`: "The AI service didn't answer. Try again."
   `limit_reached`: "Today's import limit is reached." `ai_not_configured`:
   "Needs an AI key." `text_required`: "Paste the recipe text first." `too_long`:
   "That is too much text. Paste only the recipe."
7. **Text limits.** The request's `text` is 1 to 200 000 characters after trimming
   (a bigger paste is a 422 `too_long`, an empty one `text_required`). The model gets
   the first `MAX_TEXT_CHARS` (20 000) characters, cut **before** escaping (so the
   limit is on the user's text; escaping can make the body longer, up to 4 times for
   a text of only `<`), and the answer's `cut` says it happened (the banner then says
   "The text was long: the end was left out.").
8. **Escaping.** Every `<` in the recipe body and in the catalogue lines becomes
   `&lt;` (R1 review follow-up; R5 feeds attacker pages). No `&` is escaped, so
   there is no unescape and `original_text` shows `&lt;` only if the text had a `<`
   (the prompt tells the model to write `<` in its answer). The old tag-stripping loop
   goes: after escaping, no `<` can reach the model except the two tags the prompt
   adds itself.
9. **Negative exponents** (R1 review follow-up): `schema._sane` also refuses a
   non-zero number whose exponent is below `-MAX_DIGITS` (12), so `1e-999999999`
   from a model never reaches arithmetic (the limit above was only for large ones).
10. **What the server checks and answers per line** (spec step 3), in this order:
    1. `not_an_ingredient` true: status `not_an_ingredient`, `ingredient_id` null
       (a `match` on such a line is ignored), amount may be null.
    2. `match` compared with the catalogue names ignoring case and surrounding
       spaces (first ingredient by id on a tie): none is `unmatched`, `ingredient_id`
       null. The model's `match` text is never used to create anything.
    3. The unit is normalised (`units.normalise`; the catalogue spelling or the text
       trimmed), then made canonical for the ingredient as R3 stores a line's unit
       (`conversions.canonical_unit`: `""` for the ingredient's own unit in any
       spelling, the stored conversion's spelling, else the normalised unit). More
       than 20 characters is cut to 20 and is `bad_unit`.
    4. The route (`line_units.route` over the ingredient's stored conversions, R3's
       rule): `own_unit` (empty or the same unit), `stored_conversion` (through a
       stored conversion, directly or after a catalogue step), `built_in_step` (a
       catalogue step straight to the own unit), `needs_factor` (does not route).
       An energy unit is `bad_unit` (it can never route and a conversion for it is
       refused).
    Statuses: `unmatched`, `not_an_ingredient`, `own_unit`, `built_in_step`,
    `stored_conversion`, `needs_factor`, `bad_unit`. **`needs_you`** counts
    `unmatched`, `needs_factor` and `bad_unit` lines.
11. **Amounts** are rounded half up to 6 decimals (the `Number` limit). A rounded
    amount of 0, or 10^9 and above (more than 9 digits before the point), makes the
    whole answer a bad answer (retry, then `ai_failed`): the prompt already asks for
    an amount above 0, so this is a model error, not a case to repair. Servings are
    already 1 to 1000 (`parse_draft`).
12. **Cleaning the draft** so the editor can save it as it stands: the recipe name
    is trimmed and cut to 100 characters (a name that ends up empty is left empty:
    Save refuses it as for a hand-made recipe); `instructions` cut to 20 000;
    `original_text` cut to 500; `food` cut to 200 (display only); section names
    trimmed and cut to 100; a section with no lines is dropped (never all of them:
    that is `no_recipe`); when more than one section is left, an unnamed one is
    called "Section {n}" (its 1-based position among the kept ones), because R2
    requires every section of a multi-section recipe to be named; more than 50
    sections or 200 lines in one section is a bad answer. `source_url` is `""` (R5
    fills it).
13. **Factor suggestions** (spec step 4). One `FactorSuggester.suggest` call per
    distinct (ingredient id, canonical unit compared ignoring case) among the
    `needs_factor` lines, with the first such line's `food`; **at most 15 per
    import** (cost bound; the rest are `null`, typed by hand). The answer is rounded
    to 6 decimals; a result of 0 or over 10^9 is `null`. A provider outage or the
    limit stops the remaining suggestions (no hammering) and leaves them `null`.
    `suggested_factor` is on every line of that (ingredient, unit), as a string.
    The by-hand endpoint does the same call for one ingredient and unit (no cap).
14. **The factor means** "how many of the ingredient's own unit one `unit` makes"
    (R3, import spec decision 7); the prompt R1 wrote already says so.
15. **Saving takes `new_conversions`** (`[{ingredient_id, unit, factor, source:
    "ai" | "user"}]`, default `[]`). They are validated as the conversion endpoints
    validate (R3: energy unit, the ingredient's own unit, a duplicate of a stored
    conversion or of another entry, number limits), created in the same transaction
    **before** the lines are routed, so a line may use one; errors are 422 on
    `new_conversions.{i}.unit` / `.factor` / `.ingredient_id`. If any line or
    conversion is refused nothing is written. A conversion no line uses is still
    created (the client sends only used ones).
16. **Hand-off from I1 to C2** is an in-memory module (`web/src/importDraft.ts`),
    not the URL and not the server: I1 sets the answer, pushes `/recipes/new`, C2
    takes it (and clears it) when its page is created. A reload of C2 therefore opens
    an empty new recipe, which is consistent with "nothing is stored until Save".
17. **Review state is derived on the client** from the draft's lines, the loaded
    ingredients (with their stored conversions) and the pending conversions, with
    R3's `lineFactor`, so matching a line by hand, changing its unit or accepting a
    factor changes its state at once without a server call. The server's `status` is
    the first classification and what the tests check; the app uses it only to
    start `skipped` for `not_an_ingredient` lines. A line is in one of: `ready`,
    `skipped`, `unmatched`, `needs_factor`, `bad_unit`; the banner counts the last
    three.
18. **Factor row** (spec: "1 dl = [100] g ✨ Accept"). Shown on a `needs_factor` line
    for its (ingredient, unit); one input shared by all lines of that pair. It starts
    with the suggestion (✨ while the text equals it, tooltip "Suggested by AI, not
    checked by you"), or empty when there is none. **Accept** registers a pending
    conversion with source `ai` when the text still equals the suggestion, else
    `user` (the spec's "typing a different number removes ✨; the conversion is then
    saved as user"). Accept needs a number above 0 with at most 9 digits before the
    point and 6 after. After Accept the row reads "1 dl = 100 g ✨" with **Change**.
    A line matched by hand asks `POST /api/recipe-imports/factor` for its
    suggestion (the row shows "Suggesting…" while it waits; a failure just leaves the
    box empty). Pending conversions go into `new_conversions` on Save, only those a
    kept (non-skipped) line still uses.
19. **Skipping.** A `not_an_ingredient` line starts skipped (greyed, **Add anyway**).
    Any other line that is not ready gets **Skip** (the spec's "or is skipped"), so
    one stubborn line never blocks Save. Skipped lines are not sent. **Add anyway**
    makes a skipped line an ordinary line (unmatched, with an empty amount to type
    when it had none); **Add back** does the same for one the user skipped.
20. **Pick ingredient** opens R2's `IngredientPicker` with its search filled with
    the line's `food` (a new optional `initialSearch` prop); picking sets the line's
    ingredient and unit stays as imported. **+ New ingredient** (a button in the
    picker's footer, new `allowNew` prop) opens the ingredient form in a dialog with
    the name filled with `food` (first letter capitalised; the user edits it), whose
    save closes the dialog, adds the ingredient to the page's list and matches the
    line. The dialog is the ordinary C4 form for a new ingredient (the refactoring
    extracts it; no delete, no unit-change flow, no conversions card: a new
    ingredient has none).
21. **Leaving an imported draft asks first** (spec; the other editors do not ask
    today, so this is added for the imported draft only): leaving C2 for another
    route while an imported draft is unsaved opens "Discard this recipe?" (**Keep
    editing** / **Discard**); closing the tab asks through `beforeunload`. A save
    sets a flag so its own navigation is not stopped.
22. **C1's menu.** The fab opens a menu with two items, **New recipe** (link to
    `/recipes/new`) and **Import recipe** (link to `/recipes/import`; disabled with
    the caption "Needs an AI key" when `ai_configured` is false or health could not
    be read). The fab's `aria-label` is "Add recipe". C3's plain `AddButton` is
    unchanged. I1 opened by URL with no key shows the same hint and a disabled
    **Import**.
23. **What the banner says** (no site until R5): "Imported from pasted text. {n} lines
    need you." (plural by n; "All lines are ready." for 0). Tapping it scrolls to the
    next line that needs the user, cycling.
24. **The fake provider** (`server/ai/providers/fake.py`) is a `ChatProvider` for
    tests and e2e; production never sets it. Conversion: a canned English draft
    ("Imported porridge", servings 2, instructions two lines, one unnamed section
    of four lines: `100 g oats`, `3 dl milk`, `2 tbsp honey` and `salt and pepper
    to taste` as not-an-ingredient), each `match` being the catalogue entry whose
    name equals the line's food ignoring case, else null; the catalogue is read back
    from the prompt. Sentinels in the pasted text pick the broken variants:
    `[fake:none]` (no sections), `[fake:broken]` (not JSON, always),
    `[fake:broken-once]` (not JSON the first time that text is seen by this
    instance, then fine), `[fake:down]` (`AIServiceError(503)`). Factor: always
    `{"factor": 50}`, except a food containing `bad` (not JSON) or `down`
    (`AIServiceError`). Token counts are `len // 4`. Documented in the module
    docstring.
25. **One transport.** `AIRuntime` creates a single `HttpxTransport` (the app's
    timeout setting is R1's default, 60 s) when the provider is not `fake`, builds
    the chat once over it (the same chat serves the converter and the factor
    suggester), and `close()`s the transport in the app's shutdown. `create_app` takes
    an optional `ai_transport` for tests; the runtime takes ownership of whatever it
    holds and closes it.
26. **Logging.** Each import logs one INFO line from the route: number of calls and
    input and output tokens (from R1's `MeteredChat`), never text, the key or the
    model's answer. Failures log the exception class and status only.

## Tasks

### Task 1: AI package: follow-ups and the fake provider

**Files:** modify `server/ai/prompts.py`, `server/ai/schema.py`,
`server/ai/providers/__init__.py`, `server/ai/errors.py` (no change expected);
create `server/ai/providers/fake.py`; modify `tests/server/test_ai_converter.py`,
`tests/server/test_ai_schema.py`, `tests/server/test_ai_providers.py`; create
`tests/server/test_ai_fake.py`.

**Build:**

- `prompts.convert_user`: cut the text to `MAX_TEXT_CHARS`, then replace every `<`
  with `&lt;` in the body and in each catalogue line (name and conversion units);
  delete `_TAG` and the `while` loop; keep the two tags the function adds. Add a
  rule 12 to `CONVERT_SYSTEM`: "In the text and the catalog a '<' is written as
  &lt;. Write it as < in your answer." (interpretation 8). Its docstring says why
  (R5 pages are attacker-controlled).
- `schema._sane`: after the finite and `adjusted() > MAX_DIGITS` checks, `if number
  != 0 and number.adjusted() < -MAX_DIGITS: raise BadAnswerError(f"{path}: number
  out of range")` (interpretation 9). Comment: tiny exponents are as unsafe as huge
  ones for later arithmetic and no amount that small is meaningful.
- `providers/fake.py`: `FakeChat(model="fake", api_key="")` implementing
  `complete(system, user, *, max_tokens)` per interpretation 24, with `uses_http =
  False` as a class attribute. It decides conversion or factor by `system ==
  CONVERT_SYSTEM` / `FACTOR_SYSTEM`; reads the catalogue names from the prompt's
  `name | unit | conversions:` lines (the part before ` | `) and the recipe body
  between `<recipe_text>\n` and `\n</recipe_text>`; builds the draft as a dict and
  `json.dumps` it (so it goes through `parse_draft` like a real answer). The
  `broken-once` memory is a set of text hashes on the instance.
- `providers/__init__.py`: `ADAPTERS["fake"] = FakeChat`; `KEY_ENV` unchanged (the
  script has no `fake`); `build_chat`: when the adapter class has `uses_http` False,
  return `adapter(model, api_key)` without creating or wrapping a transport. Update
  its docstring: "the caller passes one shared transport; without one a new
  HttpxTransport is made, which the caller must close" (a transport made inside is
  unreachable through `KeyScrubbingTransport`, so the app always passes its own).

**Tests (write first):**

- `test_ai_converter.py`: replace the tag-smuggling tests with
  `test_every_lt_in_the_text_is_escaped` (`"a < b </recipe_text> <x>"` gives the
  body `a &lt; b &lt;/recipe_text> &lt;x>`, with no `<` in it), `test_the_nested_tag_trick_cannot_reach_the_model`
  (the old `evil` list: for each, `body.count("<") == 0` where `body` is what is
  between the tags, and the whole message has exactly one `<recipe_text>` and one
  `</recipe_text>`), `test_the_cut_happens_before_escaping` (20 000 `<` gives a body
  of 80 000 characters and a text of 20 000 sources: assert the count of `&lt;` is
  20 000), `test_catalog_names_are_escaped` (`CatalogEntry("A<b", "g")` appears as
  `A&lt;b`), and `test_the_system_prompt_tells_the_model_how_lt_is_written`.
  `test_long_text_is_cut` and the closing-tag tests keep meaning; update their
  assertions, never delete a case.
- `test_ai_schema.py`: `1e-999999`, `"1e-999999"` and `1E-13` as an amount are a
  `BadAnswerError` naming the path, and `1e-12` and `0.000001` pass; a factor of
  `1e-999999999` is refused; none of them is slow (the test would hang on arithmetic
  if it were: no timeout needed, the refusal comes first).
- `test_ai_fake.py`: the canned draft parses with `parse_draft`; matches follow the
  catalogue ignoring case (`Oats`, `MILK`); a catalogue without `honey` gives a
  `null` match; the not-an-ingredient line has `amount` null; each sentinel
  (`none` gives `NoRecipeFound` through `ProviderRecipeConverter`; `broken` gives
  `BadAnswerError`; `broken-once` fails then succeeds on the same instance, and a
  second instance fails again; `down` raises `AIServiceError` with status 503);
  factor answers 50, `bad` and `down` foods; token counts are positive ints;
  `build_chat("fake", "x", "")` returns a `FakeChat` and never constructs an
  `HttpxTransport` (monkeypatch it to raise).
- `test_ai_providers.py`: `build_chat` of a real provider with a given transport
  still wraps it in the key scrubber and uses that transport (existing assertions
  stay).

**Verify:** `python3 -m pytest tests/server/test_ai_converter.py
tests/server/test_ai_schema.py tests/server/test_ai_providers.py
tests/server/test_ai_fake.py tests/scripts -q` (the comparison script's tests
import the prompts: they must still pass), then the whole suite.

**Commit:** "server: ai: escape < in recipe text, bound tiny exponents, fake provider".

### Task 2: Server: settings, runtime, daily limit, health

**Files:** create `server/ai_runtime.py`, `server/ai_usage.py`,
`server/migrations/versions/<next>_ai_calls.py`, `tests/server/test_ai_usage.py`,
`tests/server/test_ai_runtime.py`; modify `server/settings.py`, `server/app.py`,
`server/models.py`, `server/api/health.py`, `tests/server/conftest.py`,
`tests/server/test_settings.py`, `tests/server/test_health.py`,
`tests/server/test_migrations.py` (only if the model-matches test needs the new
table named).

**Build:**

- `settings.py`: new fields `ai_provider: str = "anthropic"`, `ai_model: str =
  DEFAULT_AI_MODEL` (constant `"claude-sonnet-5-5"`, comment: provisional, see the
  import spec), `ai_api_key: str = ""`, `ai_daily_limit: int = 50`; `from_env` reads
  `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` and `AI_DAILY_LIMIT` (a non-integer or
  negative value raises `ValueError("AI_DAILY_LIMIT must be a whole number, 0 or
  more")`). `Settings` stays frozen; the key is excluded from the dataclass `repr`
  (`field(repr=False)`) so it can't land in a log or traceback.
- `models.py`: `AICallCount(day: date primary key, calls: int)` table `ai_calls`;
  add to `__all__`. Migration creates it (explicit primary key name as the
  neighbouring migrations do); downgrade drops it.
- `ai_usage.py`: `class DailyLimitReached(Exception)`; `today() -> date` (UTC;
  tests monkeypatch it); `reserve(engine, limit) -> None` implementing
  interpretation 3: in one `engine.begin()`, `UPDATE ai_calls SET calls = calls + 1
  WHERE day = :d AND calls < :limit`; rowcount 1 returns; else if the row exists
  (`SELECT`) the limit is reached: raise; else `INSERT (day, 1)` when `limit >= 1`
  (a `limit` of 0 raises first) and on `IntegrityError` (another request inserted
  it first) repeat the update once. `class LimitedChat(inner, engine, limit)`
  with `complete(...)` that calls `reserve` then `inner.complete`. No FastAPI, no
  ORM session of the request.
- `ai_runtime.py`: `class AIRuntime(settings, transport=None)`: validates the
  provider (`UnknownProviderError` becomes `ValueError` with the known names plus
  `fake`; the empty name means disabled) and the limit; `configured` per
  interpretation 1; when configured and not `fake`, keeps `self.transport = transport
  or HttpxTransport()` and `self.chat = build_chat(provider, model, key,
  self.transport)`; for `fake`, `self.chat = build_chat("fake", model, "")` and no
  transport (a transport passed anyway is still closed); `converter(chat)` /
  `suggester(chat)` return `ProviderRecipeConverter` / `ProviderFactorSuggester`
  over a given chat; `limited(engine)` returns `MeteredChat(LimitedChat(self.chat,
  engine, limit))`, or raises `NotConfigured`; `close()` closes the transport
  once (idempotent). `NotConfigured` lives here.
- `app.py`: `create_app(settings=None, *, ai_transport=None)` builds
  `app.state.ai = AIRuntime(settings, ai_transport)` (a bad AI setting stops the app
  like a bad login setting) and calls `app.state.ai.close()` in the lifespan after
  `yield`, before the engine is disposed.
- `api/health.py`: `Health` gains `ai_configured: bool` (from `request.app.state.ai`),
  in both the 200 and the 503 answers.
- `conftest.py`: `logged_in_client(..., **settings)` already forwards settings; add
  a `ai_transport=None` pass-through to `create_app`, so a test can inject one; add
  the helper `anthropic_reply(answer)` building an Anthropic-shaped reply (see
  `tests/data/ai_responses/`) from a draft dict or a raw string, and a
  `ScriptedTransport` class (a `Transport` with a list of replies or exceptions in
  order, recording every request body, with `close()` counting its calls).

**Tests (write first):**

- `test_settings.py`: defaults (anthropic, `claude-sonnet-5-5`, "", 50); each
  variable read from the environment; `AI_DAILY_LIMIT` of `abc` and `-1` raise; the
  key does not appear in `repr(settings)`; `create_app` with provider `nonsense`
  raises `ValueError` naming `anthropic` and `fake`; provider `""` creates an app
  that is not configured.
- `test_ai_usage.py` (SQLite file engine, `migrate`d, as other db tests): the first
  `limit` reservations pass and the next raises; a new day (monkeypatched `today`)
  starts again at 0; `limit` 0 raises at once and writes no row; counts persist
  across two engines on the same database; `LimitedChat` calls the inner chat only
  after a successful reservation, and a refused reservation never calls it; a failing
  inner call still counts.
- `test_ai_runtime.py`: not configured without a key (provider `anthropic`, key
  ""), configured with a key, configured with `fake` and no key, not configured with
  provider ""; `limited()` raises `NotConfigured` when not configured; one
  `HttpxTransport` is constructed per runtime however many `limited()` chats are
  made (monkeypatch the class with a counter) and `close()` closes it once, twice
  safe; a transport passed in is the one used (a `ScriptedTransport` sees the request
  body of a call through `limited()` with the key in the header and the model id in
  the body) and is closed by `close()`; `create_app` closes it at shutdown (the
  `TestClient` context exit; assert `closed == 1`).
- `test_health.py`: `{"database": True, "ai_configured": False}` by default,
  `True` with `ai_provider="fake"`, `True` with a key, and the 503 answer carries
  `ai_configured` too; update the two existing equality assertions.
- `test_migrations.py`: the model-matches test passes with `ai_calls` (no new test
  unless the file lists tables by name).

**Then:** `cd web && npm run gen:api`; add `ai_configured: true` to any health
fixture in the web tests that spells one out (grep `database: true`).

**Verify:** `python3 -m pytest -q`; the migration and usage tests on Postgres too
(`TEST_DATABASE_URL`).

**Commit:** "server: AI settings, shared transport, daily limit, health says if configured; migration <n>".

### Task 3: Server: the import service and `/api/recipe-imports`

**Files:** create `server/recipe_import.py`, `server/api/recipe_imports.py`,
`tests/server/test_recipe_imports.py`, `tests/server/test_recipe_import_service.py`;
modify `server/api/__init__.py` (the router goes in `protected`, after `recipes`),
`tests/server/conftest.py` (a `ai_client` fixture).

**Build `server/recipe_import.py`** (no FastAPI; takes a `Session`, a
`RecipeConverter` and a `FactorSuggester`):

- Dataclasses `ImportedLine(original_text, food, amount: Decimal | None, unit,
  ingredient_id: int | None, status: str, suggested_factor: Decimal | None)`,
  `ImportedSection(name, lines)`, `ImportedDraft(name, servings, instructions,
  source_url, cut, needs_you, sections)`; the status names are constants (a
  `Literal`) shared with the API.
- `catalogue(db) -> list[tuple[models.Ingredient, CatalogEntry]]`: every ingredient
  by id with `CatalogEntry(name, unit, tuple(conversion units))` (conversions from
  `ingredient.conversions`; load them with `selectinload`).
- `convert_with_retry(converter, text, catalog)`: one retry on `BadAnswerError`
  (interpretation 4); other errors pass through.
- `check(draft: Draft, ingredients) -> list[ImportedSection]`: interpretations 10, 11
  and 12 (matching, unit canonicalising through `conversions.canonical_unit`, the
  status from `line_units.route`, rounding, cleaning). Pure over the draft and the
  loaded ingredients, so it is tested without a model.
- `suggest_factors(sections, ingredients, suggester) -> None`: interpretation 13
  (distinct pairs, the cap `MAX_FACTOR_SUGGESTIONS = 15`, the retry, stopping on a
  provider outage or `DailyLimitReached`), filling `suggested_factor` on every line
  of a pair. Takes the exceptions to stop on from `ai_usage` and `server.ai.errors`.
- `import_recipe(db, text, converter, suggester) -> ImportedDraft` ties them:
  cut to `MAX_TEXT_CHARS` for `cut` (compare lengths of the trimmed text; the prompt
  builder cuts again, harmlessly), catalogue, convert, check, suggest, count
  `needs_you`. `NoRecipeFound` and `BadAnswerError` (after the retry) and
  `AIServiceError` and `DailyLimitReached` pass out for the route to map.
- `suggest_one(db, ingredient_id, unit, food, suggester) -> Decimal`: the by-hand
  factor, with the retry; raises `BadAnswerError` or `AIServiceError` or
  `DailyLimitReached`.

**Build `api/recipe_imports.py`** (`router = APIRouter(prefix="/recipe-imports",
tags=["recipe imports"])`):

- Models: `RecipeImportRequest {text: str}` (max length 200 000 checked by hand so the
  error is the `FieldErrors` shape; the text is trimmed), `ImportedLine`,
  `ImportedSection`, `ImportedRecipe` as in interpretation 10 and the service's
  shapes (`amount` and `suggested_factor` as the `Number` type, strings;
  `status: Literal[...]`), `FactorRequest {ingredient_id: int, unit: trimmed 1 to 20,
  food: trimmed 1 to 200}`, `FactorAnswer {factor: Number}`.
- `POST ""` (`import_recipe`): 503 `ai_not_configured` if the runtime is not
  configured; 422 `text_required` / `too_long`; `chat = ai.limited(engine)`;
  `import_recipe(db, text, ProviderRecipeConverter(chat), ProviderFactorSuggester(chat))`;
  maps `NoRecipeFound` to 422 `no_recipe`, `DailyLimitReached` to 429 `limit_reached`,
  `BadAnswerError` and `AIServiceError` to 502 `ai_failed` (interpretation 5; fixed
  `msg`s; the exception's text is never put in the answer); logs per interpretation
  26. The route is a plain `def` (the call blocks a worker thread, not the event
  loop). Writes nothing to the catalogue or recipes. `responses=` documents 422,
  429, 502, 503 as `FieldErrors`.
- `POST "/factor"` (`suggest_factor`): same 503; the ingredient through
  `References` (422 `unknown_ingredient` on `ingredient_id`); an energy unit is 422
  `unit_not_for_ingredient`, the ingredient's own unit 422 `unit_is_own_unit` (both
  on `unit`, as R3's conversion endpoint names them); then `suggest_one`; the same
  429 and 502 mapping; answers `{factor}`.
- `FieldErrors` and `FieldError` from `api/errors.py`; one small helper in the file
  builds the `HTTPException`s so each message is written once.

**Tests (write first).** `test_recipe_import_service.py` (no HTTP; the service with
a stub converter returning hand-made `Draft`s and a stub suggester, ingredients made
as ORM rows in a SQLite session as `test_translate.py` builds them or through the API
`Catalog`; follow what R3 built):

- matching: `match` "oats" finds "Oats"; " OATS " too; a match naming nothing is
  `unmatched` with `ingredient_id` None (and the catalogue is unchanged); a
  `not_an_ingredient` line with a match has `ingredient_id` None;
- statuses: own (`""`, "g", "gram" on a g ingredient; "Stycken" on `st`); `built_in_step`
  ("oz" and "kg" on g, "msk" on dl); `stored_conversion` ("dl" with a `dl`
  conversion; "msk" on g with `dl = 40`; a free-text "klyfta" with that
  conversion); `needs_factor` ("dl" on g with none; "klyfta" without); `bad_unit`
  ("kcal"; a 25-character unit, cut to 20); canonical unit forms (`"msk."` becomes
  `msk`; own unit written `gram` becomes `""`; a stored conversion's spelling kept);
- `needs_you` counts unmatched, needs_factor and bad_unit, not the skipped kind;
- amounts: `0.3333333` becomes `0.333333`; `0.0000004` (rounds to 0) and `10**9`
  are a `BadAnswerError`; an amount with a unit and a null-amount
  `not_an_ingredient` line pass;
- cleaning: name trimmed and cut at 100; instructions cut at 20 000; `original_text`
  at 500; an empty section dropped; two sections with one unnamed get "Section 2"
  (unnamed first gets "Section 1"); a single unnamed section stays `""`; more than
  50 sections or 201 lines in one section is a bad answer; all sections empty is
  `NoRecipeFound` (from the converter, not the check: assert the converter's error
  passes through);
- retry: the stub raising `BadAnswerError` once then returning works and was called
  twice; twice raises; `AIServiceError` is called once and raises; `NoRecipeFound`
  once;
- factors: two `needs_factor` lines of one (ingredient, unit) make one suggester
  call and both lines carry the value; two units make two calls; 16 distinct pairs
  make 15 calls and the 16th is None; a suggester raising `BadAnswerError` twice
  gives None for that pair and the others still run; raising `AIServiceError` or
  `DailyLimitReached` stops the rest (None) and the import still returns; a factor of
  `0.0000004` or `10**9` is None; own-unit and stored lines never trigger a call;
- `suggest_one` retry and errors as above.

`test_recipe_imports.py` (API, `ai_client` = a client with provider `fake`; and
`anthropic` over a `ScriptedTransport` for the cases the fake cannot shape, built with
`logged_in_client(..., ai_provider="anthropic", ai_api_key=KEY, ai_transport=...)`):

- 401 without a session on both routes; 503 `ai_not_configured` with default
  settings, and no transport call;
- `text_required` for `""` and `"   "`, `too_long` for 200 001 characters, 422 for a
  missing field; none calls the provider;
- the fake: catalogue Oats (g), Milk (g), no honey; the answer has name "Imported
  porridge", servings 2, the four lines in order with statuses `own_unit`
  (oats), `needs_factor` (milk, dl, `suggested_factor` "50"), `unmatched` (honey, tbsp)
  and `not_an_ingredient` (amount null), `needs_you` 2, `source_url` "", `cut` false,
  `original_text` copied; with a `dl` conversion added to Milk first (through the
  conversions endpoint) the milk line is `stored_conversion` with no suggestion and
  `needs_you` 1;
- nothing is stored: before and after an import, `GET /api/recipes`,
  `/api/ingredients` (including `conversions`) are unchanged;
- through the adapter (`ScriptedTransport`): the request body's user message has the
  catalogue and the text between the tags, `<` escaped, the header carries the key,
  and the key is in no response; a model `match` of "oats" (lower case) matches
  "Oats"; a model that invents `match: "Truffle"` gives `unmatched`; the model's
  `amount` `"1,5"` string is accepted;
- errors: bad JSON twice gives 502 `ai_failed` after 2 calls; bad then good gives 200
  after 2 calls; a service error (transport raising `AIServiceError(500, "boom
  <KEY>")`) gives 502 `ai_failed` after 1 call and neither `boom` nor the key is in
  the body; an answer with no lines gives 422 `no_recipe` after 1 call; a draft with
  amount 0 is retried;
- `cut`: a 20 001-character text gives `cut` true and the user message holds exactly
  20 000 characters of it; 20 000 gives false;
- the daily limit (`ai_daily_limit=3`): an import with one factor call uses 2; the next
  import's convert call is the 3rd and passes, its factor call is refused and leaves
  `suggested_factor` null with a 200; the following import is 429 `limit_reached`
  and the transport was not called; `GET /api/health` still 200; with `today`
  monkeypatched to the next day it works again; the count survives a second app on the
  same database; with limit 0 the first import is 429;
- the factor endpoint: `{"ingredient_id", "unit": "dl", "food": "milk"}` gives
  `{"factor": "50"}` (fake); 422 `unknown_ingredient` (`body.ingredient_id`); energy
  unit 422 `unit_not_for_ingredient`; the ingredient's own unit 422 `unit_is_own_unit`;
  a food containing `bad` gives 502 after 2 calls; the limit gives 429; a call counts
  toward the limit.

**Then:** `cd web && npm run gen:api`; `npm run typecheck` stays green (no web code
reads the new types yet).

**Verify:** `python3 -m pytest -q`.

**Commit:** "server: import a recipe from pasted text and suggest factors".

### Task 4: Server: saving takes `new_conversions`

**Files:** modify `server/api/recipes.py`, `server/conversions.py` (and
`server/api/conversions.py` if the check helper lives there: move it, see below),
`tests/server/test_recipes.py`, `tests/server/conftest.py` (`recipe_body` passes
`new_conversions` through its `**changes`; no change expected).

**Build (re-read R3's `api/conversions.py` first):**

- If R3's conversion checks (`_check(ingredient, fields, ignore_id)`: energy unit,
  the ingredient's own unit, a duplicate among the ingredient's conversions) live in
  `server/api/conversions.py`, move them into `server/conversions.py` as a function
  over `(ingredient, unit, existing: list[(id, unit)]) -> list[(field, type, msg)]`
  that both the endpoint and the recipe save call (no behaviour change; the
  endpoint's tests stay green). The unit catalogue stays the only unit table.
- `api/recipes.py`: `NewConversion {ingredient_id: int, unit: trimmed 1 to 20, factor:
  Number > 0, source: Literal["ai", "user"]}`; `RecipeFields.new_conversions:
  list[NewConversion] = []` (at most 200), docstring: "conversions to create with the
  recipe, as accepted on the import review; created before the lines are routed". The
  response does not carry them (they show on the ingredients). `_fill`: collect the
  conversions' ingredient ids with locations `["new_conversions", i, "ingredient_id"]`
  into the same `References` as the lines' (`unknown_ingredient`), check each
  conversion (`unit`, plus a duplicate against the **other entries** of the list by
  `units.ratio(a, b) == 1`), then, inside the existing `no_autoflush` block and before
  the line routing of R3, append `models.IngredientConversion(unit=
  units.normalise(unit) for a catalogue unit else trimmed, factor, source)` to each
  `ingredient.conversions`, and route lines against the ingredient's conversions
  including the new ones. All errors, line and conversion, are collected into one
  422; a 422 or any later failure leaves nothing written (one commit at the end, as
  now). Free-text units are stored as typed (R3 interpretation 2).

**Tests (write first), `test_recipes.py`:**

- `test_a_recipe_saves_new_conversions_with_their_source`: a g ingredient, a body
  with a line `unit: "dl"` and `new_conversions` `[{ingredient_id, unit: "dl",
  factor: "40", source: "ai"}]` gives 201; the ingredient's `conversions` now has `dl`
  `40` `source` `ai` and `recipe_count` 1; the recipe's totals equal those of 40 g per
  dl (use the numbers of R3's totals test); a second conversion with `source: "user"`
  keeps `user`;
- the same through `PUT` for an existing recipe;
- `test_a_line_may_use_a_conversion_made_in_the_same_save` (above) and
  `test_without_the_conversion_the_same_line_is_refused` (R3's `unit_not_convertible`);
- `test_nothing_is_written_when_a_line_is_refused`: a good conversion plus a line in
  `kcal` (or a missing amount) gives 422 and the ingredient has no conversions and no
  recipe exists;
- refusals (422, `type` and `loc` checked): `unit_not_for_ingredient` for `kcal`,
  `unit_is_own_unit` for `gram` on a g ingredient, `duplicate` for a conversion that
  already exists on the ingredient (any spelling: `DL` for a stored `dl`), `duplicate`
  for two entries of one save for the same unit (`dl`, `DL`) on the second's `unit`,
  `unknown_ingredient` on `body.new_conversions.0.ingredient_id`, factor 0, -1, "abc" and
  more than 6 decimals on `.factor`, an empty unit, a unit over 20 characters, a
  `source` of `"x"`; several at once in one 422 with a bad amount of a line;
- `test_a_body_without_new_conversions_still_saves` (the default `[]`, every other
  test already proves it; assert one explicitly);
- R3's conversion-endpoint tests pass unchanged after the moved helper.

**Then:** `cd web && npm run gen:api`; add `new_conversions: []` where a test
factory builds the request's fields (`web/src/test-data.ts`, if it has one) so
typecheck stays green.

**Verify:** `python3 -m pytest -q`; the whole server suite on Postgres.

**Commit:** "server: a recipe save can create the conversions the import review accepted".

### Task 5: Web: hand-off, review logic, draft, texts (no pages yet)

**Files:** create `web/src/importDraft.ts`, `web/src/importDraft.test.ts`,
`web/src/importReview.ts`, `web/src/importReview.test.ts`; modify
`web/src/api/types.ts`, `web/src/api/errors.ts`, `web/src/api/errors.test.ts`,
`web/src/composables/useRecipeDraft.ts`, `.../useRecipeDraft.test.ts`,
`web/src/test-data.ts`, `web/src/i18n/en.json`.

**Build:**

- `api/types.ts`: aliases `ImportedRecipe`, `ImportedLine`, `FactorAnswer`,
  `NewConversion`, `Health` next to the others.
- `api/errors.ts`: `errorType(error): string | null`, the first `type` in a
  `FieldErrors` answer whatever its `loc` (for the `loc: ["body"]` errors of
  interpretation 5); keep `fieldErrors`.
- `importDraft.ts`: `setImportedDraft(draft: ImportedRecipe | null)` and
  `takeImportedDraft(): ImportedRecipe | null` (returns and clears). A module-level
  `shallowRef`; nothing is kept in storage (interpretation 16).
- `importReview.ts` (pure; `ratio` is `useUnits().ratio`, a parameter, as in
  `lineUnits.ts`): `lineState(line, ingredient | undefined, pending, ratio) ->
  'ready' | 'skipped' | 'unmatched' | 'needs_factor' | 'bad_unit'` (interpretation
  17: skipped first; no ingredient is unmatched; an empty unit or `lineFactor`
  non-null is ready; an energy unit is `bad_unit`; the rest `needs_factor`);
  `pendingKey(ingredientId, unit)` (lower-cased unit); `needsYou(lines, ...) ->
  number`; `acceptable(text) -> string | null` (a factor above 0, at most 9 digits
  before the point and 6 after, as `ConversionDialog` checks: reuse its helper if R3
  exported one, else share it from `numbers.ts`); `factorSource(text, suggested) ->
  'ai' | 'user'` (numerically equal to the suggestion is `ai`); `ingredientWithPending(
  ingredient, pending)` adding the pending conversions as `Conversion`s (id -1,
  their source) so `lineFactor` sees them.
- `useRecipeDraft.ts`: `DraftLine` gains `food: string`, `skipped: boolean` and
  `ingredientId: number | null` (null only in review: `checkRecipe` refuses it with
  `recipes.pickIngredient` and keeps the line's key in `errors`), plus
  `suggestedFactor: string | null`; `RecipeDraft` gains `imported: { cut: boolean } |
  null` and `pending: PendingConversion[]` (`{ingredientId, unit, factor, source}`);
  `emptyDraft()` has `imported: null`, `pending: []`. New `fillImported(recipe:
  ImportedRecipe)`: name, servings (as a string), instructions, `sourceUrl`, sections
  (named as the server gave them), lines with `ingredientId` from the answer, `amount`
  as typed (`''` for null), `unit` from the answer, `originalText`, `food`, `skipped`
  true exactly for `not_an_ingredient`, `suggestedFactor`; `imported` set. New
  `setLineIngredient(sectionIndex, lineIndex, ingredient)`, `skipLine`, `unskipLine`,
  `acceptFactor(ingredientId, unit, text, suggested)`, `forgetFactor(...)`.
  `checkRecipe` leaves skipped lines out of `sections` (a skipped line is not
  validated), sends `new_conversions` from `pending` filtered to those a kept line
  uses (compared with `pendingKey` after the line's unit and ingredient), and refuses a
  recipe whose kept lines are all gone (the existing "at least one ingredient").
  `serverErrors` maps `new_conversions.{i}.*` to `errors.save`
  (`recipes.conversionRefused`). The derived-tags watcher ignores skipped lines and
  lines with no ingredient.
- `test-data.ts`: `importedRecipe()` and `importedLine()` factories with the server's
  defaults.
- `en.json` (new keys under `recipes` and a new `import` section): `recipes.add` "Add
  recipe", `recipes.import` "Import recipe", `recipes.needsKey` "Needs an AI key",
  `recipes.pickIngredient` "Pick ingredient", `recipes.newIngredient` "+ New
  ingredient", `recipes.skip` "Skip", `recipes.skipped` "Skipped", `recipes.addAnyway`
  "Add anyway", `recipes.addBack` "Add back", `recipes.sourceLine` "From the text: {text}"
  (aria/title only; the visible line is the text itself), `recipes.factorRow` "1 {unit}
  =", `recipes.factorLabel` "How many {own} one {unit} makes", `recipes.accept`
  "Accept", `recipes.change` "Change", `recipes.suggesting` "Suggesting…",
  `recipes.factorInvalid` "Enter a number above 0, with at most 6 decimals.",
  `recipes.aiTooltip` is R3's (reuse), `recipes.badUnit` "{unit} can't be used for an
  ingredient. Pick another unit.", `recipes.conversionRefused` "A conversion was
  refused. Check the units of the lines and save again.", `recipes.leaveTitle` "Discard
  this recipe?", `recipes.leaveBody` "It was imported and is not saved yet.",
  `recipes.keepEditing` "Keep editing", `recipes.discard` "Discard", `recipes.banner`
  "Imported from pasted text. {n} line needs you. | Imported from pasted text. {n}
  lines need you." with `recipes.bannerReady` "Imported from pasted text. All lines are
  ready.", `recipes.bannerCut` "The text was long: the end was left out.",
  `recipes.saveBlocked` "Match, convert or skip every line to save.";
  `import.title` "Import recipe", `import.intro` "Paste a recipe. The AI reads it and
  makes a draft for you to check.", `import.text` "Recipe text", `import.run` "Import",
  `import.reading` "Reading the recipe…", `import.needsKey` "Needs an AI key.",
  `import.error.text_required` "Paste the recipe text first.",
  `import.error.too_long` "That is too much text. Paste only the recipe.",
  `import.error.no_recipe` "No recipe found in this text.", `import.error.ai_failed` "The
  AI service didn't answer. Try again.", `import.error.limit_reached` "Today's import
  limit is reached.", `import.error.ai_not_configured` "Needs an AI key.",
  `import.error.other` "Could not import the recipe. Try again.".

**Tests (write first):**

- `importDraft.test.ts`: set then take returns it and clears; take twice gives null.
- `importReview.test.ts` with `useUnits().ratio` loaded from `test-units.json`:
  every state (skipped wins over the rest; no ingredient; own unit and empty unit
  ready; `oz` on a g ingredient ready; `dl` with a stored conversion ready; `dl` with
  none needs a factor; a pending `dl` conversion makes it ready; `kcal` is `bad_unit`;
  a free-text unit needs a factor); `pendingKey` ignores case; `needsYou` counts the
  three; `acceptable` for `"100"`, `"0.5"`, `"0"`, `"-1"`, `"abc"`, `"0.1234567"`, a
  10-digit integer part; `factorSource` for equal, different and `"100.0"` against
  `"100"`.
- `useRecipeDraft.test.ts`: `fillImported` maps a hand-made `ImportedRecipe`
  (sections, lines, skipped only for not-an-ingredient, empty amount for null,
  `suggestedFactor`, `imported` set); `checkRecipe` leaves skipped lines out, refuses
  an unmatched kept line on its key, refuses a recipe whose lines are all skipped,
  sends `new_conversions` only for pending conversions a kept line uses, with the
  source; `acceptFactor` replaces a pending of the same key; `skipLine` / `unskipLine`;
  `setLineIngredient` keeps the line's amount and unit; the derived-tags question
  ignores skipped and unmatched lines; `serverErrors` maps a
  `new_conversions.0.unit` error to the save message.
- `errors.test.ts`: `errorType` on a `loc: ["body"]` error, on a field error, and on
  junk.

**Verify:** `npm run lint`, `npm run typecheck`, `npx vitest run
src/importDraft.test.ts src/importReview.test.ts src/composables src/api`.

**Commit:** "web: import draft, review states and texts".

### Task 6: Web: C1's menu and I1

**Files:** create `web/src/components/AddMenuButton.vue`, `.test.ts`,
`web/src/pages/ImportPage.vue`, `.test.ts`; modify `web/src/pages/RecipesPage.vue`,
`web/src/pages/RecipesPage.test.ts`, `web/src/router.ts`, `web/src/test-app.ts` (a
`healthRoute(aiConfigured)` helper to spread into a fake server, if it earns its
place).

**Build:**

- `AddMenuButton.vue`: props `label` (the fab's `aria-label`) and `items:
  { label: string; to: string; disabled?: boolean; hint?: string }[]`; the same
  sticky round `+` and bottom space as `AddButton`; a `q-menu` of `q-item`s
  (`clickable`, `:to`, `:disable`), a disabled item shows its `hint` as a caption. No
  logic.
- `RecipesPage.vue`: replaces `AddButton` with `AddMenuButton` (`label` "Add recipe",
  items **New recipe** to `/recipes/new` and **Import recipe** to `/recipes/import`,
  disabled with the hint "Needs an AI key" unless `GET /api/health` answered
  `ai_configured: true`). The health call is its own, tolerant of failure (a failed
  call or a missing answer counts as not configured) and does not block the page's
  own `LoadState`.
- `ImportPage.vue` (I1): title, `import.intro`, a large `q-input type="textarea"`
  (`aria-label` "Recipe text", `autogrow`, `outlined`), **Import** (`:disable` while
  empty, in flight, or not configured), the `import.needsKey` hint when `ai_configured`
  is false (health read with the page), and a `q-banner`/`role="alert"` for the last
  error. **Import** posts `POST /api/recipe-imports` `{text}`; while waiting the button
  shows "Reading the recipe…" with a spinner and the box is read-only (about 5 to 15 s,
  no timeout of its own: the server bounds the call); on success `setImportedDraft`
  and `router.push('/recipes/new')`; on an error the page stays, the text is kept, and
  the message is `import.error.<errorType(error)>` (`import.error.other` for any other
  failure, a network error included). `setImportedDraft(null)` when the page opens (no
  stale draft). `EditorHeader` with `back="/recipes"`.
- `router.ts`: `{ path: '/recipes/import', name: 'import-recipe', component:
  ImportPage }` beside the recipe editors.

**Tests (write first):**

- `AddMenuButton.test.ts`: the fab has its label; clicking opens the menu with the
  items as links; a disabled item is not a link and shows its hint.
- `RecipesPage.test.ts`: the existing test that clicks `[aria-label="New recipe"]`
  becomes: click `[aria-label="Add recipe"]`, then the **New recipe** item goes to
  `/recipes/new`; **Import recipe** is enabled with `ai_configured: true` and goes to
  `/recipes/import`; with `false` or with the health call failing it is disabled with
  "Needs an AI key" and the page still lists recipes.
- `ImportPage.test.ts`: Import is disabled while the box is empty or only spaces and
  when not configured (with the hint); a success posts `{text}`, shows "Reading the
  recipe…" while the call is pending (a delayed fake reply), sets the draft (assert
  `takeImportedDraft()` after) and lands on `/recipes/new`; each error type shows its
  sentence, keeps the text and the page, and re-enables Import (`no_recipe` 422,
  `limit_reached` 429, `ai_failed` 502, `ai_not_configured` 503, `text_required` 422,
  `too_long` 422); a network error shows `import.error.other`; opening the page clears
  an old draft; the button is not clickable twice while a call is pending (one POST).

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`.

**Commit:** "web: C1 add menu and the import page (I1)".

### Task 7: Web: C2's import review

**Files:** create `web/src/components/ImportLineReview.vue`, `.test.ts`; modify
`web/src/components/IngredientPicker.vue`, `.test.ts` (if one exists),
`web/src/components/RecipeSection.vue`, `.test.ts`, `web/src/pages/RecipePage.vue`,
`.test.ts`; the ingredient form (see the refactoring; `IngredientForm.vue` and
`IngredientPage.vue`, their tests).

**Build:**

- **Ingredient form dialog (interpretation 20).** If the refactoring of
  `r4-refactor.md` is done there is an `IngredientForm` component (the ordinary C4
  form for `id` null or an id, emitting `saved`); use it. If not, do the extraction
  first, as a separate commit "web: extract the ingredient form from the ingredient
  page" with the page's existing tests unchanged and green, per the refactoring brief.
  Then `NewIngredientDialog.vue` (a `q-dialog` around the form with `id` null and an
  `initialName` prop; no delete button, no conversions card, no unit-change dialog
  because a new ingredient has no stored numbers; emits `saved(ingredient)` after the
  server created it; **Cancel** closes). Its test: opens with the name filled, saves
  through the fake server (`POST /api/ingredients`) and emits the created ingredient,
  shows the server's `name_in_use` on the field and stays open, Cancel emits nothing.
- `IngredientPicker.vue`: optional props `initialSearch` (the search box starts with
  it each time the picker opens) and `allowNew` (a **+ New ingredient** button in the
  footer emitting `new`; with no match for the search the empty message is followed by
  the same button). Existing uses (the recipe's own **+ Add ingredient**) are unchanged.
- `ImportLineReview.vue`: for one line in the review (props: `line`, `ingredient`,
  `state`, `ownUnit`, `factor` (the shared factor row state: text, suggested, loading,
  accepted)); shows, in order: the **source line** (`line.originalText`, small grey
  text, `.source-line`, above the row's content: R2's row renders this component's top
  part before the amount row; use a named slot or render the component above the row,
  as the built `RecipeSection` allows); for `unmatched`: a red **Pick ingredient** button
  (`.pick-ingredient`) and **Skip**; for `needs_factor`: the factor row `.factor-row`
  "1 {unit} = [input, aria-label "How many {own} one {unit} makes"] {own} ✨ **Accept**"
  (✨ with tooltip while the text equals the suggestion; "Suggesting…" while loading;
  after Accept "1 dl = 100 g ✨" and **Change**) and **Skip**; for `bad_unit` the text
  `recipes.badUnit` (the line's unit picker, R3's, is right there) and **Skip**; for
  `skipped`: the row greyed (`.line-skipped`) with **Add anyway** (a `not_an_ingredient`
  line) or **Add back** (one the user skipped; the component knows which by the
  line's original flag, kept as `line.notAnIngredient`, add it in Task 5's draft if
  missing). Emits `pick`, `skip`, `unskip`, `accept(text)`, `change`, `factor-input(text)`.
  A line that needs the user has the class `.needs-you` (for the banner's scroll).
- `RecipeSection.vue`: in review mode (`inject('importReview', null)` provided by the
  page, so a normal editor is untouched) a line renders `ImportLineReview`; a skipped
  line's amount and picker are disabled; an unmatched line shows no amount unit
  suffix until it has an ingredient.
- `RecipePage.vue`: at setup for a new recipe `takeImportedDraft()` once (not inside
  the loader, so a retry of the load cannot lose it) and `fillImported` after the
  data loaded (`load`'s callback), as an existing recipe's `fillDraft`; the page
  provides `importReview` (states per line computed from `lineState` with the page's
  ingredients and `useUnits().ratio`, the factor rows' state by `pendingKey`, the handlers
  below); the **banner** (`q-banner`, `.import-banner`, tappable: scrolls the next
  `.needs-you` into view, cycling; the cut note when `imported.cut`; `recipes.banner` /
  `recipes.bannerReady`); the page's own **+ Add ingredient** stays; **Pick
  ingredient** opens the picker with `initialSearch` the line's `food` and `allowNew`,
  remembering which line asked; picking calls `setLineIngredient` and, when the line then
  needs a factor, fetches a suggestion (`POST /api/recipe-imports/factor` with
  `{ingredient_id, unit, food}`; the row shows "Suggesting…"; a failure leaves it
  empty); **+ New ingredient** opens `NewIngredientDialog` with the name from `food`
  (first letter capitalised), and on `saved` pushes the ingredient into the page's
  list, matches the line and suggests as above; **Accept** calls `acceptFactor` with the
  source from `factorSource`; **Save** is `:disable`d while `needsYou > 0` with the
  caption `recipes.saveBlocked` (the disabled state is the page's, not `checkRecipe`'s:
  the server and `checkRecipe` still refuse); a successful save sets the leave flag
  and goes to `/recipes`; `onBeforeRouteLeave` and a `beforeunload` listener implement
  interpretation 21 (`q-dialog` "Discard this recipe?", **Keep editing** /
  **Discard**) only while `draft.imported` is set and the recipe is not saved; the
  page's **Delete** button is absent for a new recipe as today.
- The existing portion totals use the lines that are ready only (skipped and
  unmatched lines count 0), through the existing `factorOf`.

**Tests (write first):**

- `ImportLineReview.test.ts`: each state's controls and nothing else (unmatched: Pick
  ingredient and Skip; needs factor: the row with the suggestion and ✨ and its
  tooltip, Accept disabled for an invalid number; typing a different number removes ✨;
  loading shows "Suggesting…"; accepted shows the summary and Change; bad unit: the
  message and Skip; skipped: greyed with Add anyway or Add back by origin); the source
  line is shown, and not shown when empty; events carry what was typed.
- `IngredientPicker` test: `initialSearch` fills and filters; `allowNew` shows the
  button and emits `new`; without the props nothing changes.
- `RecipePage.test.ts` (existing tests unchanged; new ones with a hand-made
  `importedRecipe()` put through `setImportedDraft` before mounting `/recipes/new`):
  - `an imported recipe opens in review: the banner counts the lines that need you and
    each line shows its source line`;
  - `Pick ingredient opens the picker filled with the food, picking matches the line and
    the banner count drops`;
  - `+ New ingredient opens the dialog with the name filled; saving matches the line,
    lists the ingredient and asks for a factor suggestion (the fake server's
    /api/recipe-imports/factor)`;
  - `a line that needs a factor shows 1 dl = [50] g ✨; Accept registers it and the
    line is ready; a different number is saved as user, the same number as ai` (check
    the body of the final save);
  - `a not-an-ingredient line is greyed; Add anyway makes it an ordinary line with an
    empty amount; Skip leaves it out of the save; Add back returns it`;
  - `Save is disabled until every line is matched and converts or is skipped`, and the
    caption says why; enabling it and pressing Save posts sections without skipped
    lines, `original_text`, the unit of each line and `new_conversions` with sources,
    only for used conversions; a pending conversion whose line was skipped is not sent;
  - `tapping the banner scrolls to the next line that needs you and cycles` (stub
    `scrollIntoView`);
  - `leaving an imported draft asks first; Keep editing stays; Discard leaves; a
    saved recipe leaves without asking; an ordinary new recipe never asks`;
  - `opening /recipes/new with no imported draft is the empty editor` (a reload);
  - `the cut note shows when the text was cut`;
  - `a server refusal of a conversion shows the save message and keeps the page`.
- `RecipeSection.test.ts`: without the injected review nothing of this renders (the
  existing tests prove it; add one explicit); in review a skipped line's amount input is
  disabled.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test` (whole web suite),
`python3 -m pytest -q`.

**Commit:** "web: C2 import review, new ingredient dialog and conversions on save".

### Task 8: End-to-end step

**Files:** `web/e2e/catalog.e2e.ts`, `.github/workflows/ci.yml`.

**Build:** CI's e2e container gets `-e AI_PROVIDER=fake` next to its other `-e`
flags (the README's e2e recipe says the same). In the flow, after R3's step and
before the Tags step (re-read the flow; do not hard-code what an earlier step may have
changed: read Oats' unit from its page, it is expected to be g here; the catalogue holds
Oats only, no Milk and no honey):

- Recipes: the fab opens a menu; **Import recipe** is enabled (the server runs with the
  fake provider); open it. Paste `[fake:none]` and **Import**: "No recipe found in
  this text." shows and the text stays. Replace it with `[fake:broken]` and **Import**:
  "The AI service didn't answer. Try again." Replace it with `Porridge for two: 100 g
  oats, 3 dl milk, 2 tbsp honey. Boil.` and **Import**: C2 opens as a new recipe, name
  "Imported porridge", **Serves** 2, instructions with two lines, the banner reads
  "Imported from pasted text. 2 lines need you." and each line shows its source line
  (`100 g oats`, `3 dl milk`, `2 tbsp honey`, `salt and pepper to taste`); the oats line
  is ready, the pepper line greyed; **Save** is disabled.
- Milk: **Pick ingredient** opens the picker with "milk" in the search; **+ New
  ingredient** opens the dialog with Name `Milk`; set Energy `42`, **Save**: the dialog
  closes, the line shows Milk and the factor row "1 dl = [50] g ✨" ("Suggesting…" first,
  then 50); **Accept**: the row reads "1 dl = 50 g ✨"; the banner now reads "1 line needs
  you."
- Honey: **Skip**: the banner reads "All lines are ready." and **Save** is enabled. Press
  **Save**: back on Recipes the row "Imported porridge · Per portion: Energy ..." is
  listed (compute: oats 100 g × 389/100 = 389, milk 3 dl × 50 g × 42/100 = 63, total 452,
  per portion for 2 servings 226; read the figure from the server once and assert the
  literal, as the flow does elsewhere).
- Milk's page: the Conversions card lists "1 dl = 50 g ✨" (a conversion the review
  accepted from the AI), and "Used in 1 recipe" on its conversion row; editing the
  number to `55` removes the ✨ (saved as `user`) and the recipe's per-portion total
  changes on the Recipes list. Then delete the imported recipe (Recipes, open, **Delete**)
  and delete Milk's conversion and Milk, so the plan steps after this are unchanged
  (the list shows one recipe, Porridge, again).
- Leaving: start another import with `Porridge for two...`, then press the header's
  **Back** arrow: "Discard this recipe?" shows; **Keep editing** stays; **Back** again
  and **Discard** returns to Recipes with nothing saved.
- Update the file's header comment: import from pasted text with the fake provider.

**Verify (the e2e recipe in the common context):** `cd web && npx vite build`; uvicorn on
an empty SQLite file in the scratchpad with `PASSWORD_HASH`, `SESSION_KEY`,
`AI_PROVIDER=fake` and `DATA_SOURCES_DIR=tests/data/data_sources` as the README says;
`E2E_PASSWORD=... E2E_BASE_URL=http://localhost:8000 npm run e2e -- --trace off`; kill
the server.

**Commit:** "e2e, CI: import a pasted recipe with the fake provider".

### Task 9: Docs

**Files:** `docs/deploy.md`, `.github/workflows/ci.yml` (deploy job), `README.md`, the
master plan, the import spec, the wireframes spec, this plan.

- `docs/deploy.md`: a new optional step after "5. Secrets" (**5b. AI key (only for
  recipe import)**): create the secret from the provider's key (`read -rsp 'AI API key:
  ' VALUE; echo; printf '%s' "$VALUE" | gcloud secrets create ai-api-key
  --data-file=-`), give `meal-planner-run` the accessor role on it (as the loop in step
  6 does for the others; add `ai-api-key` to that loop's list only if the secret exists:
  say it), and set the repository **variable** `AI_ENABLED` to `true` under the GitHub
  step, so the deploy passes it. Say what the settings mean (`AI_PROVIDER` default
  `anthropic`, `AI_MODEL` default the provisional `claude-sonnet-5-5`, `AI_DAILY_LIMIT` default
  50 calls a day, UTC) and how to change them (repository variables `AI_PROVIDER`,
  `AI_MODEL`, `AI_DAILY_LIMIT`, passed only when set), how to see that it works (Recipes ->
  **+** -> **Import recipe** is enabled; `/api/health` says `"ai_configured": true`), how to
  rotate the key (a new secret version, then **Run workflow**) and that without the secret
  the app works as before with Import disabled ("Needs an AI key").
- `ci.yml` deploy job: build the `--set-secrets` list from a shell variable that adds
  `,AI_API_KEY=ai-api-key:latest` when `vars.AI_ENABLED == 'true'`, and an
  `--update-env-vars` for `AI_PROVIDER`, `AI_MODEL`, `AI_DAILY_LIMIT` only for the
  variables that are set; keep `actionlint` green (the job `workflow-lint` runs it; run
  it locally if available, else keep the shell simple: `set -euo pipefail`, quoted
  expansions). The e2e job's `AI_PROVIDER=fake` is Task 8's.
- `README.md`: the status paragraph says recipes can be imported by AI from pasted text
  (with the review on C2), replacing "the import itself is not available yet"; the
  "Run the GUI locally" section lists the optional `AI_PROVIDER`, `AI_MODEL`,
  `AI_API_KEY` and `AI_DAILY_LIMIT`, and that `AI_PROVIDER=fake` gives canned drafts
  without a key (with the sentinels of interpretation 24, one line); the end-to-end
  paragraph adds `AI_PROVIDER=fake` to what the server is started with.
- Master plan: after the latest "done" line add "R4 done: see
  `2026-11-08-slice-r4-import-from-pasted-text.md`."; mark R4's overview row only if the
  other rows are marked.
- Import spec: "Settings": `AI_API_KEY` is the one key variable (interpretation 1) and
  the health field is `ai_configured`; a short "As built in R4" note under "Import flow"
  and "Errors" with the settled details: the text limits and `cut` (7), escaping (8), the
  statuses and their order (10), the cleaning rules (12), the factor cap and
  distinct-pair rule (13), the retry and limit rules (3, 4), the error types and messages
  (5, 6), `new_conversions` on save (15) and that the fake provider's sentinels exist
  (24); in "Model comparison" update "Reused by R4" to say what R4 did (escape, `_sane`,
  fake provider, shared transport) and keep the provisional default text as it is.
  "Slices": 3 becomes R4 (built) and R5 (link).
- Wireframes spec: C1's **+** menu (New recipe, Import recipe, disabled with "Needs an
  AI key"); a new **I1 · Import** entry (paste box, Import, "Reading the recipe…", the
  errors, input kept); C2's import review (banner, source lines, Pick ingredient with
  + New ingredient, factor row with ✨ and Accept, not-an-ingredient lines with Add
  anyway, Skip, Save disabled until done, Discard question on leaving).
- This plan: Status "Built"; under each task add how it was checked and the differences
  from the text, as earlier slice plans do.

**Verify:** the full checks (both suites, lint, typecheck, the Postgres run of the
server suite, e2e) once more.

## Done when

With `AI_PROVIDER=fake` (or a real provider and key), Recipes -> **+** -> **Import
recipe** takes pasted text to an unsaved draft in C2 with its banner, source lines and
review states; every unmatched, unconverting or not-an-ingredient line can be matched,
given an accepted factor (✨ for the AI's, removed when the user types another number),
or skipped; Save is disabled until then and creates the recipe and its accepted conversions
in one transaction with their `source`; broken answers are retried once, outages and the daily
limit answer the spec's messages; nothing is stored before Save; the recipe text and catalogue
are escaped before the model sees them; `GET /api/health` says whether the AI is configured;
the one `HttpxTransport` is shared and closed at shutdown; deploy docs name the secret; both test
suites (also on Postgres), lint, typecheck, the migration test and the end-to-end flow pass;
and the docs say so.
