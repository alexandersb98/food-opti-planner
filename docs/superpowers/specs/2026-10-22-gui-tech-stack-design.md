# GUI, first version — Tech Stack, Hosting, Storage and Testing

**Status:** Agreed with the user section by section; awaiting spec
review.

**Path:** Architectural (new subsystem: the server, database and
frontend behind the first GUI).

**Context:** The screens are designed in
[`2026-10-21-gui-wireframes-design.md`](2026-10-21-gui-wireframes-design.md)
(the "GUI spec"), which left the framework, the server/library boundary
and storage open. This spec decides them. Screen ids (A1, C2, ...) refer
to the GUI spec.

## Decisions

1. **One user for now.** The app is for its owner only. Nothing here
   rules out more users later, but there are no accounts.
2. **A real backend and frontend.** A Python API server wraps the
   `meal_planner` library; a separate single-page app in the browser
   calls it.
3. **Free hosting: Google Cloud Run + Neon Postgres.** The backend runs
   as one container on Cloud Run; data lives in a Neon free-plan
   Postgres database.
4. **Backend: FastAPI** (Pydantic for request and response models).
5. **Frontend: Vue 3 + TypeScript + Vite, with Quasar components.**
6. **The API speaks in GUI terms; the server translates to the
   library.** All mapping rules from the GUI spec live in Python.
7. **Relational storage** with SQLAlchemy 2.0, Alembic and psycopg 3.
8. **Built-in single-user password login.**
9. **Deploy with GitHub Actions** on every push to `main`.

## Hosting

Options considered for free hosting (free tiers as checked in October
2026):

| Option | Verdict |
|---|---|
| Cloud Run + Neon | **Chosen.** 180 000 vCPU-seconds and 2 million requests a month free; a 30 s solve on 1 vCPU uses 30 vCPU-seconds, so about 6 000 plans a month fit. Neon free: 0.5 GB storage, 100 compute-hours, scales to zero. |
| Oracle Cloud Always Free VM | Rejected. Free ARM capacity is often unavailable, and Oracle may reclaim a VM under 20 % CPU for 7 days, which a one-user app always is. |
| Render free tier | Rejected. Sleeps, 512 MB memory, free database expires. |
| Machine at home + Tailscale | Possible later; the container moves unchanged. |
| Small paid VPS (~€5/month) | Not free. Also a drop-in move for the same container. |

Known costs of the choice: a cold start of a few seconds after idle
(Cloud Run and Neon both scale to zero), and Google needs a payment card
on file even on the free tier.

Because the backend is a plain container and the database is plain
Postgres, moving to another host needs no code changes.

## Project layout

```
meal_planner/   the library, unchanged; never imports server or web code
server/         FastAPI app, database models, translation to PlanRequest
web/            Vue 3 + Quasar app (Vite, TypeScript)
Dockerfile      stage 1: Node builds web/; stage 2: Python runs server/
                and serves the built web/ files
```

One container serves the API under `/api/...` and the frontend at `/`.
In development the Vite dev server forwards `/api` to a local FastAPI
process (uvicorn with reload), so both sides hot-reload.

## Server and API

### The server translates; the frontend never builds a `PlanRequest`

The API sends and receives what the screens show: importance 1–5,
ingredient values per the typed basis ("per 100 g"), meal names, the
plan's start date, "at least: all". When the user presses **Make plan**,
the server loads the stored data, builds the `PlanRequest` and solves.
The translation is a pure function from stored data to `PlanRequest`,
covering every rule in the GUI spec:

- importance 1–5 → weight 0.25 / 0.5 / 1 / 2 / 4 (and the guard-rail
  and below/above sliders the same way);
- typed value ÷ value basis → per-unit value;
- schedule grid → one `Day` per row, `Slot("generated")` or
  `Slot("absent")` per cell; "at least: all" → `min_meals_per_day=None`;
- Each day / Plan total / Daily average → `scope` and `aggregate`;
- Must / Prefer → `hard`;
- Only / Never → `require_tags` / `exclude_tags`;
- the zero-bound field → `normalization_reference`;
- goal names, with " (2)" for a second goal on the same thing;
- recipe items, extra tags and portion-size settings.

### Endpoints

| Endpoint | For |
|---|---|
| `POST /api/login`, `POST /api/logout` | Login (see below) |
| `/api/attributes`, `/api/tags`, `/api/ingredients`, `/api/recipes` | List, create, update, delete for C1–C6. Responses include derived facts: a recipe's derived tags and per-portion totals; an ingredient's "used in N recipes"; how many ingredient values and goals an attribute delete would remove (and the same for tags), for the warning dialogs. |
| `GET/PUT /api/plan` | The plan setup, A1–A4. One plan for now. |
| `POST /api/plan/recipe-count` | The live "142 of 200 recipes can be used" count for filters being edited (A1, A4). |
| `POST /api/plan/solve` | Solve. Returns the plan, or the clash report for A5 (each clashing Must goal with its id, name and where it clashes). |
| `GET /api/health` | Checks the database is reachable; used after deploy. |

The solve runs inside the request. The GUI's **Max solving time**
(default 30 s, `solve_time_limit`) gets a ceiling of 5 minutes, and the
Cloud Run request timeout is set above that ceiling.

### Live values in the frontend

The recipe editor's per-portion totals (C2) are a plain sum of amount ×
value, so the frontend works them out as the user types. Anything that
needs library rules (tag derivation, which recipes pass the filters)
comes from the server, so those rules exist only once.

### Typed API

FastAPI publishes an OpenAPI description. `openapi-typescript` generates
`web/src/api/schema.ts` from it, and a test fails when the generated
file is out of date.

## Frontend

Vue 3 single-file components with `<script setup lang="ts">`, Vue
Router for the five pages (C0), and Quasar as a Vite plugin (no Quasar
CLI). Quasar was chosen over Vuetify for its mobile-first, touch-friendly
components; the GUI is designed at phone width (GUI spec decision 1).

Quasar components for the wireframes' controls:

| Wireframe control | Quasar |
|---|---|
| Hamburger menu (C0) | `QDrawer` in a `QLayout` |
| Goal editor bottom sheet (A3) | `QDialog` with `position="bottom"` |
| Start date (A2) | `QDate` in a popup |
| Any / Only / Never (A4), Must / Prefer (A3) | `QBtnToggle` |
| Importance 1–5 | `QSlider` with markers |
| Steppers, numbers | `QInput type="number"` with +/− buttons |
| Fixed **Make plan** button | `QFooter` or `QPageSticky` |

All GUI text goes through vue-i18n from the start, with an English
message file only (GUI spec decision 6). Quasar's own Swedish language
pack covers its built-in texts when Swedish is added.

The app shows the login page whenever the API answers 401.

## Storage

### Tables

| Table | Columns (besides `id`) | On delete of what it points to |
|---|---|---|
| `attributes` | name (unique), unit, decimals | — |
| `tags` | name (unique), derive rule (`all` / `any`) | — |
| `ingredients` | name (unique), unit, value basis | — |
| `ingredient_values` | ingredient, attribute, value | cascade with either |
| `ingredient_tags` | ingredient, tag | cascade with either |
| `recipes` | name (unique), min/max multiplier, step, hard max multiplier, serving-cap weight | — |
| `recipe_items` | recipe, ingredient, amount | cascade with the recipe; **block** deleting the ingredient |
| `recipe_extra_tags` | recipe, tag | cascade with either |
| `plan` | one row: start date, number of days, meal names (ordered), solve time limit | — |
| `plan_slots` | day index, meal index, planned or skipped | cascade with the plan |
| `plan_day_minimums` | day index, at least (`NULL` = all) | cascade with the plan |
| `goals` | attribute, name, min, max, scope, Must/Prefer, importance, importance below/above, zero-bound reference, day guard-rail on/off and its importance | cascade with the attribute |
| `plan_tag_filters` | tag, Only / Never | cascade with the tag |

The delete rules are the GUI spec's: an ingredient in use cannot be
deleted; deleting an attribute or a tag is allowed after a warning and
cascades. The database enforces them with foreign keys.

### Details

- Rows have numeric ids and the API refers to things by id, so renaming
  an attribute or a tag changes nothing else. Names are used only when
  building the `PlanRequest`. Attribute, tag, ingredient and recipe
  names are unique in the database because `PlanRequest` validation
  rejects duplicates (`request.py`); the API reports a clash on save
  instead of at solve time.
- Ingredient values are stored as typed (per the value basis) in exact
  decimals (`NUMERIC`), so forms show exactly what was entered; the
  server divides when solving.
- Plan results are not stored. The results screen is not designed yet.
- Schema changes are Alembic migrations, run when the container starts.
  This is safe because Cloud Run is limited to one instance.
- Code uses only features both Postgres and SQLite support, so tests can
  run on SQLite (see Testing).
- Backups: Neon's free plan can restore to any point in the last 6
  hours. A JSON export/import is deferred (`future-features.md`).

## Login

A login page with one password. The password is stored only as an
Argon2 hash, in Google Secret Manager. A successful login sets a signed
session cookie (HttpOnly, Secure, SameSite=Strict) that lasts 30 days.
Every `/api` route except login and health requires it; without it the
API answers 401. Wrong passwords are slowed down (a growing delay per
failed attempt).

Alternatives considered: Google Identity-Aware Proxy (no login code, but
ties the app to Google and its free availability on Cloud Run without a
paid load balancer is uncertain) and Cloudflare Access (needs an owned
domain, so not free).

## Deployment

A GitHub Actions workflow on every push to `main`:

1. Run the Python tests (SQLite and Postgres) and the frontend checks.
2. Build the image and push it to Google Artifact Registry. A cleanup
   policy keeps only the newest few images, to stay within the free
   0.5 GB.
3. Deploy to Cloud Run. GitHub signs in to Google with Workload Identity
   Federation, so no long-lived keys are stored in GitHub.
4. Call `/api/health` on the new revision; fail the run if it does not
   answer.

Pull requests run step 1 only.

Cloud Run settings:

| Setting | Value |
|---|---|
| Min / max instances | 0 / 1 |
| CPU / memory | 1 vCPU / 2 GiB |
| Request timeout | 360 s (the 5-minute solve ceiling plus margin) |
| Billing | Request-based (CPU only during requests) |
| Region | `europe-north1`; Neon in an EU region |

Secrets in Secret Manager: database URL, session signing key, password
hash. A budget alert at $1 on the Google project emails the owner if
anything starts costing money.

The repo gets a setup guide (`docs/deploy.md`) with the one-time steps
the owner does in their own accounts: the Google Cloud project, Artifact
Registry, Workload Identity Federation, secrets, budget alert, and the
Neon database. Claude writes the code, workflow and guide but does not
connect to the live environment.

## Testing

All of this runs in CI on every push and pull request; the repo has no
CI today.

**Server (pytest, alongside the library tests):**

- **Translation tests:** one test per mapping rule listed under
  "The server translates", as plain function tests with no database or
  HTTP.
- **API tests:** FastAPI's test client against in-memory SQLite: create,
  update and delete for each catalog resource; the delete rules (in-use
  ingredient blocked, attribute and tag deletes cascade); solve returning
  a plan, and returning the clash report for clashing Must goals; recipe
  count; login (no session → 401, wrong password delayed, cookie flags).
- **Migration test:** run all Alembic migrations on an empty database and
  compare the result with the models.
- **Postgres:** CI runs the API and migration tests a second time
  against a Postgres service container.

**Frontend (Vitest + Vue Test Utils):**

- Unit tests: per-portion totals, the range wording ("at least 120 g",
  "1 800–2 200 kcal"), the goal name that follows attribute and scope
  until edited.
- Component tests: the goal editor's conditional fields (zero-bound
  field, importance only for Prefer, guard-rail only for Daily average,
  below/above only with both bounds) and the Any/Only/Never rows.
- `vue-tsc` type check, ESLint, and the generated-types check.

**End to end (Playwright, a handful of tests):** the built container
against Postgres in a phone-sized browser. Log in; add an attribute, an
ingredient, a recipe and a goal; make a plan. Then add a clashing Must
goal and check that the "No plan possible" card appears.

The deployment itself is checked only by the health call after deploy.

## Not in this spec

- The results screen (still undesigned; see the GUI spec).
- Several users, accounts, several saved plans.
- JSON export/import (`future-features.md`).
- Visual style beyond Quasar's defaults.

## Defaults chosen without a user decision

Proposed in the sections the user accepted, not discussed further:

- 5-minute ceiling on Max solving time; Cloud Run request timeout 360 s.
- 30-day session; growing delay on failed logins.
- 1 vCPU / 2 GiB; region `europe-north1`.
- Migrations on container start rather than as a separate job.
