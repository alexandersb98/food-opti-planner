# 20: Composing the week: the solving view and its outcomes

**What to build:** While a plan is being made, a full-screen "Composing the week" view shows the kicker, the seconds counted against the time allowed, a progress ruler, the galley of days with a rotating status line, and Cancel (also Escape), which shows "Stopping…" until the server stops. A solve still running when the owner comes back to the brief shows the view again. A finished plan opens The Menu if the owner is still on the brief (otherwise the brief's new-plan line shows it); an infeasible solve opens `/plans/new` (the Editor's note) likewise; any other failure shows on the brief as a dismissible note with the reason and what to try.

Spec: "Implementation Decisions › Specific interactions" (Solving view, Clash); "Further Notes" (no invented "musings", no prototype status switch); stories 72–76, 194 (composing view).

- Reads and drives the solve store (ticket 06); the navigation on outcome happens here, only when the current route is the brief.
- The clock is the browser's against the time allowed, full past it. The ruler is a `progressbar` with an accessible value. The galley shows days only, never invented recipes.
- Failure note texts for: no plan in time, no recipes, no usable recipes, too large, stopped, busy in another tab, error.
- Reduced motion: no animation.
- Parity checklist: the Vue `PlanPage` solve tests and `SolveCard`.

Blocked by: 14

Status: done

- [x] App tests: Compose shows the view with the right seconds; Cancel and Escape send the cancel with the solve id and show "Stopping…"; leaving and returning to the brief while solving shows the view again; a plan opens The Menu from the brief but not from another page; infeasible opens `/plans/new`; each failure reason shows its note and can be dismissed
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#plan` → Compose the week (the composing view), also with reduced motion; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

**What was built.** `pages/brief/Composing.tsx` fills ticket 14's place: `useCompose()` starts the solve and decides where the outcome leads; `<Composing />` renders the composing view while a solve runs (also on coming back to the brief) or the failure note. Styles in `pages/brief/composing.css` (prefix `composing-`). Tests in `pages/brief/Composing.test.tsx` (16), a new file so that tickets 15, 17 and 19 editing `Brief.test.tsx` don't conflict.

**Brief.tsx edit:** one word, `export` on `issueLine` (the view's kicker is the same issue line as the cover). No other line changed.

**Navigation only from the brief.** The mounted `<Composing />` registers its `navigate` in a module variable and clears it on unmount; `useCompose` uses it after `solve.start` answers. So a plan opens `/plans/new` with `composedState` (The Menu's reveal) and a clash opens `/plans/new` without it (the Editor's note) only when a brief is on screen; otherwise the owner stays put, and the brief later shows the new-plan line (ticket 14) or the failure note (the solve store keeps the failure). An infeasible solve never shows a note on the brief: the Editor's note and ticket 17's marked goals cover it.

**The view.** A native modal `dialog` (not the Sheet: no close button, no tap outside). Focus goes to Cancel; Tab stays there; Escape and the dialog's cancel event (back gesture) send Cancel; a browser that closes it anyway gets it reopened while the solve runs. Cancel becomes "Stopping…" with `aria-disabled` (not `disabled`, so focus stays on it) and the status line says "Putting the pencils down." The clock: a 250 ms interval of `Date.now()` against `startedAt`; the big number counts on past the time allowed while the ruler stays full. The ruler is a `progressbar` (`aria-valuemin 0`, `aria-valuemax` = seconds allowed, `aria-valuenow` capped, `aria-valuetext` "12 of 30 seconds"); its fill is a `scaleX` transform. The big count is `aria-hidden` (the progressbar says it).

**Galley.** Days only: weekday and date in small caps, and that day's meal names (skipped ones left out, "Nothing to set" when all are) in waiting italics, instead of D2's invented recipes. A slow opacity wave runs down the lines (pure CSS, staggered with `--row`), stopped while stopping and under reduced motion. The status line rotates every 4 s through five plain lines about what the solver weighs (no "musings" about specific dishes) and is not a live region (it would chatter); the progressbar carries progress.

**Failure note.** Above Compose, after D2's new-plan line look (red rule, italic red lead-in, Dismiss text button), `role="alert"`. New keys `brief.composing.*` and `brief.failure.*`; the Vue `plan.failure.*` texts are not reused because they name Vue's "Max solving time" and "Recipes" card.

**Screenshots** (390 x 844 and 1280 x 800, paper and evening, also reduced motion, the Stopping state, the failure note and a real solve through to The Menu) compared with D2 `#plan` → Compose the week: same layout, type and ruler; differences are the galley content (meals, not invented dishes, with a 52 px day column for "SAT 21") and no D2 "finish" sequence (the view closes when the solve answers; The Menu's reveal takes over). Reduced motion: no fade-in, no wave, no ruler transition.

**Flaky under load.** With very high machine load (several agents), the first test of `Brief.test.tsx` and a few Vue tests time out on cold lazy-route loads (lesson (f)); the clock test here has a 15 s timeout and fakes timers only after the brief has loaded.

**For the README** (lead to fold in): "Composing (20): `useCompose()` (in `pages/brief/Composing.tsx`) navigates on a solve's outcome only while a brief is mounted. Used anywhere else (ticket 23's Try again on `/plans/new`), it starts the solve but leaves the outcome to the caller (e.g. reload The Menu, or go to the brief to show the composing view)."
