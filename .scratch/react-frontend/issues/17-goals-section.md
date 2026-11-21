# 17: The goals section of the brief

**What to build:** Section 2 of the brief writes each goal as a sentence ("Between 1 500 and 2 000 kcal energy, as a daily average"), marked Must or Prefer with Prefer's importance as dots (or its importance below and above the range when they differ), showing a goal's name when it has one, and marking goals in the last clash in the warning colour with "In the clash" for screen readers. It explains Must and Prefer, says what happens with no goals, and disables "Add goal" with "Add an attribute first" when there are no attributes.

Spec: "Implementation Decisions › Specific interactions" (Clash: the brief's goals are marked from the same clash); stories 44–49, 59.

- Sentences from the pure goals module through the translator; the clash from the solve store (ticket 06).
- Each goal is a button and "Add goal" a button; both call an `onOpenGoal(goal | null)` the goal sheet (ticket 18) will use; until then they do nothing visible.
- Edits only section 2's own file (README Conventions).
- Parity checklist: the Vue `GoalsCard` tests and the goal-sentence cases of the goals module tests.

Blocked by: 14

Status: ready-for-agent

- [ ] App tests: sentences for min-only, max-only, range, each scope; Must vs Prefer with dots and split importance; goal name shown; clash marking (visible and "In the clash" text); empty state; Add goal disabled without attributes
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#plan` section 2; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
