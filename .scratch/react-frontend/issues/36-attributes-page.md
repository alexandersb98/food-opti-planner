# 36: The Attributes page

**What to build:** Attributes are listed in the D2 look with unit and decimals. An attribute opens in place (one open at a time, styled as an annotated entry) to edit its name, unit (unit field) and decimals, saved when it closes or another opens and staying open if the save fails; "+ New attribute" adds one in place; errors (name missing or in use, decimals out of range) show on their fields; delete says it also removes the values from n ingredients and n goals and clears its source mapping.

Spec: "Implementation Decisions › Specific interactions" (Attributes and Tags keep "one open row at a time, saved when it closes"); stories 167–170, 172 (the unit-change question is ticket 37).

- Replaces the `/attributes` stub; unit field (ticket 11), Confirm (ticket 09).
- Leave a clear place, one line, for the unit-change question call (ticket 37).
- Parity checklist: the Vue `AttributesPage` tests other than unit changes.

Blocked by: 08, 09, 10, 11

Status: ready-for-agent

- [ ] App tests: list text; open, edit and save on close and on opening another; stays open on failure; new attribute; each error on its field; delete confirmation counts and call
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no Attributes page: use D2's `#ingredients` list and the annotated (red pencil) editing style; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
