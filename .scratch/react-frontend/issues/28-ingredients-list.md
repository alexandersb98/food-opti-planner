# 28: The Ingredients page

**What to build:** Ingredients are listed alphabetically in the D2 look, each with its basis and values ("per 100 g · Energy 389 kcal · Protein 16.9 g"). The owner searches them ("No ingredients yet", "No ingredients match"), sees ingredients with updated values from their data source marked, can show "Only with updated values (n)" when any have them, and can add a new ingredient from here.

Spec: stories 151–154 ("Add from data source" entry is added by ticket 32).

- Replaces the `/ingredients` stub; an add menu in its own component with "New ingredient" (ticket 32 adds one line for "Add from data source").
- Parity checklist: the Vue `IngredientsPage` tests.

Blocked by: 08, 10

Status: ready-for-agent

- [ ] App tests: order and value line; search and both empty states; updated marker and the toggle with its count (hidden when none); New ingredient goes to `/ingredients/new`; load failure and Try again
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#ingredients`; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
