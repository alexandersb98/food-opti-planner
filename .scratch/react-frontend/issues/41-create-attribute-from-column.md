# 41: Create an attribute from a data source column

**What to build:** "Create attribute…" in a column's Attribute choice opens a small sheet with a name, a unit of the column's kind starting at the preferred unit, and decimals; saving creates the attribute and maps the column to it, saying so if only the creation worked.

Spec: story 187.

- Sheet (ticket 09), unit field restricted to the column's kind (ticket 11), preferences (ticket 07).
- Adds the option to the column choice on the data source page (ticket 40) with one line; the sheet in its own file.
- Parity checklist: the Vue `NewAttributeDialog` tests.

Blocked by: 09, 11, 40

Status: ready-for-agent

- [ ] App tests ported from `NewAttributeDialog` (unit kind and default, name and decimals errors, create then map, the partial-success message)
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 bottom sheet styling (`#plan` sheets); differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
