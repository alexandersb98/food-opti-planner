# 21: The Menu: reading a plan

**What to build:** A made plan reads as a menu card: an ornament, "The Menu", the date range, the number of days and dishes, whether it is saved, and a status stamp ("Best plan", "Time ran out", "Stopped early", with the full status in words for screen readers). Each day is a section with weekday and date; each meal is a course with the recipe and its portion multiplier, skipped meals shown as "skipped" (dining out), small margin figures per dish, and the day's totals at its foot (goal attributes first or the first three, misses in the warning colour and marked for screen readers, all attributes on request). A planned meal opens its ingredients scaled to the portion with its totals; the dish links to its recipe by exact name when it exists. With no unsaved plan and no clash, `/plans/new` shows a blank card with "Compose the week" and a link to the brief.

Spec: "Implementation Decisions › Routes" (`/plans/new`, `/plans/:id`), "› Specific interactions" (Menu days, Margin figures, Dish to recipe link), "Assumptions to confirm" 8, 11; stories 86–96, 103, 104.

- Both `/plans/new` (unsaved plan) and `/plans/:id` (saved plan) through one page; all days on one scrolling page, in order (no carousel).
- `?day=` scrolls to and focuses that day; `?meal=` opens that meal; without them, scroll to today when covered; a "Today" jump when today is covered and the owner looks elsewhere.
- Margin figures: the dish's first two attributes in attribute order. Missed values from the server's per-day misses (pure misses and totals modules).
- The just-composed reveal (days set one after another, the stamp lands) runs once per new plan, never with reduced motion.
- Leave a clearly marked place in the page for the colophon and actions (ticket 22) and for the Editor's note branch on `/plans/new` (ticket 23), each one line in this page.
- Parity checklist: the Vue `ResultsPage` tests about days, meals, totals, misses and meal ingredients.

Blocked by: 06, 08, 10

Status: done

- [x] App tests: card header and stamp text (visible and screen-reader); day and course text with multipliers; skipped meals; margin figures; day totals default set, misses marked, expand to all; meal ingredients scaled; dish link only when the name matches a recipe; `?day=`/`?meal=` handling and the Today jump; blank card; load failure and Try again
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#menu` (card, stamp, days, margins, day totals) and the reveal with and without reduced motion; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

**Where things are** (`web/src/app/pages/menu/`): `Menu.tsx` (route component for `/plans/new` and `/plans/:id`: loading, the clash branch, the blank card, `?day=`/`?meal=`), `MenuCard.tsx` (card header, stamp, days, Today jump, end key, reveal), `MenuDay.tsx` (a day: courses, margin figures, ingredient panel, day totals), `menuText.ts` (long date range, ISO week, today's day, portion fractions "1½"), `composed.ts` (the reveal's router state), `menu.css` (prefix `menu-`, ported from D2's `.menu-card`, `.stamp`, `.day`, `.course`, `.margin-note`, `.day-totals`, `.blank-card`), `Menu.test.tsx` (22 app tests).

**Places left for later tickets** (one line each in `Menu.tsx`):
- Ticket 22: the JSX comment after `<MenuCard …/>` ("The colophon and actions (ticket 22) go here"); `page.setData({ plan })` updates the shown plan after an action. Ticket 22 loads `/api/plan-results/today` itself (only "Use for today" needs it); this page does not.
- Ticket 23: `if (clash) return null` with the comment above it; `clash` is already the solve store's `failure === 'infeasible'` on `/plans/new` (read as a derived boolean). Replace `null` with `<EditorsNote />`.

**For ticket 20 (reveal contract).** The just-composed reveal runs when The Menu is opened with router state `composedState` from `pages/menu/composed.ts`: `navigate('/plans/new', { state: composedState })`. It runs once per plan id (a module-level set) and never with `prefers-reduced-motion` (the class isn't added; the CSS also turns it off).

**Decisions and deviations.**
- Data: `/plans/:id` loads that plan; `/plans/new` asks `/api/plan-results` for the unsaved id, then loads it (an unavoidable two-step); no unsaved plan gives the blank card, not Vue's "Could not load the plan". The recipe list (`/api/recipes`) loads in parallel and is never waited for; without it dishes are plain text. A visually hidden h1 "The Menu" stays while loading or failed, so the page always has its heading.
- Stamp: visible short text (`plan.statusShort`, aria-hidden) plus the full status for screen readers ("Status: Best possible plan", from `results.status`).
- Count in numerals ("7 days, 20 dishes"), not D2's words ("Seven days"): number words don't translate through the message file. The kicker is the plan's week and long range ("Week 47, 21–27 November"). D2's demo switch is not ported.
- Portion: "× 1½" in the accent only when not 1 (as D2), with ", 1.5 portions" for screen readers. Vue showed "· 1 ×" on every meal.
- Opening a meal's ingredients: the dish name is the recipe link (story 94), so the meal's name above it ("Lunch ⌄") is the toggle button (`aria-expanded`, named "Lunch, ingredients", 24 px tall). The panel lists ingredients with dotted leaders and amounts to 2 decimals, then the meal's totals. D2 has no such panel; it is drawn in D2's idiom (an accent-soft rule at the left).
- Margin figures: the first two attributes' values with units (first bold, as D2); attribute names visually hidden and named once in the end key ("Margins: energy and protein for each dish."), plus "† a day goal missed." when a day goal was missed. No margin column when the plan has no attributes.
- Day totals: `dayLine` (goal attributes, or the first three) as a list labelled "Day totals"; misses in the accent with D2's dagger and "(goal missed)" for screen readers; "Show all N" / "Show fewer" (`aria-expanded`) lists every attribute, misses still marked. Day headings include the date ("Wednesday 23 Sep") and a "today" note.
- Landing: `?day=` focuses that day's section (tabIndex -1; focus-visible draws an accent underline under the weekday instead of a ring); `?meal=` opens that meal on the `?day=` day, else today, else the first day (Vue's rule); without `?day=` the page scrolls to today unless today is the first day. Out-of-range or skipped targets are ignored.
- Today jump: a sticky ink button at the foot of the screen ("↑ Today" / "↓ Today"), shown while the plan covers today and today's section is out of sight (IntersectionObserver; without it, judged from where the page opened). It scrolls to and focuses today's section.
- Blank card: one primary link "Compose the week" to the brief (the solve and its composing view live on the brief, ticket 20), instead of D2's Compose button plus "Read the brief first".
- Dish links show a faint rule-coloured underline at rest (D2 shows it only on hover) so they read as links on touch.

**Screenshots** (`npm run shot`, 390 × 844 and 1280 × 800, paper and evening, against D2 `#menu`): card frame, ornament, title, stamp, double rule, days, courses, margins and day totals match D2 in type and spacing in both editions. Fixed during the pass: the kicker lost its accent to `.kicker` (global CSS loads after page CSS, so the rule is `.menu-page .menu-issue`), and the date inside the h2 inherited the heading's tracking and optical size ("21NOV"). Reveal checked mid-animation (days fading in, stamp not yet landed) and absent with reduced motion. No sideways scroll at 390.

**For the README.** Ticket 20 opens The Menu with `navigate('/plans/new', { state: composedState })` (`app/pages/menu/composed.ts`) to get the reveal. Ticket 42: global CSS is imported after the route modules in `main.tsx`, so page rules that override base classes (such as `.kicker`) need one more class of specificity.
