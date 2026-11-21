# 25: The recipe index

**What to build:** Recipes are an A-to-Z index under letter headings, each with a small drawn plate, its tags and its per-portion totals. The owner searches by name and narrows with quick tag chips (every tag some recipe has, in tag order; all chosen tags must match). "No recipes yet" and "No recipes match" (with a way to clear the search) explain empty results. An add menu offers "New recipe" and "Import recipe", the import disabled with "Needs an AI key" when the server has none; the index never waits for that check.

Spec: "Implementation Decisions › Performance and React practice" (AI-key check never blocks); "Out of Scope" (no "not this week" marker); stories 109–114.

- Replaces the `/recipes` stub. Plate and Chips from ticket 10; pure lists module for search.
- The add menu is an accessible menu button (or disclosure) in its own component.
- Parity checklist: the Vue `RecipesPage` and `AddMenuButton` tests.

Blocked by: 08, 10

Status: ready-for-agent

- [ ] App tests: letter grouping and order; search; tag chips intersect; both empty states and clearing; add menu items and the AI-key-disabled state; the list shows while the AI-key call is still pending
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#recipes`; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
