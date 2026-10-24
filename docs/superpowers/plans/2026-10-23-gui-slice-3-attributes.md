# GUI Slice 3 — Attributes Implementation Plan

**Goal:** Manage attributes (C5): list them, edit Name, Unit and
Decimals in place, add new ones and delete them after a warning, with
the attribute count in the menu.

**Architecture:** One `attributes` table (migration `0002`) and an
`Attribute` model. `server/api/attributes.py` holds the CRUD routes in
the `protected` router; each route gets a database session through
`server.db.DbSession`. A name in use answers 409 with a field error in
the same shape as FastAPI's 422s (`server/api/errors.py`), so later
catalog slices reuse it. `GET /api/counts` gives the menu its counts.
In the app, `AttributesPage.vue` replaces the placeholder and the menu
fetches the counts each time it opens.

**Tech Stack:** as slice 1. No new dependencies.

**Specs:** C5 and C0 in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md)
(the "GUI spec"), "Storage" in
[`2026-10-22-gui-tech-stack-design.md`](../specs/2026-10-22-gui-tech-stack-design.md),
and slice 3 in [`2026-10-22-gui-slices.md`](2026-10-22-gui-slices.md).

**Status:** Built and committed task by task on branch
`claude/slice-3-attributes`. As in the earlier slices, each task names
its files and how it was checked; the code is in the commits.

## Global Constraints

- `meal_planner/` is not changed (the server only reads its precision
  range).
- Server tests use SQLite, or Postgres when `TEST_DATABASE_URL` is set.
- All GUI text goes through vue-i18n, English file only.
- `web/openapi.json` and `web/src/api/schema.ts` are regenerated.

## Interpretations made in this plan

1. **Decimals is 0 to 6**, the library's precision range
   (`MIN_PRECISION`, `MAX_PRECISION`), read from `meal_planner.domain`
   so the two cannot drift apart. A new attribute starts at 3, the
   library's default (GUI spec decision 5: library defaults).
2. **Name: 1 to 100 characters; unit: up to 20 and may be empty**
   (a count needs no unit). Both are trimmed.
3. **Names are compared exactly**, as the library does: "Protein" and
   "protein" are different names.
4. **The list is in the order attributes were added**, as in the
   wireframe, so a new attribute appears where "+ New attribute" was.
5. **A name in use answers 409 with `{"detail": [{"loc": ["body",
   "name"], "type": "name_in_use", "msg": ...}]}`**, the shape of
   FastAPI's 422s. The database's unique constraint decides, so two
   saves at once cannot both win.
6. **Each attribute carries `ingredient_count` and `goal_count`**:
   what deleting it removes, for the row and the warning. Both are 0
   until slices 5 and 8 fill them in.
7. **Delete asks in a dialog** ("Delete Protein?" and what else it
   removes, or "Nothing else uses it."), instead of the wireframe's
   line always shown under the buttons: the GUI spec says delete warns,
   then removes.
8. **One row is open at a time. Done saves; opening another row or
   "+ New attribute" saves the open row first** and stays put if that
   fails. Done without changes sends nothing. A new row has Cancel in
   place of Delete.
9. **The app checks the fields before sending** (a name, decimals a
   whole number 0 to 6) and shows the server's name clash on the name
   field. The decimals field has no HTML `min`/`max`, because the
   browser would then block the form with its own message.
10. **`GET /api/counts` returns `{"attributes": n}`**; each later
    catalog slice adds its field. The menu fetches it each time it
    opens, so it shows what the pages changed, and works without it.

## Tasks

### Task 1: Server

**Files:** `server/models.py`, `server/db.py`,
`server/migrations/versions/0002_attributes.py`,
`server/api/{__init__,attributes,counts,errors}.py`,
`web/openapi.json`, `web/src/api/schema.ts`,
`tests/server/test_attributes.py`.

**Interfaces produced:**
- `server.db.DbSession`: a route's database session
- `server.api.errors.name_in_use(what)` and `NAME_IN_USE` (the 409's
  OpenAPI description), for the tag, ingredient and recipe names
- `server.models.Attribute`, `NAME_LENGTH`, `UNIT_LENGTH`
- `GET/POST /api/attributes`, `PUT/DELETE /api/attributes/{id}`,
  `GET /api/counts`

**Tests:** list, create, update, delete; trimming; invalid fields
answer 422; decimals cover the library's range; a name in use answers
409 with the field error on create and on rename, and changes nothing;
names differing in case are allowed; a deleted name can be used again;
unknown ids answer 404; counts. The "every route needs a session" test
from slice 1 covers the new routes without changes.

**Checked:** 50 server tests pass on SQLite and on Postgres 16,
including the migration test.

### Task 2: Web

**Files:** `web/src/pages/AttributesPage.vue`, `web/src/pages.ts`,
`web/src/layouts/MainLayout.vue`, `web/src/i18n/en.json`,
`web/src/test-app.ts`, `web/src/pages/AttributesPage.test.ts`,
`web/src/layouts/MainLayout.test.ts`.

**Interfaces produced:**
- `fakeServer` replies may carry a JSON body or be a function of the
  request body (`{ status, body }`), for the later screens' tests
- `.menu-count` on a menu entry's count

**Tests:** rows show unit, decimals and goals; a row opens in place and
Done sends the changes; Done without changes sends nothing; a name in
use shows on the field and the row stays open; an empty name or
decimals outside 0 to 6 are not sent; opening another row saves the
open one first; a new attribute is added at the end, or cancelled;
delete warns with the counts before deleting; a failed load offers to
try again; the menu count is fetched each time the menu opens.

**Checked:** lint, typecheck, Vitest (20 tests) and `vite build` pass.
The built app served by uvicorn and driven in Chromium at 390 px: added
three attributes, a rename to a name in use showed the message on the
field, the fixed rename saved, a delete asked first ("Nothing else uses
it."), the list survived a reload, the menu showed 2, and the page did
not scroll sideways.

### Task 3: Docs

**Files:** `README.md` (status), this plan.

## Done when

Attributes can be listed, added, edited and deleted on the Attributes
page; the menu shows their count; CI is green.
