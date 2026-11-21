# 26: The recipe spread (viewing a recipe)

**What to build:** A recipe opens as a cookbook spread: a drawn colour plate in the recipe's colour, the plate number (the recipe id), a kicker, the name as a large title, the servings and portion range, the ingredients per section (amount, unit, name; section names only when there is more than one section or it has a name), lines whose unit doesn't convert or whose ingredient no longer exists flagged, the instructions as a numbered method (one step per paragraph), the tags with the ones from ingredients marked, a per-portion nutrition table, the source as a readable link (http/https only, new tab), and "Back to the index". The running head shows the recipe's name.

Spec: "Implementation Decisions › Specific interactions" (Recipe spread: method split on blank lines, or line breaks when none; no minutes); stories 115–123.

- Replaces the `/recipes/:id` stub with the view mode of the spread page; leave an "Edit" entry point and a clear place for edit mode (ticket 27).
- Totals from the pure totals module.
- Parity checklist: the view-related parts of the Vue `RecipePage` tests (lines, flags, totals, tags, source link).

Blocked by: 08, 10

Status: ready-for-agent

- [ ] App tests: header (plate number, name, kicker, servings, portion range); section names rule; flagged lines; method steps for blank-line and line-break text; tags from ingredients marked; nutrition table; source link only for http(s) with `target` and `rel`; back link; running head shows the name
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#recipe/<id>` (view mode); differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
