# 31: Ingredient source link and updated values

**What to build:** A linked ingredient shows where it comes from in the source's colour, "No longer in the source" when withdrawn, and "Unlink from source" with a confirmation. When the source has new values a banner lists old and new per attribute with Accept and Keep mine.

Spec: stories 163, 164.

- Source colour text contrast from the pure colours module.
- Fills the source place on the ingredient page (ticket 29) with one line.
- Parity checklist: the Vue `SourceChip` and `UpdatedValuesBanner` tests and the `IngredientPage` source tests.

Blocked by: 29

Status: ready-for-agent

- [ ] App tests: source name in colour with readable text; withdrawn note; unlink confirms and sends; banner lists old and new; Accept and Keep mine send the right calls and the banner goes
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no source chip: use D2's rule tags and banner styling, in both editions with a light and a dark source colour; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
