# 11: Unit field (combobox)

**What to build:** The unit field used by the ingredient form, Attributes and "Create attribute…": the owner types a unit or picks one from the catalogue grouped by kind with the preferred unit first; typed text is kept as typed. It follows the ARIA 1.2 combobox pattern and D2's look.

Spec: "Implementation Decisions › Modules" (UI primitives: Combobox); "Assumptions to confirm" 1 (component tests for the combobox); stories 155 (unit part), 168 (unit part), 187 (unit part).

- Options from the unit catalogue store (ticket 07), grouped by kind, the preferred unit (preferences store) first in its group; an optional restriction to one kind.
- Typed text kept as typed (no forced match); arrow keys, Enter, Escape, `aria-activedescendant`, listbox with groups; works with Field's label, hint and error.
- Parity: the Vue `UnitField` component tests.
- Specimen section (README Conventions).

Blocked by: 04, 05, 07

Status: ready-for-agent

- [ ] Component tests ported from the Vue `UnitField` tests (grouping, preferred first, typed text kept, keyboard selection, restriction to a kind)
- [ ] Screen reader semantics checked: combobox role, expanded state, active option announced
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2's form fields (any sheet on `#plan`); D2 has no combobox, so match its field styling; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
