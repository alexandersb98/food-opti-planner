# Meal Plan Optimizer

An optimization-based meal planning tool: give it a set of ingredients and a
set of constraints (nutrient targets, budget, etc.), and it lays out a
multi-day eating plan that satisfies them as well as possible. When
constraints conflict, it finds a good-enough compromise instead of
failing outright.

**Status:** The solver library (`meal_planner/`), a server (`server/`) and a web
app (`web/`, a React app called The Weekly Table, laid out like a printed
weekly) are built and deployable to Cloud Run. The pages are listed in the
**Contents** (masthead, top right) and turn with a swipe or the turn links at
the foot of each page. What the app does now:

- **Planning.** This week's brief holds the schedule (a grid of place
  settings, changed in its sheet), the goals (added and edited in a sheet:
  names, importance below and above, a day guard-rail under Advanced), the
  recipe filters (tags set to Only or Never, with a count of the recipes left)
  and the time allowed, and **Compose the week** (which can be stopped). The
  composed week opens on The Menu, day by day, with a colophon of the goals met
  or missed, **Save to the archive** and the other actions; saved plans are in
  The archive. When Must goals clash, The Menu shows an Editor's note instead
  (the clashing goals and days, fixed in place: a looser bound or Make Prefer,
  then Try again).
- **Catalogue.** The recipe index, Ingredients, Attributes and Tags pages. Tags
  can be grouped as equivalent (filtering on one includes recipes whose
  ingredients have any of them; a recipe shows its derived tags by the same
  rule).
- **Units and settings.** A Settings page with the edition (paper, evening or
  the device's), preferred units for mass, volume and energy, on a unit
  catalogue in `server/units.py`. Unit fields of ingredients and attributes are
  combo boxes over that catalogue (grouped by category, the preferred unit
  first, free text allowed; a new ingredient starts in the preferred mass
  unit). A unit change within its category converts the stored numbers after a
  question (ingredient values, goal bounds and references, basis, recipe
  amounts, conversions); another category or free text only changes the unit.
- **Data sources.** Settings lists the data sources. A source's page shows its
  attribution and columns, sets its colour and maps each column to an
  attribute. An ingredient can be added from a source (**Add an ingredient**,
  **Add from data source**), keeps a link to its food and shows updated values.
  The data file is described below.
- **Recipe structure.** A recipe reads as a spread and is edited in place:
  **Serves N** (amounts are for the whole recipe; per-portion totals and the
  planner's portion divide by N), sections with optional headings, the same
  ingredient on several lines, a method and a source link. An ingredient's
  "Used in N recipes" counts recipes, not lines.
- **Line units and conversions.** A recipe line has a unit: the ingredient's
  own, a catalogue unit that converts to it (also through one of its
  conversions), or the unit of a stored conversion ("1 dl = 40 g", added on the
  ingredient's page under Conversions or with **New unit...** on the line). The
  planner and the totals convert every line to the ingredient's unit, and a line
  that does not convert is refused when the recipe is saved.
- **AI import, from text and from a link.** The recipe index, **Add recipe**,
  **Import recipe** (it says when the server has no AI key; it opens on **A
  link**, with **Pasted text** beside it) takes the page or the text to a draft
  that opens as an unsaved recipe in review (a banner counting the lines that
  need you, each line's source line, **Pick ingredient** with **+ New
  ingredient**, "1 dl = 100 g **Accept**" for a line that needs a conversion
  factor, **Skip**, and saving refused until every line is matched and
  converts or is skipped). Saving also creates the accepted conversions, with
  their source. Nothing is stored before Save.
  The AI layer is in `server/ai/` (interfaces, prompt and schema, adapters for
  four providers and a canned `fake` one), with a comparison script,
  `scripts/compare_models.py`, that the owner runs by hand to choose a model (the
  default in the app, `claude-sonnet-5-5`, is provisional until it has been run).

### Importing from a link

The server fetches the page under strict limits: http and https only, ports 80 and
443, 10 seconds for the whole fetch, 2 MB, at most 3 redirects, HTML only. On every
hop (the first URL and each redirect) it refuses internal addresses: loopback,
private networks, link-local (including the cloud metadata server), carrier-grade
NAT, 0.0.0.0, IPv4-mapped and other IPv6 equivalents, and legacy numeric hosts such
as `2130706433`. It resolves the name once per hop and connects to the address it
checked (the certificate is still verified against the name), so a name whose
address changes between the check and the connection has nothing to rebind. The
rules are in `server/address_policy.py`. A page with schema.org `Recipe` JSON-LD
sends only that recipe's main fields; otherwise the page's visible text is sent.
Pages that need JavaScript or a login can't be read: the app says "paste the text
instead". The tests never touch the internet (a stubbed transport and a fake
resolver). Residual risk: a public site is fetched, and its page is untrusted text
that goes to a model with no tools.

A script to build the Livsmedelsverket data file,
`scripts/import_livsmedelsverket.py`, has been run against the live API; the
data file (version 2026-11-15: 2,606 foods, 60 nutrient columns, 120 food
groups) is committed in `server/data_sources/` (see "Refreshing the
Livsmedelsverket data file").
The server keeps a read-only reference copy of the data files in
`server/data_sources/` (`*.json.gz`, loaded at startup, a file only when its
version differs from the stored one; the directory can be changed with
`DATA_SOURCES_DIR`). Settings lists the sources in a Data sources card, a
source's page shows its attribution and columns, sets its colour and maps each
column to an attribute (only attributes whose unit converts are offered, one
column per attribute, with Create attribute on the spot; the card counts the
mapped columns), deleting an attribute clears its mappings, and
source tags (one per food group) show in the source's colour and can't be
renamed or deleted. Ingredients can be added from a data source (Add from data
source on the Ingredients page: search the foods, preview the converted values
and source tags, a warning if the food was added before); such an ingredient
shows its source on its page, can be unlinked, and is measured in mass units
only, and changing an attribute's unit also converts the source values copied
into ingredients. A linked ingredient shows **Updated values available** when
the source's values move on (after a new data file, or a column mapped later):
**Accept** copies the new values, **Keep mine** keeps the ingredient's own, and
the Ingredients list marks such ingredients and can show only them. Tags can be
made equivalent (tag groups) in a tag's **Equivalent tags** on the Tags page:
filtering on one of them includes recipes whose ingredients have any of them,
the members of a group share one rule, and three questions guard the changes
that touch other tags (moving a tag from another group, switching an added
tag's rule, changing the rule of a tag already in a group). The Livsmedelsverket file is regenerated by the owner
with `scripts/import_livsmedelsverket.py`; without a file the app simply has no
data source.

Run the Python tests with `python3 -m pip install -e '.[server,dev]'` and
then `python3 -m pytest`. Server tests use SQLite; set
`TEST_DATABASE_URL=postgresql+psycopg://...` to run them on Postgres. The
reference-scale benchmark is opt-in: `python3 -m pytest -m benchmark -s`.
`scripts/compare_models.py` needs real AI keys and costs money; it is never
run in tests (see "Model comparison" in the recipe-import spec).

Run the GUI locally. The server needs the login password's hash and a
key that signs the session cookie; it refuses to start without them:

```
export PASSWORD_HASH="$(python3 -m server.hash_password)"     # asks for the password twice
export SESSION_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
python3 -m uvicorn --factory server.app:create_app --reload   # API on :8000, SQLite in ./planner.db
cd web && npm install && npm run dev                          # app on :5173, forwards /api
```

The app is React (`web/src/app/`, entry `web/index.html`), served at `/`.
In the dev server only, `/specimen` shows the type, colours and building
blocks; it is left out of the production build.

Recipe import needs an AI service. Optional settings: `AI_PROVIDER` (`anthropic`
by default, also `gemini`, `openai`, `mistral`), `AI_MODEL`, `AI_API_KEY` (the key of
that provider; without it Import is disabled) and `AI_DAILY_LIMIT` (model calls a
day, default 50). `AI_PROVIDER=fake` (with `AI_ALLOW_FAKE=true`, so it can't be set by accident) needs no key and answers canned drafts (a text
with `[fake:none]`, `[fake:broken]`, `[fake:broken-once]` or `[fake:down]` picks a
failure), for trying the screens and for the end-to-end test.

The session cookie is `Secure`. Chrome and Firefox accept it on
`http://localhost`; other hosts need HTTPS. Changing `SESSION_KEY` logs
out every session.

Deploying: every push to `main` that passes CI is deployed to Google
Cloud Run once the owner has done the one-time setup in
[`docs/deploy.md`](docs/deploy.md); until then the deploy job is skipped.

Refreshing the Livsmedelsverket data file. The script needs network access to
`dataportal.livsmedelsverket.se` and is never run by the tests or the app.
To run it without setting up Python yourself, open the repository in the
dev container (`.devcontainer/`: VS Code's **Reopen in Container**, or a
GitHub Codespace); it has Python 3.13 and Node 22 and installs the
dependencies, and the commands below run in its terminal.
The app works without the file (the data source is simply not loaded).
The script was checked against the live API in 2026-11: food groups are the
`Huvudgrupp` classification (its name is in `kod`), and vitamin A and niacin
come as `RE/µg` and `NE/mg` and are written as `µg` and `mg`. Start with a
short trial in case the API has changed since:

```
python3 scripts/import_livsmedelsverket.py --limit-foods 5 \
    --out /tmp/lv-trial.json.gz --min-foods 0 --record /tmp/lv-trial.json
```

Check the summary: the classification types seen (and `--group-type` if the
food groups are under another type), the units written, that the foods got
groups, and that no skipped value looks like data. `/tmp/lv-trial.json` holds
the raw answers if something needs a closer look. Then the real run (one
request at a time, to be gentle with the API; 10-20 minutes):

```
python3 scripts/import_livsmedelsverket.py --workers 1
```

Check the summary again, then `git add server/data_sources/livsmedelsverket.json.gz`,
commit it as `data: Livsmedelsverket <version>` and open a pull request. The
licence credit line (CC BY 4.0, in the file's `attribution`) must stay visible
in the app (screen S2).

Frontend checks: `npm run lint`, `npm run typecheck`, `npm test` in
`web/`. After changing the API, run `npm run gen:api` in `web/` to
update `web/openapi.json` and `web/src/api/schema.ts`, and
`web/src/test-units.json` (the unit catalogue the app's tests use); tests
fail until they are up to date.

End-to-end tests (Playwright, in `web/e2e/`) drive the built app in a
phone-sized browser. They expect a running app with an empty database,
started with `DATA_SOURCES_DIR=$PWD/tests/data/data_sources` (next to
`DATABASE_URL`, `PASSWORD_HASH` and `SESSION_KEY`, and `AI_PROVIDER=fake` with `AI_ALLOW_FAKE=true` for the
import step; the directory holds a small
file of fake "TEST" foods, as the flow looks at a data source), and its
password in `E2E_PASSWORD`:
`E2E_PASSWORD=... E2E_BASE_URL=http://localhost:8000 npm run e2e` in
`web/` (after `npx vite build`, so uvicorn serves the app; the first
run needs `npx playwright install chromium`). CI runs them against the
built container and Postgres.

See [`docs/superpowers/specs/2026-09-15-meal-optimizer-design.md`](docs/superpowers/specs/2026-09-15-meal-optimizer-design.md)
for the design notes and decisions made so far,
[`docs/superpowers/specs/future-features.md`](docs/superpowers/specs/future-features.md)
for deferred features and alternatives considered, and
[`docs/superpowers/specs/open-questions.md`](docs/superpowers/specs/open-questions.md)
for holes/open questions found in review that still need resolving.
Code-level refactors found in a design review are listed in
[`docs/superpowers/specs/2026-10-27-code-health-review.md`](docs/superpowers/specs/2026-10-27-code-health-review.md).

The first GUI is designed in
[`docs/superpowers/specs/2026-10-21-gui-wireframes-design.md`](docs/superpowers/specs/2026-10-21-gui-wireframes-design.md)
and
[`docs/superpowers/specs/2026-10-22-gui-tech-stack-design.md`](docs/superpowers/specs/2026-10-22-gui-tech-stack-design.md),
and is built in the vertical slices listed in
[`docs/superpowers/plans/2026-10-22-gui-slices.md`](docs/superpowers/plans/2026-10-22-gui-slices.md).

## `lp_solver/` — small standalone sample app

A separate, self-contained toy: reads a linear programming problem from
a structured text file and prints its optimal solution. Pure Python, no
dependencies. See [`lp_solver/README.md`](lp_solver/README.md) for the
file format and usage; example problems live in [`examples/`](examples).
