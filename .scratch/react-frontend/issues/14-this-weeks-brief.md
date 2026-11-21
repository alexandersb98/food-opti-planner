# 14: This week's brief: cover, standfirst, today, time allowed and Compose

**What to build:** The start page reads as "This week's brief": a kicker with the ISO week and date range, the title, a standfirst saying in words how many days, meals a day, meals to plan, goals (how many Must) and usable recipes there are, a small "In this brief" index, today's meals from the plan used for today, a line about an unsaved new plan, section 4 "Time allowed" with a stepper and a typed value, and "Compose the week" at the end. Sections 1–3 are frames with their numbered headings; tickets 15, 17 and 19 fill them.

Spec: "Implementation Decisions › Modules" ("Saving the setup"), "› Specific interactions" ("The brief saves in place", "Max solving time", "Today's meals", Copy); stories 22–28, 67–71.

- Loads the plan setup into the plan-setup store (ticket 06) with the load hook; loading and "Try again" on failure.
- "In this brief" links scroll to each section and move focus to its heading.
- Today's meals between the cover and section 1 when a plan is used for today; a meal opens that saved plan at today with the meal open (`?day=&meal=`), a skipped meal opens it at today.
- New-plan line with its dates and status and a link to The Menu when an unsaved plan exists.
- Time allowed: steps of 5 s up to 60 s and 30 s above, within 1–300 s, plus a numeric input for any whole number in range; saved through the plan-setup store at once, reverted with an error on failure; an invalid value explained.
- "Compose the week" with a note of how many meals it fills; disabled while loading or while a solve runs; it starts the solve through the solve store (the composing view is ticket 20).
- Each section 1–3 is its own component file, rendered with one line from the brief, so tickets 15, 17 and 19 edit only their own file (README Conventions).
- Parity checklist: the Vue `PlanPage` tests for these stories, and the `TodayCard`, `SummaryCard` and `MaxTimeDialog` behaviour.

Blocked by: 06, 08, 10

Status: ready-for-agent

- [ ] App tests: standfirst wording (singular and plural cases), "In this brief" moves focus, load failure and Try again, today's meals link targets, new-plan line, time stepper steps (55→60→90) and typed values (valid, out of range), revert on failed save, Compose disabled while loading and while solving, Compose sends the solve
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#plan` (cover, standfirst, In this brief, section 4 and Compose); differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
