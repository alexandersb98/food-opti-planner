# 16: The schedule sheet: start date, days and meal names

**What to build:** "Change" on the schedule opens a sheet to set up a new week: start date with the device's own date picker and the resulting date range, the number of days with a stepper within the server's limits, and the meal names, which can be added, renamed, moved up and down and removed (one always kept, at most the server's maximum). Cancel throws the changes away; Done saves them, with refusals on their fields. `/plan/schedule` (and so `/?sheet=schedule`) opens it.

Spec: "Implementation Decisions › Modules" (Draft rules: a React hook over the pure schedule rules from ticket 02), "› Routes" (`/plan/schedule`); stories 20 (schedule link), 38–42.

- A React schedule-draft hook (`useState`/`useReducer`) calling the pure rules unchanged.
- Meal names checked (none empty, none twice, not too long) with the error next to the name.
- Saves through the plan-setup store; the sheet stays open with errors on refusal.
- Opens when the brief's URL has `sheet=schedule`, then removes the parameter (replace, not push).
- Adds a "Change" button to section 1's file (ticket 15) and the sheet in its own file.
- Parity checklist: the Vue `SchedulePage` tests about dates, days and meal names, `MealNamesDialog`, and the schedule draft rule tests.

Blocked by: 15

Status: ready-for-agent

- [ ] App tests: date range follows the chosen start date; days stepper limits; add, rename, reorder, remove meals with one kept and a maximum; each name error on its field; Cancel discards; Done sends the setup; a server refusal shows on its field; `/plan/schedule` opens the sheet on the brief
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#plan` "Change" schedule sheet; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
