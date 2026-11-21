# 24: The archive: saved plans

**What to build:** Saved plans have their own page, The archive: newest first as the server sends them, each with the ISO week as an ornament, the date range as the title and when it was saved in the owner's time zone, the plan used for today marked "Today"; tapping opens its menu. An empty archive says how plans get there and links to The Menu.

Spec: "Implementation Decisions › Routes" (`/plans`), "Further Notes" (no "Week n" labels), "Assumptions to confirm" 9; stories 105–108.

- Replaces the `/plans` stub. Parity checklist: the Vue `SavedPlansCard`.

Blocked by: 08, 10

Status: ready-for-agent

- [ ] App tests: order kept as sent; dates and saved time in the fixed test time zone; Today marker; link to `/plans/:id`; empty state link; load failure and Try again
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#archive`; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
