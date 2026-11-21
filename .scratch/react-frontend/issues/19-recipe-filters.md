# 19: Recipe filters: rule tags, usable count and the filters sheet

**What to build:** Section 3 of the brief ("Recipe filters") shows each filter as a rule tag ("Never: pork", "Only: weeknight") and how many recipes can be used as the server counts it (warning colour when none), with "See them" to the recipe index. "Change" or a rule tag opens a sheet with every tag and Any / Only / Never, updating the usable count as modes change (late answers ignored), pointing to the Tags page when there are no tags; Done saves the filters with the rest of the setup unchanged. `/plan/recipes` (and so `/?sheet=filters`) opens it.

Spec: "Implementation Decisions › Modules" (Recipe count), "› Routes" (`/plan/recipes`), "› Specific interactions" (Copy: "Recipe filters", not "Pantry rules"); stories 20 (filters link), 60–66.

- Usable count with the recipe-count rule from ticket 07 (latest question wins); `aria-live` on the count.
- Saves through the plan-setup store (ticket 06); a failed save says so.
- Opens when the brief's URL has `sheet=filters`, then removes the parameter.
- Edits only section 3's own file; the sheet in its own file (README Conventions).
- Parity checklist: the Vue `RecipeFiltersPage` and `RecipesCard` tests.

Blocked by: 07, 09, 14

Status: ready-for-agent

- [ ] App tests: rule tags text; count and its warning state; See them goes to the index; modes change the count and a late answer is dropped; empty tags state links to Tags; Done sends filters with everything else unchanged; failed save message; `/plan/recipes` opens the sheet
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#plan` section 3 and its sheet; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
