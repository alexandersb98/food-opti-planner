# 20: Composing the week: the solving view and its outcomes

**What to build:** While a plan is being made, a full-screen "Composing the week" view shows the kicker, the seconds counted against the time allowed, a progress ruler, the galley of days with a rotating status line, and Cancel (also Escape), which shows "Stopping…" until the server stops. A solve still running when the owner comes back to the brief shows the view again. A finished plan opens The Menu if the owner is still on the brief (otherwise the brief's new-plan line shows it); an infeasible solve opens `/plans/new` (the Editor's note) likewise; any other failure shows on the brief as a dismissible note with the reason and what to try.

Spec: "Implementation Decisions › Specific interactions" (Solving view, Clash); "Further Notes" (no invented "musings", no prototype status switch); stories 72–76, 194 (composing view).

- Reads and drives the solve store (ticket 06); the navigation on outcome happens here, only when the current route is the brief.
- The clock is the browser's against the time allowed, full past it. The ruler is a `progressbar` with an accessible value. The galley shows days only, never invented recipes.
- Failure note texts for: no plan in time, no recipes, no usable recipes, too large, stopped, busy in another tab, error.
- Reduced motion: no animation.
- Parity checklist: the Vue `PlanPage` solve tests and `SolveCard`.

Blocked by: 14

Status: ready-for-agent

- [ ] App tests: Compose shows the view with the right seconds; Cancel and Escape send the cancel with the solve id and show "Stopping…"; leaving and returning to the brief while solving shows the view again; a plan opens The Menu from the brief but not from another page; infeasible opens `/plans/new`; each failure reason shows its note and can be dismissed
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#plan` → Compose the week (the composing view), also with reduced motion; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
