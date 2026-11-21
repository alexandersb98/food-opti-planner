# 08: App shell: masthead, Contents, page registry, routes and the session

**What to build:** Every React route from the spec's route table exists under the app shell: a masthead with the wordmark "The Weekly Table" (a link to the brief) and a running head (folio number and page name), a "Contents" button opening a full-screen table of contents, a toast region, and the session check. Pages not built yet show a stub with their title, so later tickets only swap their own stub for the real page.

Spec: "Implementation Decisions › Routes" (whole section), "› Modules" (App shell, Page registry), "› Specific interactions" (Desktop, Copy), "› Performance and React practice" (lazy routes); stories 4–14, 20, 21, 192 (toast), 196 (page frame).

- **Page registry**: one ordered list of the eight Contents pages (brief, The Menu, recipe index, The archive, Ingredients, Attributes, Tags, Settings), each with route, title, one-line description and running-head text; detail routes name the registry page they belong to. Contents order, folios, swipe order (ticket 12) and turn links come from it. Pages can override the running-head text (a hook, e.g. a recipe spread shows the recipe name).
- **Route table**: every route of the spec's table, one line per route, each pointing at a stub page component in its own file. Import, Data source and Tags are lazy routes. `/plan/schedule` and `/plan/recipes` redirect to `/?sheet=schedule` and `/?sheet=filters` (README Conventions; tickets 16 and 19 open the sheets).
- **Session**: a root loader asks `GET /api/session`; 401 redirects to `/login` with `redirect` (left out for `/`); an unreachable server lets the page show. The client's unauthorised handler sends later 401s (except login and session) to login with the current path. `/login` is a stub outside the shell (ticket 13 builds it).
- **Contents**: a full-screen modal dialog listing the pages in order with description and page number, marking the current page (`aria-current`), the counts of recipes, ingredients, attributes and tags fetched each time it opens (never blocking it), Log out at the end (`POST /api/logout`, then login). Closes with its close button or Escape and returns focus to the Contents button. Contents styles follow D2.
- **Toast**: a polite live region and a `toast(message)` call for pages.
- **Page frame**: phone layout as D2; from about 768 px a centred column of up to 720 px on the desk background with D2's page shadow, the masthead spanning the page.
- New copy (wordmark, page names, descriptions) under new keys (README Conventions: never change an existing message's value while Vue lives).

Blocked by: 04, 05

Status: ready-for-agent

- [ ] App tests (port the Vue main layout's menu tests and the router's session tests): Contents lists the eight pages in order with folios and descriptions; counts fetched on every open; current page marked; Log out calls the server and lands on login; Escape and the close button return focus to Contents
- [ ] App tests: a 401 session sends `/recipes` to `/login?redirect=/recipes` and `/` to `/login`; an unreachable server shows the page; a later 401 from a page call goes to login with the current path; `/plan/schedule` and `/plan/recipes` land on `/` with the `sheet` parameter
- [ ] Every route in the spec's table renders its stub with the right running head; detail routes show their registry page's folio
- [ ] Unit test for the registry (order, folios, detail routes' parent)
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2's masthead, running head and Contents dialog (open Contents on `#plan`); desktop also checked against D2 at 1280 px; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
