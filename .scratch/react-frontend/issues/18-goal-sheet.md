# 18: The goal sheet

**What to build:** Tapping a goal (or "Add goal") opens the goal editor as a bottom sheet with a live preview sentence: what to track from the attributes as chips, Min and Max with the attribute's unit, Each day / Daily average / Plan total, Must or Prefer with importance 1–5, the "count a miss as a percentage of" field when a bound is zero, and an Advanced part (name, different importance below and above, "also keep each day in range" with its importance) opened by itself when used. Errors show on their fields; delete is possible; a saved goal updates the brief at once with a "Goal changed." toast.

Spec: "Implementation Decisions › Modules" (Draft rules: React hook over the pure goal rules), "› Specific interactions" (sheets save on Done and stay open with errors); stories 50–58.

- A React goal-draft hook over the pure goal rules from ticket 02.
- Saves the whole setup through the plan-setup store (ticket 06); refusals mapped to fields; the Advanced part opens when an error is inside it.
- Wires into section 2's `onOpenGoal` (ticket 17); the sheet in its own file.
- Parity checklist: the Vue `GoalDialog` tests and the goal draft rule tests.

Blocked by: 09, 17

Status: ready-for-agent

- [ ] App tests ported from the Vue `GoalDialog` tests (every error case of story 56 on its field, Advanced opening itself, zero-reference field, Prefer importance, delete, save updates the brief and toasts)
- [ ] The live preview is in an `aria-live` region
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#plan` goal sheet; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
