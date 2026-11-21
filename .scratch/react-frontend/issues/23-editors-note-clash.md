# 23: Editor's note: no plan possible

**What to build:** When the last solve found no plan possible and the owner hasn't dismissed it, `/plans/new` shows an Editor's note "No plan possible" in place of The Menu. It lists the rules that clash: each clashing Must goal with where it clashes (which days, or over the whole plan), with its Min/Max (and zero reference when shown) editable in place and "Make Prefer"/"Keep Must" ("Will be Prefer" when switched), and each day whose meal minimum takes part, with "Change the schedule". It says whether fixing may show another clash or that the solve stopped early. "Try again" saves changes (if any) and makes a plan again; "Dismiss" closes the note. A clash with no listed rules says only that no plan is possible with these settings.

Spec: "Implementation Decisions › Specific interactions" (Clash), "Assumptions to confirm" 7; stories 77–85.

- Clash rows from the pure clash module; the clash and minimality from the solve store (ticket 06); saving through the plan-setup store.
- "Change the schedule" goes to `/?sheet=schedule` (README Conventions).
- "Try again" goes back to the brief, where the composing view shows (follow today's Vue clash card for the exact order of save and solve).
- Field errors and a failed save shown inside the note.
- Fills the Editor's note branch left in the Menu page by ticket 21, in its own component file.
- Parity checklist: the Vue `ClashCard` behaviour and the `PlanPage` clash tests, the clash module tests.

Blocked by: 21

Status: done

- [x] App tests: goal rows with days or whole plan; day rows; loosening a bound and Make Prefer then Try again sends the changed setup and the solve; Keep Must; errors and failed save inside the note; Dismiss; empty clash text; minimal vs stopped-early wording; Change the schedule navigates with `sheet=schedule`
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no clash note: compare with D2's `#menu` card and editorial notes, in the warning colour; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

**Where things are** (`web/src/app/pages/menu/`): `EditorsNote.tsx` (the note, its goal rows and bound fields), `editors-note.css` (prefix `enote-`, ported from D2's `.editors-note`, `.note-card`, `.clash-list`, `.clash-item`, `.signature`), `EditorsNote.test.tsx` (11 app tests). `Menu.tsx`: `if (clash) return <EditorsNote />` plus its import; nothing else touched.

**Behaviour.**
- Rows from `clashRows` (pure clash module) over the plan-setup store's setup; the clash and `clashMinimal` from the solve store. The note loads the setup (`planSetup.load()`) and `/api/attributes` (for units and server-error text) in parallel.
- Drafts restart when the clash or a goal it shows changes as stored (`rowsKey`), via a React `key` on the inner component; another save of the setup keeps what was typed (as Vue's watcher).
- Try again: field checks (`clashErrors`); if anything changed, saves through `planSetup.change(…, { optimistic: false })` with the goals `clashFields` builds; a refusal is marked on the fields (`clashServerErrors`), other failures say "Could not save. Try again." inside the note (`role="alert"`). Then `navigate('/')` and `useCompose()` from the brief (save first, then solve, as the Vue card). Where an outcome then leads is ticket 20's (`useCompose`).
- Make Prefer / Keep Must toggle `must`; "Will be Prefer" replaces the "Must" note beside the goal name (green, italic). A zero bound made Prefer shows the zero-reference field.
- Day rows: "Clashes on Thu 26", "Meals on Thu 26", "At least N meals…/All planned meals…", and a text link "Change the schedule" to `/?sheet=schedule`.
- No rows left: only "No plan possible with these settings." (no list, no minimality line). Minimal vs stopped-early text is the lede's last sentence, as in D2.
- Dismiss: `solve.dismiss()`, then focus moves to `#page` (the shell's main), since the note's buttons disappear.

**Messages.** New `clash.note.*` (kicker, lede, rules (list label), changeSchedule, signature, saving). Reused `clash.*`, `goals.must`, `goals.editor.min/max/zeroReference`, `plan.dismiss`, `plan.failure.infeasible`, `common.saveFailed`, `menu.issue`.

**Screenshots and decisions** (`/next/plans/new` after a real infeasible solve, against `d2:menu` with "No plan possible"):
- D2 does have this view (behind its prototype demo switch), so the comparison is direct: accent-bordered note card, italic kicker, light italic h1, drop-cap lede, lower-roman numbered clash items between hairlines, signature "The planner", ink block "Try again". Matches in both editions and widths; no sideways scroll at 390.
- Fixed in the pass: with a two-line lede (desktop) the three-line drop cap hung below the card's rule into the list; the lede now has a three-line minimum height.
- Deviations from D2: goal rows show the goal's name (not D2's bold goal sentence) plus a "Must"/"Will be Prefer" note, and the bounds as editable ruled fields with the unit after them (story 79); D2's line-through on a preferred bound is dropped (the field is editable). D2's "Each one is a Must" is left out of the lede because day rows are not goals. "Dismiss" is a text button under Try again (D2 has none). The issue kicker is the setup's week (`menu.issue`).
- Bound fields sit in an auto-fill grid (min 132 px), so an error message wraps under a narrow field; acceptable, could widen later.

**For the README.** Ticket 23 done: `EditorsNote.tsx` fills the Menu's clash branch. "Try again" calls `useCompose()` after `navigate('/')`, so ticket 20's outcome handling in `useCompose` applies to it too. Ticket 17 marks clashing goals on the brief with `clashingGoalIds(clashRows(solve clash, setup))`.
