# Meal Plan Optimizer

An optimization-based meal planning tool: give it a set of ingredients and a
set of constraints (nutrient targets, budget, etc.), and it lays out a
multi-day eating plan that satisfies them as well as possible. When
constraints conflict, it finds a good-enough compromise instead of
failing outright.

**Status:** First slice implemented as the `meal_planner` library:
recipes, tags, day and horizon constraints (hard and soft), serving
multipliers, and STRICT solving with violation and conflict reports.
The GUI is being built: so far a server (`server/`) and a web app
(`web/`) with empty pages.

Run the Python tests with `python3 -m pip install -e '.[server,dev]'` and
then `python3 -m pytest`. Server tests use SQLite; set
`TEST_DATABASE_URL=postgresql+psycopg://...` to run them on Postgres. The
reference-scale benchmark is opt-in: `python3 -m pytest -m benchmark -s`.

Run the GUI locally:

```
python3 -m uvicorn --factory server.app:create_app --reload   # API on :8000, SQLite in ./planner.db
cd web && npm install && npm run dev                          # app on :5173, forwards /api
```

Frontend checks: `npm run lint`, `npm run typecheck`, `npm test` in
`web/`. After changing the API, run `npm run gen:api` in `web/` to
update `web/openapi.json` and `web/src/api/schema.ts`; tests fail
until they are up to date.

See [`docs/superpowers/specs/2026-09-15-meal-optimizer-design.md`](docs/superpowers/specs/2026-09-15-meal-optimizer-design.md)
for the design notes and decisions made so far,
[`docs/superpowers/specs/future-features.md`](docs/superpowers/specs/future-features.md)
for deferred features and alternatives considered, and
[`docs/superpowers/specs/open-questions.md`](docs/superpowers/specs/open-questions.md)
for holes/open questions found in review that still need resolving.

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
