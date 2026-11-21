# 22: The Menu: colophon and actions

**What to build:** The Menu ends with a colophon saying how the week turned out: a pull figure for the week's first attribute total, the missed goals with what was missed and the worst day (or "All goals met"), and a totals table with each attribute's plan total and daily average (five rows, "Show all" for more). An unsaved plan has Save and Discard (Discard asks first that it can't be undone; both return to the brief, Save toasts "Saved to the archive."). A saved plan has Delete (asking first, naming the plan) and "Use for today" when it covers today and isn't already used, which stays on the page and marks the plan. Every failure shows on the page.

Spec: "Out of Scope" (no Use for today on an unsaved plan); stories 97–102.

- Confirm sheets (ticket 09); tabular figures in the table.
- Fills the colophon/actions place left in the Menu page by ticket 21, in its own component file.
- Parity checklist: the Vue `ResultsPage` tests about the summary, misses, Save, Discard, Delete and Use for today.

Blocked by: 09, 21

Status: done

- [x] App tests: pull figure; missed goals with worst day; All goals met; totals table five rows and Show all; Save, Discard (confirm), Delete (confirm naming the plan), Use for today (shown only when it covers today and isn't used; stays on page) each send the right call and show failures
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#menu` colophon, totals table and action bar; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- **Files.** `web/src/app/pages/menu/MenuColophon.tsx` (component), `colophon.css` (prefix `colophon-`), `MenuColophon.test.tsx` (own app tests, so ticket 23 can add to `Menu.test.tsx` without conflicts). `Menu.tsx`: the place line now reads `<MenuColophon key={`colophon-${plan.id}`} plan={plan} />`, plus one import line after `MenuCard`'s. `Menu.test.tsx`: the "every day is a section" test now counts level-2 headings inside the card only (the colophon adds an h2). New messages in the `menu` namespace after `compose`; existing `results.*`/`common.*` keys reused (Discard, Use for today, Show all, All goals met, Missed goals, deleteTitle, save/delete failures).
- **No `onPlan`.** The plan itself never changes in place (Save and Discard leave the page, Use for today only changes which plan today's meals come from), so `page.setData({ plan })` was not needed. "Used for today" is the colophon's own state: it loads `/api/plan-results/today?date=` only for a saved plan covering today, and sets it after a successful Use for today.
- **Copy.** Status sentence plus "{n} goal(s) was/were missed; everything else held." or "Every goal was met." (only when the plan has goals) as the dropcap standfirst. Pull figure: first attribute's total and "for the week’s {name}, about {average} a day." (D2 picks cost; the ticket says the first attribute). Missed goals reuse Vue's `missRows` (title, then "worst Wed 23: …" as the sub-line). D2's per-goal ✓ verdicts are not possible (the API reports misses only), so met goals show as one "All goals met" row.
- **Actions.** Unsaved: "Save to the archive" (primary, D2 wording) → toast "Saved to the archive." and replace to the brief; Discard (ghost) → Confirm "Discard this plan?" naming the issue, "Keep it"/"Discard" → toast "Plan discarded." and replace to the brief. Saved: a green "Filed in the archive as Week N." note (plus "Today’s meals come from this menu." when used for today), "Use for today" when it covers today and is not the plan used, and Delete → Confirm "Delete Mon 21 – Sun 27 Sep?" (named as the archive names plans) → toast "Plan deleted.". Failures show in a `role="alert"` line above the buttons; buttons are disabled while a call runs.
- **Deviation:** Delete returns to **The archive** (`/plans`, replace), not to the brief as Vue did: saved plans now live in the archive and story 100 opens them from there. Easy to change in `remove()` if the brief is wanted.
- **D2's disabled "Used for today" button** is replaced by the line in the filed note (a disabled button is a poor way to state a fact).
- **Screenshots** (390 × 844, 1280 × 800, paper and evening; saved plan used for today, unsaved plan; D2 `#menu` scrolled to the colophon): matches D2's colophon rule, italic heading, dropcap standfirst, 72 px accent pull figure, verdict rows, small-caps table head with tabular figures, and the action bar. Fixed: with a two-line standfirst the drop cap hung into the pull figure's rule; `.colophon-standfirst` is now `display: flow-root`. Sample data has no missed goals, so the † rows are covered by the tests only. Not mine but noticed: the running head on `/plans/:id` reads "4 The archive" (registry maps saved plans to the archive page).
- **For ticket 42:** `.colophon-*` styles are D2's `.colophon`, `.pull`, `.verdicts`, `.totals-table`, `.saved-note` and `.btn-row` copied under the prefix; no new tokens.
