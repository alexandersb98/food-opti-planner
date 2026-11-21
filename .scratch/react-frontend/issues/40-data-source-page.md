# 40: The data source page

**What to build:** A data source page shows its version, when it was imported, its attribution and its colour (saved when the picker closes). Its columns are listed in the server's order (withdrawn last, marked) and can be searched; each has an Attribute choice offering the attributes that convert with the column's unit, those taken by another column disabled with the holder named, and "Not mapped". A refused mapping (already mapped from another column, units don't convert) is explained after the page refreshes to the truth.

Spec: "Implementation Decisions › Routes" (`/settings/data-sources/:key`, lazy route); stories 184–186 ("Create attribute…" is ticket 41).

- Replaces the lazy data source stub; Select with groups (ticket 10).
- Leave the "Create attribute…" option out (ticket 41 adds it with one line).
- Parity checklist: the Vue `DataSourcePage` and `SourceColumnRow` tests other than creating an attribute.

Blocked by: 08, 10

Status: ready-for-agent

- [ ] App tests: header facts; colour saved on close; column order and withdrawn marking; search; options limited to converting units; taken options disabled naming the holder; Not mapped; a refusal refreshes then explains
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no data source page: use D2's `#settings` and list styling; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
