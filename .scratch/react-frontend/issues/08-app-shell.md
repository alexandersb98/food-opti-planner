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

Status: done

- [x] App tests (port the Vue main layout's menu tests and the router's session tests): Contents lists the eight pages in order with folios and descriptions; counts fetched on every open; current page marked; Log out calls the server and lands on login; Escape and the close button return focus to Contents
- [x] App tests: a 401 session sends `/recipes` to `/login?redirect=/recipes` and `/` to `/login`; an unreachable server shows the page; a later 401 from a page call goes to login with the current path; `/plan/schedule` and `/plan/recipes` land on `/` with the `sheet` parameter
- [x] Every route in the spec's table renders its stub with the right running head; detail routes show their registry page's folio
- [x] Unit test for the registry (order, folios, detail routes' parent)
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2's masthead, running head and Contents dialog (open Contents on `#plan`); desktop also checked against D2 at 1280 px; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

**Where things are.** `web/src/app/shell/`: `registry.ts` (pages, folios, `detailRoutes`, `pageFor(path)`), `Shell.tsx` (layout, Contents state, counts, the client's 401 handler), `Masthead.tsx`, `Contents.tsx`, `session.ts` (`sessionLoader`, `loginPath`), `toast.ts` + `Toast.tsx` (`toast(message)`; `toastStore.reset` is in the harness's `resetStores`), `runningHead.ts` (`useRunningHead(text)` for pages such as the recipe spread), `PageStub.tsx`, `NotFound.tsx`, `shell.css`. Stubs: one file per page under `pages/<page>/` (`brief/Brief`, `menu/Menu` for `/plans/new` and `/plans/:id`, `archive/Archive`, `recipes/RecipeIndex`, `recipe/RecipeSpread` for `/recipes/new` and `/recipes/:id`, `import/Import`, `ingredients/Ingredients`, `ingredient/Ingredient`, `attributes/Attributes`, `tags/Tags`, `settings/Settings`, `data-source/DataSource`, `login/Login`). Each names the ticket that replaces it. Ticket 01's Placeholder page is gone; the shell tests cover what its tests did.

**Decisions.**
- The session is checked by the shell route's loader when the shell first opens (`shouldRevalidate: () => false`), not on every navigation as Vue's guard did; later 401s go through the client's handler, which the shell sets (and clears on leaving). `/login` and `/specimen` sit outside the shell. Unknown paths show "No such page" inside the shell.
- `/plan/schedule` and `/plan/recipes` are loader redirects to `/?sheet=schedule` and `/?sheet=filters` (they replace the history entry).
- The Contents are a `div role="dialog" aria-modal` (as in D2), not a native `<dialog>`: jsdom has no `showModal`, and ticket 09 owns any polyfill. The masthead and page get `inert` while it is open (focus stays inside, checked in Chromium), the body's scroll is held, Escape and the close button close it with D2's fade and focus returns to Contents; following a link closes it at once and focuses the page's `main`.
- Counts are fetched on every opening in the click handler and never awaited; the last counts show until the new ones arrive. They sit under the page number in serif italic ("8 recipes"), which D2 doesn't have. Log out is a last row in serif italic; a failed logout says so under it (`shell.logoutFailed`).
- The Contents kicker is today's ISO week and date ("Week 47, Saturday 21 November"); D2 shows the plan's week, which the shell doesn't load.
- The swipe hint at the foot of the Contents is hidden for a fine pointer (swipes are touch only).
- The running head is `aria-hidden` (as in D2; the page's h1 names the page) and swaps in for the wordmark after 160 px of scroll. The wordmark is a link with D2's label. The document title is "<page>, The Weekly Table".
- Desktop (from 768 px): a 720 px column on the desk with D2's shadow, 28 px of desk above and below, and `--gutter` set to 48 px inside the shell (a local override in `shell.css`). The Contents stay full-screen as in D2, with a 560 px column on desktop.
- New copy is in a new `shell` namespace directly after `pages` in `en.json`. The Attributes and Tags descriptions are new ("Nutrients and other measures", "Labels for recipes and ingredients"); the brief's says "recipe filters" for D2's "rules".

**Screenshots** (390 × 844 and 1280 × 800, both editions, against D2 `#plan` and `#recipes`): masthead, scrolled running head and Contents match D2 in type, spacing and rules in both editions; no sideways scroll at 320 px.

**For the README / later tickets.**
- Ticket 12: order from `registry`, the current page from `pageFor(useLocation().pathname)`; the page's main region is `main#page` (tabIndex -1) in `Shell.tsx`; turn links and folio go there.
- Pages call `toast(message)` from `app/shell/toast` and `useRunningHead(text)` from `app/shell/runningHead`.
- Ticket 42: `shell.css` sets `scroll-padding-top` on `html:has(.masthead)` and overrides `--gutter` on desktop; fold into tokens/base if wanted.
