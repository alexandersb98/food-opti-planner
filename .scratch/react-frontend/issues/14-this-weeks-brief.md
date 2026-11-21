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

Status: done

- [x] App tests: standfirst wording (singular and plural cases), "In this brief" moves focus, load failure and Try again, today's meals link targets, new-plan line, time stepper steps (55→60→90) and typed values (valid, out of range), revert on failed save, Compose disabled while loading and while solving, Compose sends the solve
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#plan` (cover, standfirst, In this brief, section 4 and Compose); differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

### Where things are (`web/src/app/pages/brief/`)

- `Brief.tsx`: the page. One `useLoad` runs every call at once (`loadAll`): the setup through the plan-setup store (`planSetup.load()`, so the store owns it), attributes, tags, plan results and today's plan (`?date=` the browser's date). The setup shown is read from the store (`useSyncExternalStore`), so every section saves in place and the page follows. The usable-recipe count is asked by the brief (`useRecipeCount`, again when the filters change) for the standfirst.
- `BriefSection.tsx`: the numbered frame (`<BriefSection section="goals" action={…}>`), the `briefSections` list (ids, titles; "In this brief" uses it) and `.brief-section-intro` (D2's `.section-intro`) for the sections' explanatory lines.
- **Places left:** `ScheduleSection.tsx` (15), `GoalsSection.tsx` (17), `FiltersSection.tsx` (19) each render their frame and a "still being set" line, and are rendered by one line each in `Brief.tsx` with no props. A section ticket adds the props it needs on its own line; the brief already has `plan` (the store's setup), `page.data.attributes`, `page.data.tags` and `recipes.count` (`{usable, total}`, for section 3: no second count call needed).
- **Ticket 20:** `Composing.tsx` holds `useCompose()` (waits for `planSetup.settled()`, then `solve.start(time allowed)`; the outcome handling goes here) and `<Composing />` (renders nothing yet; it sits just above Compose, so the failure note lands next to the button that was pressed).
- `TimeSection.tsx` (section 4), `Standfirst.tsx` (`mealsToPlan`), `TodayMeals.tsx`, `NewPlanLine.tsx`, `Compose.tsx`, `words.tsx` (`numberWord`, `capitalised`, `richText` for a message with an element in a placeholder), `brief.css` (prefix `brief-`), `Brief.test.tsx` (17 tests).

### Decisions and differences from D2

- **Standfirst** follows D2 ("Five days, three meals a day: **14 to plan**. Four goals, two of them Must. Six recipes in play."), numbers one to twelve in words, figures above; "Must" instead of D2's "firm" (the app's word). Zero and one cases have their own wording ("nothing to plan", "No goals yet.", "One goal, a Must.", "No recipe can be used."). The recipe sentence appears once the server's count is in.
- **Kicker**: the ISO week of the plan's start date and its dates ("Week 39, 21–27 September"; "28 Sep – 11 Oct" across months), month names from `Intl`.
- **Time allowed**: the figure in D2's sentence is the typed field (dashed red-pencil underline, D2's annotation look), saved on Enter or leaving it; Escape reverts the typing. The stepper uses D2's steps from any value (47 → 50/45, 75 → 90/60), clamped to 1–300 (D2 stops at 5). An invalid value or a refusal shows the existing `plan.maxTimeRange` text with D2's dagger; a failed save takes the time back and says `common.saveFailed`.
- **Today's meals** (not in D2) are set like a day of The Menu: italic "Today" with the long date, each meal's name small above its dish in serif, the portion as "× 1½" in red-pencil italic when not 1 (rounded to a tenth, halves and quarters as fractions; the solver gives e.g. 0.657), a skipped meal "Skipped" in muted italic. Every row is a link.
- **New-plan line** (not in D2): a red-pencil margin rule with "New plan, not saved: Mon 21 – Sun 27 Sep, time ran out, so it may not be the best." and "Open The Menu". Placed before today's meals.
- **Loading**: the title shows at once; the kicker line keeps its height; Compose shows disabled. Failure shows `LoadState` ("Could not load the brief." and Try again).
- Compose's "Make plan" subtitle is `aria-hidden` (the button is named "Compose the week"); the note is its description.
- Turn links and the folio at the foot are ticket 12's.
- The cover is a `div`, not a `header`: a `header` reads as a second banner landmark beside the masthead (the shell tests caught it).

### Screenshots

`/next/` and `d2:plan` at 390 × 844 and 1280 × 800, paper and evening, full page; also with an unsaved plan and an out-of-range typed time. Cover, standfirst with drop cap, "In this brief", section heads, time row and Compose match D2's type, rules and spacing in both editions. Fixed after the first look: the kicker was muted (`.kicker` won over the accent: raised specificity) and portions showed the solver's three decimals.

### For the README

- New namespace `brief` in `en.json`, directly after `plan`. Reused: `plan.seconds`, `plan.maxTimeRange`, `common.saveFailed`, `common.retry`.
- `isoWeek` is imported from `shell/Contents.tsx`; ticket 42 may move it to `dates.ts`.
