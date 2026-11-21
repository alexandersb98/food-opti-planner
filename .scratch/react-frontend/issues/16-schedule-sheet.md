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

Status: done

- [x] App tests: date range follows the chosen start date; days stepper limits; add, rename, reorder, remove meals with one kept and a maximum; each name error on its field; Cancel discards; Done sends the setup; a server refusal shows on its field; `/plan/schedule` opens the sheet on the brief
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#plan` "Change" schedule sheet; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

### What was built

- `pages/brief/useScheduleDraft.ts`: `useReducer` over the pure rules in `src/scheduleDraft.ts` (`planDraft`, `validDate`, `validDays`, `scheduleFields`, `serverErrors`, unchanged). Actions: start, days, rename, add, move, remove (a meal's skipped cells go with it), errors. `check(plan, state, t)` gives the fields to send and a "set" change for the plan-setup store, or the errors (start, days, and meal names: empty, too long, given twice, the later one marked). `withSchedule` drops a minimum a removed meal leaves too high (`keepMinimums`, now exported from `scheduleGrid.ts`). `MEAL_NAME_LENGTH` is now exported from `src/scheduleDraft.ts` (only the `export` added).
- `pages/brief/ScheduleSheet.tsx` + `schedule-sheet.css` (prefix `sched-edit-`): a fresh draft per opening; preview line with the week as the cover reads it (`issueLine` from `Brief.tsx`, so the range follows the start and the days live), native `type="date"` field, days Stepper 1–31, meal rows (ruled serif input, up, down, remove), "Add a meal" (max 8, with the note), the meals hint, Cancel and Done. Done with no change closes without a PUT; otherwise saves with `optimistic: false`, toasts "Schedule changed." (as D2) and closes; on refusal the sheet stays with each error on its field (a refused minimum, which has no field here, shows as the save line). Focus: first invalid field after Done; new meal's input after Add; "Add a meal" after Remove (as D2); the pressed arrow after a move, or the other arrow at an end.
- `ScheduleSection.tsx`: the marked line is now the "Change" button (`aria-label` "Change the schedule"); `?sheet=schedule` opens the sheet and is removed with a replace that deletes only `sheet` (same pattern as `FiltersSection`); focus returns to "Change".
- Messages: new `schedule.edit.*` (change, changeLabel, preview, starts, addMeal, saving, changed); title reuses `brief.sections.schedule`.
- Tests: `pages/brief/ScheduleSheet.test.tsx` (13), ports the Vue SchedulePage date/days/meal-name tests and MealNamesDialog's.

### Screenshots and decisions (390 × 844 and 1280 × 800, paper and evening; vs D2 `#plan` "Change")

- Matches D2's field order, ruled serif inputs, Cancel/Done pair. Differences, on purpose: a `sheet-preview` line at the top with the week (D2's schedule sheet has none; the ticket asks for the date range); up/down arrows beside each name (the ticket's reorder; D2 has only ×); stepper is the compact primitive (D2's stretches across); max 31 days and 8 meals (server limits, D2 says 14 and 6); new meals start empty (D2 pre-fills "Meal 4") so the name check catches them.
- "Add a meal" uses the `text` button variant (no underline, unlike D2's `.text-btn`); left to the primitive.
- No unsaved-changes question on Cancel/Escape: the ticket says Cancel throws changes away.
- `ScheduleSheet` imports `issueLine` from `Brief.tsx`, which imports the section: an import cycle that is harmless (used only at render). Ticket 42 could move `issueLine` beside `isoWeek`.
