# 29: The ingredient page

**What to build:** An ingredient has a page in D2's look with its name, the unit it is measured in (unit field: from the catalogue grouped by kind, preferred first, or typed), its value basis following the unit unless changed, a value per attribute (empty meaning 0) and its tags. A new ingredient starts in the preferred mass unit. Errors show on their fields. "Used in n recipes · Show" lists those recipes on request; delete is refused while recipes use it and its confirmation says which conversions go with it.

Spec: stories 155–157, 161, 162 (the unit-change question is ticket 37; conversions ticket 30; the source link ticket 31).

- Replaces the `/ingredients/new` and `/ingredients/:id` stubs. The form is a component that can also run inside a sheet with a given starting name and report the saved ingredient (used by ticket 35's "+ New ingredient").
- Unit field from ticket 11, preferences and unit catalogue from ticket 07, Confirm from ticket 09.
- Leave clear places, one line each, for the conversions section (ticket 30), the source section and updates banner (ticket 31) and the unit-change question call (ticket 37).
- Parity checklist: the Vue `IngredientPage` and `IngredientForm` tests for these stories.

Blocked by: 08, 09, 10, 11

Status: ready-for-agent

- [ ] App tests: new ingredient starts in the preferred mass unit; basis follows the unit until changed; empty values sent as 0; each error of story 157 on its field (name missing or in use, unit missing or not for an ingredient, non-mass unit for a linked ingredient, basis, number invalid or too long); used-in list on Show; delete refused while used; confirmation names the conversions
- [ ] The form works inside a sheet (one component test or app test through a temporary host is enough)
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#ingredients` (D2 has no ingredient editor: use its list and form styling); differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
