# 15: The schedule: grid of place settings and "at least" per day

**What to build:** Section 1 of the brief states the start day and date, the number of days and the meal names in a sentence, and shows the week as a grid of days by meals, each planned meal a drawn place setting and each skipped one marked "out". Tapping a cell switches it and saves; tapping a day opens a sheet to set "at least" how many of its planned meals must be served.

Spec: "Implementation Decisions › Specific interactions" ("The brief saves in place", "'At least' rules"); stories 29–37, 43.

- Cell taps update at once and save through the plan-setup store (ticket 06); a failed save puts the cell back and says so; quick taps are all saved in order.
- Day sheet (Sheet, ticket 09): "at least" from 0 up to the meals planned that day, "all" meaning no minimum, with a preview sentence; Done saves, errors stay in the sheet.
- Skipping a meal that makes a minimum too high drops the minimum (no error). A day with a minimum shows it under the day.
- Legend for planned and skipped; a short instruction; long meal names shortened in the header with the full name for assistive technology.
- The grid carries `data-no-swipe`. Edits only section 1's own file (README Conventions); a "Change" button is left for ticket 16.
- Parity checklist: the Vue `SchedulePage` tests about cells and day minimums, and `ScheduleCard`.

Blocked by: 09, 14

Status: ready-for-agent

- [ ] App tests: sentence wording; cell tap saves the whole setup; failed save reverts and tells; three quick taps are sent in order from the latest state; day sheet choices limited to planned meals; a too-high minimum is dropped when a meal is skipped; minimum shown under the day; full meal names available to screen readers
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#plan` section 1 and its day sheet; also check four meals and seven days at 320 px with no sideways scroll; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
