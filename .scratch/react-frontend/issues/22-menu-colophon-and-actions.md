# 22: The Menu: colophon and actions

**What to build:** The Menu ends with a colophon saying how the week turned out: a pull figure for the week's first attribute total, the missed goals with what was missed and the worst day (or "All goals met"), and a totals table with each attribute's plan total and daily average (five rows, "Show all" for more). An unsaved plan has Save and Discard (Discard asks first that it can't be undone; both return to the brief, Save toasts "Saved to the archive."). A saved plan has Delete (asking first, naming the plan) and "Use for today" when it covers today and isn't already used, which stays on the page and marks the plan. Every failure shows on the page.

Spec: "Out of Scope" (no Use for today on an unsaved plan); stories 97–102.

- Confirm sheets (ticket 09); tabular figures in the table.
- Fills the colophon/actions place left in the Menu page by ticket 21, in its own component file.
- Parity checklist: the Vue `ResultsPage` tests about the summary, misses, Save, Discard, Delete and Use for today.

Blocked by: 09, 21

Status: ready-for-agent

- [ ] App tests: pull figure; missed goals with worst day; All goals met; totals table five rows and Show all; Save, Discard (confirm), Delete (confirm naming the plan), Use for today (shown only when it covers today and isn't used; stays on page) each send the right call and show failures
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#menu` colophon, totals table and action bar; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
