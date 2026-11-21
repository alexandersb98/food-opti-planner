# 12: Turning pages: swipes, turn links, folio and the skip link

**What to build:** Moving around feels like a book: swiping left or right on a page turns to the next or previous page in Contents order, each page ends with "Previous page" and "Next page" links and a folio, a page turn slides in the direction moved and starts at the top, and keyboard users get a "Skip to the page" link past the masthead.

Spec: "Implementation Decisions › Modules" (App shell: turn links, folio, swipe-to-turn, page-enter transition, skip link), "› Specific interactions" (Desktop: swipes are touch only), "› Performance and React practice" (passive touch listeners, one global keydown listener); stories 15–19, 21, 194 (page turns).

- Order from the page registry (ticket 08); a detail route turns relative to its registry page.
- Swipes are touch only, with passive listeners, a horizontal threshold and a vertical-scroll guard; ignored when they start inside an input, textarea, select, dialog, `[contenteditable]` or any element with `data-no-swipe` (README Conventions).
- Turn links and folio at the foot of each page in the shell (pages don't render them).
- The page-enter slide in the direction moved; scroll to top on a page change; none with reduced motion. Browser Back behaves as a website.
- Skip link moves focus to the page's main region.

Blocked by: 08

Status: done

- [x] App tests: a left swipe on the brief goes to The Menu, a right swipe on The Menu returns; a swipe starting in an input or a `data-no-swipe` element does nothing; the first and last pages have only one turn link; turn links name the target page
- [x] App test: the skip link moves focus to the main region
- [x] Reduced motion checked in the screenshot run (no slide)
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2's page foot and page turn (swipe between `#plan` and `#menu`); differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

**Where things are.** `web/src/app/shell/turning.ts` (`usePageTurns(main, page)`: swipe-to-turn, scroll position on a page change, the page-enter slide; `neighbours(page)`), `shell/PageTurn.tsx` (`SkipLink`, `PageFoot`), `shell/turn.css` (class prefix `turn-`), app tests in `shell/PageTurn.test.tsx`. `Shell.tsx` gained four lines: the hook call, `<SkipLink>` before the masthead and `<PageFoot>` after the `Outlet` in `main#page`. New copy in `shell.turn` (`skip`, `label`, `previous`, `next`, `folio`).

**Decisions.**
- Swipes as D2: one finger, at least 70 px sideways, at most 50 px up or down, within 600 ms; passive `touchstart`/`touchend`/`touchcancel` on `main#page`, so touch only (a mouse never turns). Ignored when the stroke starts in `input, textarea, select, dialog, [role=dialog], [role=alertdialog], [contenteditable], [data-no-swipe]`. No turn past the first or last page.
- A detail route turns from its registry page and shows that page's foot and folio (e.g. a recipe: Previous "The Menu", Next "The archive", folio 3). D2 has no foot on the recipe spread; the ticket asks for one on each page, and the swipe already turns from there, so the links match it. A path the app doesn't have shows no foot and takes no swipe.
- `main#page` gets a min-height of the window below the masthead (in `turn.css`) so a short page takes a swipe anywhere below the masthead, not only on its text.
- The slide: `data-enter="next|previous"` on `main#page`, D2's 18 px / .34 s / `--ease-out`, with `animation-fill-mode: backwards` and the attribute removed on `animationend`, so the page keeps no transform afterwards (fixed descendants stay fixed). Direction by folio, a detail route counting as just after its page (index → recipe slides in from the right, back to the index from the left). Not on the first page shown, nor on a change of query only (`?sheet=…`). With reduced motion it is never started (checked with `--reduced-motion`: no `data-enter`, opacity 1), and base.css's global rule would stop it anyway.
- Scroll: a new page starts at the top; Back and Forward return to where that history entry was left (kept per `location.key`, `history.scrollRestoration = 'manual'`), as a website does. Checked in Chromium: turned from 2585 px to 0, Back restored 2585. A page that loads its data after mounting may still be too short at that moment and land higher; a later ticket can refine if it shows.
- Skip link: "Skip to the page", the first tab stop, `position: fixed` above the window until focused (D2's absolute -60 px showed a sliver on the desktop desk); activating it focuses `main#page` (tabIndex -1).
- Turn link names are their text ("Previous page The Menu"); the folio's number is `aria-hidden` with a visually hidden "Page 3" beside it (D2's `aria-label` on a `<p>` isn't allowed).

**Screenshots** (390 × 844 and 1280 × 800, paper and evening; foot of `/next/recipes` against `d2:recipes`; real CDP touch swipes `/next/` ↔ `/next/plans/new`, also with reduced motion; the skip link focused): the foot matches D2 in rule, type and spacing in both editions; swipes turn both ways and slide in the direction moved (opacity ~0.64 at 80 ms), none with reduced motion.

**For the README / later tickets.**
- Pages don't render turn links or a folio; the shell adds them in `main#page`.
- Grids, the editing spread and primitives that take sideways strokes add `data-no-swipe` (Conventions already say so); inputs, dialogs and `[contenteditable]` are ignored without it.
- Ticket 42: `turn.css` sets a `min-height` on `.shell-page` (ticket 08's class) for swipes on short pages; fold into `shell.css` if wanted.
- Seen once in a full shell run, not reproduced in five more: ticket 08's toast test ("a toast is announced…") read an empty region; looks like a pre-existing timing flake.
