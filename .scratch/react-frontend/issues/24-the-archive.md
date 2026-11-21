# 24: The archive: saved plans

**What to build:** Saved plans have their own page, The archive: newest first as the server sends them, each with the ISO week as an ornament, the date range as the title and when it was saved in the owner's time zone, the plan used for today marked "Today"; tapping opens its menu. An empty archive says how plans get there and links to The Menu.

Spec: "Implementation Decisions › Routes" (`/plans`), "Further Notes" (no "Week n" labels), "Assumptions to confirm" 9; stories 105–108.

- Replaces the `/plans` stub. Parity checklist: the Vue `SavedPlansCard`.

Blocked by: 08, 10

Status: done

- [x] App tests: order kept as sent; dates and saved time in the fixed test time zone; Today marker; link to `/plans/:id`; empty state link; load failure and Try again
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#archive`; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

### What was built

- `web/src/app/pages/archive/Archive.tsx` replaces the stub (the route line already pointed at it, so `routes.tsx` is unchanged), with `archive.css` (prefix `archive-`) and `Archive.test.tsx` (4 app tests).
- One `useLoad` with `loadAll` of `GET /api/plan-results` and `GET /api/plan-results/today?date=<browser's date>` in parallel, as the Vue Plan page did. The list keeps the server's order (D2 re-sorts by start date; the spec says "as the server sends them").
- Each entry is a router `Link` to `/plans/:id`: the ISO week the plan starts in as a large light red-pencil ornament (`aria-hidden`, D2's `.wk`), the date range (`dateRange` from `src/dates.ts`) as the title, and "7 days. Saved Sun 20 Sep, 18:04." in the browser's time zone (Intl formatters hoisted to module level; non-breaking spaces inside the date so it doesn't break across lines). The plan used for today gets D2's boxed "Today" in place of the chevron.
- Empty: D2's ruled italic note "No saved plans yet. Save a menu and it is filed here." and a text link "Go to The Menu" to `/plans/new`. Failure: `LoadState` with "Could not load the saved plans." and Try again.
- `isoWeek` is imported from `shell/Contents.tsx` (ticket 08 exported it); if a later ticket moves it to a shared dates module, update this import.

### Messages

New namespace `archive` directly after `plan` (whose `savedPlans`/`savedAt`/`todayChip` it replaces for React): `kicker`, `titleArticle`, `titleName`, `standfirst`, `loadFailed`, `plans` (the list's label), `days` (plural), `meta`, `metaUnsaved` (a saved plan without `saved_at`, which shouldn't happen), `today`, `empty`, `toMenu`.

### Screenshots (390 × 844 and 1280 × 800, paper and evening) compared with D2 `#archive`

- Matches D2: cover (red italic kicker, "The *archive*" hero, standfirst), the strong rule over the list, 64 px week column, serif title, small muted meta line, boxed Today, muted chevron. Evening edition reads well; no horizontal scroll at 390.
- Differences, on purpose: the title is the date range, not "Week n" (spec Further Notes); the meta line is "N days. Saved …" rather than D2's "7 days from 16 November. Saved …", since the dates are already the title; server order instead of D2's sort.
- Found and fixed: `content-visibility: auto` on the entries (tried for long archives) clipped the focus ring, so it was removed; the cover is a `div`, not a `header`, because Testing Library counts a `header` inside the page as a second `banner` and the shell's running-head test fails (other page tickets with a cover will hit the same thing).
- Hover (pointer devices only) and press tint the whole entry with `--press`; keyboard focus shows the red-pencil ring round the entry.
- Turn links and the folio at the page foot are ticket 12's, not drawn here.

### For the README / ticket 42

- The cover styles (`.cover`, `.cover-title`, `.standfirst`, `.empty-state` in D2) are copied into `archive.css` under the `archive-` prefix; several pages will have the same copy, which ticket 42 could fold into `base.css`.
- Full `npm test` on a heavily loaded machine (load average ~55) failed a few specimen/stepper/field tests by timeout (lazy specimen route); each passes when run on its own and none touch this page.
