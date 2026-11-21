# 18: The goal sheet

**What to build:** Tapping a goal (or "Add goal") opens the goal editor as a bottom sheet with a live preview sentence: what to track from the attributes as chips, Min and Max with the attribute's unit, Each day / Daily average / Plan total, Must or Prefer with importance 1–5, the "count a miss as a percentage of" field when a bound is zero, and an Advanced part (name, different importance below and above, "also keep each day in range" with its importance) opened by itself when used. Errors show on their fields; delete is possible; a saved goal updates the brief at once with a "Goal changed." toast.

Spec: "Implementation Decisions › Modules" (Draft rules: React hook over the pure goal rules), "› Specific interactions" (sheets save on Done and stay open with errors); stories 50–58.

- A React goal-draft hook over the pure goal rules from ticket 02.
- Saves the whole setup through the plan-setup store (ticket 06); refusals mapped to fields; the Advanced part opens when an error is inside it.
- Wires into section 2's `onOpenGoal` (ticket 17); the sheet in its own file.
- Parity checklist: the Vue `GoalDialog` tests and the goal draft rule tests.

Blocked by: 09, 17

Status: done

- [x] App tests ported from the Vue `GoalDialog` tests (every error case of story 56 on its field, Advanced opening itself, zero-reference field, Prefer importance, delete, save updates the brief and toasts)
- [x] The live preview is in an `aria-live` region
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#plan` goal sheet; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- **Files.** `web/src/app/pages/brief/GoalSheet.tsx` (the sheet, portalled to `document.body`, its form keyed per opening), `useGoalDraft.ts` (React hook over `src/goalDraft.ts`: `useState` draft, generated name that follows until typed, split, guard-rail importance; saves and removes through `planSetup.change(…, { optimistic: false })`, the goal's index taken from the latest saved setup when the change runs), `goal-sheet.css` (prefix `goal-sheet-`), `GoalSheet.test.tsx` (28 app tests ported from `GoalDialog.test.ts`, plus preview, focus and reopen cases). `GoalsSection.tsx`: names `toOpen`, renders `<GoalSheet>`, "Add goal" is now a plain `<button>` with `buttonClass` (it needs a ref; `Button` does not forward one) and both openers carry `aria-haspopup="dialog"`. One test in `GoalsSection.test.tsx` changed from "opens nothing" to "opens the goal sheet". `Brief.tsx` untouched.
- **Copy.** D2's: "Remove goal" (ghost), "Done" for an existing goal and "Add goal" for a new one, toasts "Goal added." / "Goal changed." / "Goal removed.", "none" placeholders, unit after the label ("Min (kcal)"). Labels stay Min/Max (story 52) rather than D2's Least/Most. New keys under `goals.editor`: `unitIn`, `none`, `preview.{text,must,prefer,preferSplit}`, `remove`, `added`, `changed`, `removed`.
- **Preview.** `goalSentence` + ": must." / ": preferred, importance 4." / ": preferred, importance 2 below and 5 above."; amount bold, attribute in small caps as on the brief. Without bounds it reads "No limit yet on energy, each day: …" instead of D2's italic "Give a least amount…" (the missing bound is an error on Min at Done).
- **Importance.** D2's numbered squares (`.imp-pick`) for the main importance, below/above and the day's importance; each square `aria-pressed`, read "Importance n of 5" inside a fieldset. Hidden for Must (Vue and story 53), where D2 dims it. Split on: "Set below and above, under Advanced" in its place.
- **Advanced.** `Disclosure` (ticket 10), open at the start for a goal using it (`opensAdvanced`), and opened again by every refused save with an error inside it (errors are cleared while saving, so `startOpen` turns false then true). Toggles are native checkboxes with `role="switch"`.
- **Errors.** On their fields (`aria-invalid` + described-by), attribute and importance errors on their fieldsets, the general one as an alert above the actions; after a refused Done focus moves to the first marked field (web-design-guidelines). Removing a goal is immediate as in D2 and Vue (no confirm); focus then goes to "Add goal".
- **Screenshots** (edit Must, edit Prefer, new goal with zero bound + Advanced errors, its lower half, reduced motion; phone and desktop, paper and evening) against `d2:plan` "Add a goal": preview block, chips, two-column bounds, segmented rows, red importance squares and actions match D2. Differences: Advanced part and reference field (not in D2), drawn in the sheet's idiom with hairlines.
