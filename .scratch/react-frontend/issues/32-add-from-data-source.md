# 32: Add from data source

**What to build:** From the Ingredients page, "Add from data source" opens a full-screen sheet: pick a source (the last one remembered), search its foods twenty at a time with "Show more", preview the ingredient (unit, basis, values copied, columns not copied, source tags), change its name and tags, be warned about an existing ingredient from the same food, and add it. Late search answers are dropped and a withdrawn food is explained.

Spec: "Implementation Decisions › Performance and React practice" (lazy: Add from data source is a separately loaded chunk); stories 154 (entry), 165, 166.

- Full-screen Sheet variant (ticket 09); loaded lazily.
- Adds one line to the Ingredients page's add menu (ticket 28).
- Parity checklist: the Vue `AddFromSourceDialog` tests.

Blocked by: 09, 28

Status: ready-for-agent

- [ ] App tests ported from `AddFromSourceDialog` (remembered source, paging with Show more, late answer dropped, preview content, name and tag edits, same-food warning, withdrawn food, add sends and lands on the new ingredient or list as today)
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no such screen: use D2's full-screen Contents and sheet styling; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
