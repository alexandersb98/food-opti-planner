# GUI Slice 1 — Login Implementation Plan

**Goal:** Put every `/api` route except login and health behind one
password, with a login page in the app, so later slices write their API
tests against a logged-in client and nothing is deployed unprotected.

**Architecture:** `server/auth.py` holds an `Auth` object (on
`app.state.auth`) that checks the password against an Argon2 hash and
makes and checks signed session tokens (`itsdangerous`). The API router
has a `protected` sub-router whose dependency, `require_session`,
answers 401 without a valid cookie; later slices include their routers
in `protected`. In the app, a typed client (`openapi-fetch`) calls a
handler on any 401, which sends the user to the login page, and a router
guard asks `GET /api/session` before showing a page.

**Tech Stack:** as slice 0, plus `argon2-cffi` and `itsdangerous`
(server) and `openapi-fetch` (web).

**Specs:** "Login" in
[`2026-10-22-gui-tech-stack-design.md`](../specs/2026-10-22-gui-tech-stack-design.md)
(the "stack spec") and slice 1 in
[`2026-10-22-gui-slices.md`](2026-10-22-gui-slices.md).

**Status:** Built and committed task by task on branch
`claude/slice-1-login`. As in slice 0, each task names its files and how
it was checked; the code is in the commits.

## Global Constraints

- `meal_planner/` is not changed.
- Server tests use SQLite, or Postgres when `TEST_DATABASE_URL` is set.
- All GUI text goes through vue-i18n, English file only.
- The password is stored only as an Argon2 hash. Session cookie:
  HttpOnly, Secure, SameSite=Strict, 30 days.
- No deploy step (slice 2).

## Interpretations made in this plan

1. **Two new settings, both required:** `PASSWORD_HASH` and
   `SESSION_KEY` (the stack spec's three secrets with the database URL).
   The app refuses to start if either is missing or the hash is not an
   Argon2 hash, so a misconfigured deploy fails at once instead of
   running with a login nobody can pass.
2. **The session is a signed, timestamped token, not stored on the
   server.** Logout deletes the cookie. A copied cookie stays valid until
   it expires; changing `SESSION_KEY` ends every session. Enough for one
   user.
3. **The cookie's path is `/api`**, so it is sent only to the API.
4. **The delay is 1, 2, 4, 8, 16 seconds, then 30 seconds** for each
   further failure in a row, and resets after a successful login. It
   counts failures for the whole server, not per visitor: there is one
   user, and Cloud Run hides the visitor's address behind its proxy.
   Attempts are handled one at a time, so guesses sent in parallel
   still wait out each delay.
5. **`GET /api/session`** (204 while logged in, 401 otherwise) is added
   so the app can tell whether it is logged in before any page has API
   calls of its own. It needs a session like every other route.
6. **Logout needs a session too**, as the stack spec says for every
   route but login and health. With an expired cookie the 401 leads to
   the login page, which is where logout goes anyway.
7. **The app checks the session on every page change**, not only on
   start. It is one small request, and an expired session then shows the
   login page at the next page change. If the server cannot be reached,
   the page is shown and its own calls fail.
8. **After logging in, the app returns to the page that asked**
   (`/login?redirect=/recipes`).
9. **The login page has no menu** and only a password field (no user
   name). The menu gets a **Log out** entry below the five pages. There
   is no login wireframe in the GUI spec; this follows the other pages'
   Quasar defaults.
10. **The "every route needs a session" test reads the routes from the
    OpenAPI description**, so each route a later slice adds is checked
    without changing the test. (FastAPI 0.161 includes routers lazily,
    so `app.routes` does not list them.)
11. **Test fixtures:** `client` is now logged in, since most later API
    tests need that; `anonymous_client` has no session. Both talk
    HTTPS to the test server, because the client does not send a Secure
    cookie over plain HTTP. `make_settings(...)` gives settings with the
    test password.

## Tasks

### Task 1: Server login

**Files:** `server/auth.py`, `server/api/login.py`,
`server/api/__init__.py`, `server/hash_password.py`,
`server/settings.py`, `server/app.py`, `server/export_openapi.py`,
`pyproject.toml`, `web/openapi.json`, `web/src/api/schema.ts`,
`tests/server/{conftest,test_health,test_login,test_settings,test_hash_password}.py`.

**Interfaces produced:**
- `server.api.protected`: the router later slices include their routers
  in; it adds `require_session` to each route
- `server.auth.Auth(password_hash, session_key)`: `check_password` (async,
  applies the delay), `new_session()`, `is_session(token)`; `sleep` can
  be replaced in tests
- `server.auth.SESSION_COOKIE`, `failed_login_delay(failures)`
- `Settings.password_hash`, `Settings.session_key`
- `python -m server.hash_password`: asks for the password twice and
  prints its hash
- Test fixtures `client` (logged in), `anonymous_client`, `make_settings`

**Tests:** every `/api` route except login and health answers 401
without a session; health stays open; the right password sets the
cookie with HttpOnly, Secure, SameSite=Strict, Max-Age of 30 days and
path `/api`; a wrong password answers 401 after a delay; the delay
doubles, caps at 30 s and resets after success; logout ends the session;
a tampered, expired or wrongly signed cookie answers 401; the app
refuses to start without a valid hash or a key; the hash script.

**Checked:** 26 server tests pass on SQLite and on Postgres 16. The
"every route" test fails when the logout route is moved out of
`protected`. Two wrong passwords against a real server took 1.1 s and
2.1 s.

### Task 2: Web login

**Files:** `web/src/api/client.ts`, `web/src/router.ts`,
`web/src/pages.ts`, `web/src/App.vue`,
`web/src/layouts/MainLayout.vue`, `web/src/pages/LoginPage.vue`,
`web/src/i18n/en.json`, `web/src/test-app.ts`,
`web/src/layouts/MainLayout.test.ts`, `web/src/pages/LoginPage.test.ts`,
`web/package.json`, `web/package-lock.json`.

**Interfaces produced:**
- `api` in `api/client.ts`: the typed client every later screen uses,
  e.g. `api.GET('/api/attributes')`
- `pages` moves to `pages.ts`; the menu pages are children of the
  layout route, and `/login` is a route of its own
- `loginRoute(redirect)` in `router.ts`
- `fakeServer({...})` and `mountApp(path)` in `test-app.ts`, for
  component tests of whole screens

**Tests:** the menu lists the five pages and Log out; the start page is
Plan; Log out calls the server and shows the login page; without a
session a page shows the login page; a 401 from any API call leads to
the login page; a wrong password says so; the right password returns to
the page that asked.

**Checked:** lint, typecheck, Vitest and `vite build` pass. The login
tests fail when the guard or the 401 handler is disabled. The built app
served by uvicorn and driven in Chromium at 390 px: `/recipes` showed
the login page, a wrong password showed "Wrong password.", the right
one showed Recipes with the cookie flags above, a reload stayed logged
in, and after Log out `/tags` showed the login page.

### Task 3: Docs

**Files:** `README.md` (the two settings for running locally), this plan.

## Done when

Every `/api` route but login and health answers 401 without the
password's session; the app shows the login page whenever that happens;
CI is green.
