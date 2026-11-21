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

Status: ready-for-agent

- [ ] App tests: card header and stamp text (visible and screen-reader); day and course text with multipliers; skipped meals; margin figures; day totals default set, misses marked, expand to all; meal ingredients scaled; dish link only when the name matches a recipe; `?day=`/`?meal=` handling and the Today jump; blank card; load failure and Try again
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#menu` (card, stamp, days, margins, day totals) and the reveal with and without reduced motion; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
