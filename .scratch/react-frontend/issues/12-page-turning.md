# 12: Turning pages: swipes, turn links, folio and the skip link

**What to build:** Moving around feels like a book: swiping left or right on a page turns to the next or previous page in Contents order, each page ends with "Previous page" and "Next page" links and a folio, a page turn slides in the direction moved and starts at the top, and keyboard users get a "Skip to the page" link past the masthead.

Spec: "Implementation Decisions › Modules" (App shell: turn links, folio, swipe-to-turn, page-enter transition, skip link), "› Specific interactions" (Desktop: swipes are touch only), "› Performance and React practice" (passive touch listeners, one global keydown listener); stories 15–19, 21, 194 (page turns).

- Order from the page registry (ticket 08); a detail route turns relative to its registry page.
- Swipes are touch only, with passive listeners, a horizontal threshold and a vertical-scroll guard; ignored when they start inside an input, textarea, select, dialog, `[contenteditable]` or any element with `data-no-swipe` (README Conventions).
- Turn links and folio at the foot of each page in the shell (pages don't render them).
- The page-enter slide in the direction moved; scroll to top on a page change; none with reduced motion. Browser Back behaves as a website.
- Skip link moves focus to the page's main region.

Blocked by: 08

Status: ready-for-agent

- [ ] App tests: a left swipe on the brief goes to The Menu, a right swipe on The Menu returns; a swipe starting in an input or a `data-no-swipe` element does nothing; the first and last pages have only one turn link; turn links name the target page
- [ ] App test: the skip link moves focus to the main region
- [ ] Reduced motion checked in the screenshot run (no slide)
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2's page foot and page turn (swipe between `#plan` and `#menu`); differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
