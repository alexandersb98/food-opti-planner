# 37: The unit-change question

**What to build:** Changing the unit of an ingredient or an attribute first asks, in a sheet, what will be converted or kept and what would be rounded; a refused change is explained under the unit (decimals needed, too large, rounds to zero, mapped from a source column of another unit; for ingredients, the reasons today's editor gives) until the owner edits it. Stored numbers are never changed by surprise.

Spec: "Implementation Decisions › Specific interactions" (unit-change question is a sheet); stories 158, 171.

- The unit-change question store (ticket 07) and the pure refusal text (moved in ticket 02); one sheet component.
- Fills the unit-change places left on the ingredient page (ticket 29) and the Attributes page (ticket 36), one line each.
- Parity checklist: the Vue `UnitChangeDialog` and unit-change composable tests and the unit-change tests of `IngredientPage` and `AttributesPage`.

Blocked by: 29, 36

Status: ready-for-agent

- [ ] App tests on both pages: the question lists converted/kept/rounded; convert, keep and cancel send (or don't send) the right calls; each refusal shows under the unit until the unit is edited
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 bottom sheet styling (`#plan` sheets); differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
