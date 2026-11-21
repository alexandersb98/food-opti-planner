# 30: Ingredient conversions and the conversion sheet

**What to build:** The ingredient page lists its conversions ("1 dl = 100 g") with add, edit and delete; delete disabled while a recipe uses one; AI-suggested ones marked. The conversion sheet refuses the ingredient's own unit, a duplicate and a bad number, and says only the number can change when a recipe uses the unit.

Spec: "Implementation Decisions › Specific interactions" (conversions are sheets); stories 159, 160.

- The conversion sheet is a reusable component: opened for an ingredient (optionally for a given unit), it reports the saved conversion, so a recipe line can use it ("New unit…", ticket 33).
- Fills the conversions place on the ingredient page (ticket 29) with one line.
- Parity checklist: the Vue `ConversionsCard` and `ConversionDialog` tests.

Blocked by: 29

Status: ready-for-agent

- [ ] App tests ported from `ConversionsCard` and `ConversionDialog` (list text, add, edit, delete disabled when used, AI marker, each refusal on its field, number-only edit when used)
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 bottom sheet styling (`#plan` sheets) and D2's list rules; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
