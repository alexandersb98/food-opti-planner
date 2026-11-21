# 23: Editor's note: no plan possible

**What to build:** When the last solve found no plan possible and the owner hasn't dismissed it, `/plans/new` shows an Editor's note "No plan possible" in place of The Menu. It lists the rules that clash: each clashing Must goal with where it clashes (which days, or over the whole plan), with its Min/Max (and zero reference when shown) editable in place and "Make Prefer"/"Keep Must" ("Will be Prefer" when switched), and each day whose meal minimum takes part, with "Change the schedule". It says whether fixing may show another clash or that the solve stopped early. "Try again" saves changes (if any) and makes a plan again; "Dismiss" closes the note. A clash with no listed rules says only that no plan is possible with these settings.

Spec: "Implementation Decisions › Specific interactions" (Clash), "Assumptions to confirm" 7; stories 77–85.

- Clash rows from the pure clash module; the clash and minimality from the solve store (ticket 06); saving through the plan-setup store.
- "Change the schedule" goes to `/?sheet=schedule` (README Conventions).
- "Try again" goes back to the brief, where the composing view shows (follow today's Vue clash card for the exact order of save and solve).
- Field errors and a failed save shown inside the note.
- Fills the Editor's note branch left in the Menu page by ticket 21, in its own component file.
- Parity checklist: the Vue `ClashCard` behaviour and the `PlanPage` clash tests, the clash module tests.

Blocked by: 21

Status: ready-for-agent

- [ ] App tests: goal rows with days or whole plan; day rows; loosening a bound and Make Prefer then Try again sends the changed setup and the solve; Keep Must; errors and failed save inside the note; Dismiss; empty clash text; minimal vs stopped-early wording; Change the schedule navigates with `sheet=schedule`
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no clash note: compare with D2's `#menu` card and editorial notes, in the warning colour; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
