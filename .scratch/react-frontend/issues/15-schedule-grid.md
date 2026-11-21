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

Status: done

- [x] App tests: sentence wording; cell tap saves the whole setup; failed save reverts and tells; three quick taps are sent in order from the latest state; day sheet choices limited to planned meals; a too-high minimum is dropped when a meal is skipped; minimum shown under the day; full meal names available to screen readers
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#plan` section 1 and its day sheet; also check four meals and seven days at 320 px with no sideways scroll; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

### Where things are (`web/src/app/pages/brief/`)

- `ScheduleSection.tsx`: section 1. Takes `plan` (the store's setup) on its one line in `Brief.tsx`: `<ScheduleSection plan={plan} />`. The sentence, the grid (`role="group"` "Meals to plan", `data-no-swipe`, described by the instruction line), the legend and the instruction.
- `DaySheet.tsx`: a day's "at least" sheet (Sheet from 09, Stepper from 10).
- `scheduleGrid.ts`: the "set" changes sent through `planSetup.change` (`setCell(plan, day, meal, skipped)`, `setMinimum(plan, day, atLeast | null)`), `isSkipped`, `plannedOn`, `minimumOn`, and `longDay` ("Monday 21 September", via `Intl`).
- `schedule.css` (prefix `sched-`), D2's "1 schedule grid" rules ported as is.
- `ScheduleSection.test.tsx` (11 app tests), separate from `Brief.test.tsx` so the parallel section tickets do not collide there.
- **Ticket 16:** the marked line `const change = undefined` in `ScheduleSection.tsx` is the section's `action`; put the "Change" button there (D2: text button, `aria-label` "Change the schedule").

### Behaviour

- A cell tap sends `setCell(latest, day, meal, skipped)` with `skipped` read from what was tapped, so quick taps are all saved in order, each on the latest saved setup (tested with held replies). It shows at once; a failed save takes back only that tap (the store) and shows `common.saveFailed` as a red-pencil line under the grid (`role="alert"`, cleared on the next tap).
- Skipping a meal drops a day's minimum that is no longer below the planned meals (D2 and the Vue page: a minimum equal to the planned meals is "all"), inside the same change, so the server never sees it too high.
- Day sheet: the stepper runs 0 … planned, the top value shows "all" (no minimum). Preview sentences: "All 3 planned meals are served." / "At least 2 of 3 meals are served." / "At least 1 of 3 meals is served." / "The planner may leave all 3 meals empty." / "No meals are planned on Monday." Done with no change just closes; otherwise it saves not optimistically, closes on success, and on failure keeps the sheet open with `schedule.abovePlanned` (a `minimums.*` refusal) or `common.saveFailed`.
- A day with a minimum shows "at least 2" in red-pencil italic under the day; the day button's name says it ("Mon 21, at least 2 meals. Set how many meals must be served").
- Cells are named by the existing `schedule.cell` ("Breakfast on Mon 21", the full name), `aria-pressed` = planned; "out" and the plate are `aria-hidden`.
- Header: with four meals or more, a name longer than five letters shows as D2's "Bre." only while the grid is narrower than 560 px (container query), the whole name on wider pages; the full name is in a visually hidden span and `title`.

### Screenshots (390 × 844, 1280 × 800, paper and evening; D2 `#plan` side by side)

- The grid, sentence, legend and instruction match D2 in type, rules, plate marks, hatching and "out" in both editions. The day sheet matches D2's (title, preview, stepper row, italic hint, Done).
- Four meals ("Afternoon tea") and seven days at 320 px: no sideways scroll (measured 0 px), headers "Bre. Lunch Aft. Din."; at 1280 the full names show.
- Keyboard focus: the red-pencil ring is drawn inside the cell (`outline-offset: -2px`) so neighbouring rules do not cut it.
- Difference: no "Change" button yet (ticket 16), so the section head is a little shorter than D2's.

### Decisions

- Dates in the sentence and sheet title in full words like D2 ("Monday 21 September"), from `Intl` with the locale; the grid's day labels use the app's `dayLabel` ("Mon 21") split into weekday and an old-style muted date.
- Meal list "Breakfast, Lunch and Dinner" without a serial comma (D2), as a message `{list} and {last}`.
- The failed-save note for a cell is inline (like the time allowed section), not a toast: the shell's toast is for confirmations.

### For the README

- New keys under `schedule.grid.*` (in the `schedule` namespace, after `abovePlanned`); reused `schedule.cell`, `schedule.all`, `schedule.abovePlanned`, `brief.standfirst.days`, `common.done`, `common.saveFailed`.
- Places left by wave 5: section 1's "Change" goes on the marked `const change = undefined` line in `ScheduleSection.tsx` (16).
