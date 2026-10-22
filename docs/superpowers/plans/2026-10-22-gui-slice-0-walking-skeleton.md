# GUI Slice 0 — Walking Skeleton Implementation Plan

**Goal:** The project layout, build, tests and CI for the GUI, with no
features: a FastAPI server with a health check and migrations, a Vue 3 +
Quasar app with the menu and five empty pages, one container serving
both, and CI on every pull request.

**Architecture:** `server/` is a FastAPI app made by
`create_app(settings)`. It runs Alembic migrations on startup, serves
the API under `/api` and the built `web/dist` at `/` (any other path
gets `index.html`, for the app's routes). `web/` is a Vite app whose
menu is generated from one list of pages in `router.ts`; later slices
swap a page's placeholder for its screen. The server's OpenAPI
description is committed as `web/openapi.json`, and `web/src/api/schema.ts`
is generated from it. A test on each side fails when either is stale.

**Tech Stack:** Python 3.11+ (3.13 in the container), FastAPI,
SQLAlchemy 2, Alembic, psycopg 3, uvicorn; Node 22, Vue 3, Vue Router,
vue-i18n, Quasar (Vite plugin), TypeScript 5.9, Vitest, Vue Test Utils,
jsdom, ESLint, vue-tsc, openapi-typescript; GitHub Actions.

**Specs:** [`2026-10-22-gui-tech-stack-design.md`](../specs/2026-10-22-gui-tech-stack-design.md)
(the "stack spec") and slice 0 in
[`2026-10-22-gui-slices.md`](2026-10-22-gui-slices.md).

**Status:** Built as a prototype before this plan was written, and
committed task by task on branch `claude/slice-0-walking-skeleton`. Each
task below names its commit's files and how it was checked. The code
itself is in the commits rather than repeated here.

## Global Constraints

- `meal_planner/` is not changed and never imports `server/` or `web/`.
- The library keeps `ortools` as its only runtime dependency; server
  packages are the `server` optional group in `pyproject.toml`.
- Server tests use SQLite, or Postgres when `TEST_DATABASE_URL` is set
  (CI does both).
- All GUI text goes through vue-i18n, English file only.
- No deploy step (slice 2).

## Interpretations made in this plan

1. **Settings are plain environment variables** (`DATABASE_URL`,
   `WEB_DIST`, and `PORT` in the container), read by a small dataclass.
   No `pydantic-settings` dependency.
2. **Health answers `{"database": true}` with 200, or
   `{"database": false}` with 503** when `SELECT 1` fails.
3. **The OpenAPI staleness check is two tests.** `tests/server/test_openapi.py`
   checks that `web/openapi.json` matches the app, and `web/src/api/schema.test.ts`
   checks that `schema.ts` matches `openapi.json`. Neither needs the
   other toolchain, and `npm run gen:api` updates both files.
4. **One placeholder page component** serves all five routes, showing
   the page name, so the menu can be tested now.
5. **TypeScript is pinned to 5.9.** TypeScript 7 is `latest` on npm, but
   `openapi-typescript` 7.13 accepts only TypeScript 5 and
   `typescript-eslint` only below 6.1.
6. **ESLint fails on warnings** (`--max-warnings=0`).
7. **`npm audit` reports 4 high-severity advisories**, all in
   development-only lint packages (`braces`, reached through
   `@vue/eslint-config-typescript`). None of them ship in the built app.
   They are left as they are.
8. **The app column is at most 600 px wide and centred** on larger
   screens (GUI spec decision 1: same layout, centred).

## Tasks

### Task 1: Server skeleton

**Files:** `server/{__init__,settings,db,models,app}.py`,
`server/api/{__init__,health}.py`, `server/migrations/{env.py,script.py.mako,versions/0001_empty.py}`,
`tests/server/{conftest,test_health,test_migrations,test_frontend}.py`,
`pyproject.toml`, `.gitignore`.

**Interfaces produced:**
- `server.settings.Settings(database_url, web_dist, migrate_on_startup)`, `Settings.from_env()`
- `server.db.Base` (declarative base; later slices add models and import them in `server/models.py`), `make_engine(url)`, `migrate(url)`
- `server.app.create_app(settings=None) -> FastAPI`; the engine is `app.state.engine`
- `server.api.router` (prefix `/api`); later slices include their routers here
- Test fixtures: `database_url` (fresh SQLite file, or an emptied Postgres schema), `web_dist`, `client` (a `TestClient` with lifespan run)

**Tests:** health 200 and 503; migrations match the models
(`alembic.autogenerate.compare_metadata` is empty); the app migrates on
startup; `/` and page routes serve `index.html`; built files are served;
unknown `/api/...` paths are a JSON 404; path traversal falls back to
`index.html`.

**Checked:** 10 server tests pass on SQLite and on Postgres 16.

### Task 2: Web app skeleton

**Files:** `web/{package.json,package-lock.json,index.html,vite.config.ts,tsconfig.json,eslint.config.ts}`,
`web/src/{main.ts,App.vue,env.d.ts,i18n.ts,router.ts,test-setup.ts}`,
`web/src/i18n/en.json`, `web/src/layouts/MainLayout.vue`,
`web/src/pages/PlaceholderPage.vue`, `web/src/layouts/MainLayout.test.ts`.

**Interfaces produced:**
- `pages` in `router.ts`: `{ path, name, icon, component }` per menu entry; `name` is also the i18n key under `pages.`
- `makeRouter(history?)`, `makeI18n()`, used by `main.ts` and by tests
- `src/test-setup.ts` stubs `ResizeObserver`, which jsdom lacks and Quasar's layout uses

**Tests:** the menu lists Plan, Recipes, Ingredients, Attributes, Tags
in order; the start page is Plan.

**Checked:** lint, typecheck, Vitest and `vite build` pass. The built
app, served by uvicorn and opened in Chromium at 390 px, shows the
menu, navigates to Ingredients and logs no console errors.

### Task 3: Typed API

**Files:** `server/export_openapi.py`, `web/openapi.json`,
`web/src/api/schema.ts`, `web/src/api/schema.test.ts`,
`tests/server/test_openapi.py`.

**Tests:** both staleness tests (interpretation 3). Checked by editing
`schema.ts` by hand (the test fails) and regenerating (it passes).

### Task 4: Container and CI

**Files:** `Dockerfile`, `.dockerignore`, `.github/workflows/ci.yml`.

- Dockerfile stage 1 (`node:22-slim`) runs `npm ci` and `vite build`;
  stage 2 (`python:3.13-slim`) installs `.[server]` and runs
  `uvicorn --factory server.app:create_app` on `$PORT` (default 8080).
- CI jobs: Python tests on SQLite and Postgres 16 (a matrix with a
  Postgres service), frontend lint + typecheck + tests, and
  `docker build`.

**Checked:** `actionlint` passes. Docker cannot run in the environment
where this was built, so the image is first built by CI. As a stand-in,
the package was installed into a fresh virtualenv outside the repo
(which checks that the migrations ship in the package) and started with
the container's command. It migrated an empty Postgres database to
revision `0001` and served `/api/health` and the app.

### Task 5: Docs

**Files:** `README.md` (how to run the GUI and its checks), this plan.

## Done when

`docker run` shows the menu at phone width and `/api/health` answers;
CI is green. The container part is shown by CI's `docker build`. Running
it is first done for real in slice 2 (deploy).
