# 09: Sheet and Confirm

**What to build:** The overlay primitives every editing flow uses: a bottom sheet that slides up with a grip, a title and a close button, and a Confirm sheet with a warning and two actions. They work equally by touch, keyboard and screen reader, and are centred and page-wide on a desktop.

Spec: "Implementation Decisions › Modules" (UI primitives: Sheet, Confirm), "› Specific interactions" (Desktop), "› UI quality bar"; "Testing Decisions › Prior art" (dialog polyfill), "Assumptions to confirm" 1 (component tests for the sheet's focus trap); stories 191, 194 (sheets), 196.

- **Sheet**: a native `dialog` opened modally; focus moves in and is trapped; Escape and a backdrop tap close it (a `beforeClose` hook lets a dirty form refuse); the page's scroll is locked; focus returns to what opened it; animated open and close (none with reduced motion); a full-screen variant (used by Add from data source, ticket 32). Carries `data-no-swipe` (README Conventions).
- **Confirm**: a sheet with a title, a warning text, a cancel action and a (possibly destructive) confirm action; returns the choice to the caller.
- A `dialog` polyfill in the test setup if jsdom lacks modal dialogs.
- Specimen sections for both (README Conventions).

Blocked by: 04, 05

Status: ready-for-agent

- [ ] Component tests: opening moves focus inside; Tab cycles inside; Escape and backdrop close; focus returns to the opener; `beforeClose` can keep it open; Confirm resolves with the chosen action
- [ ] Reduced motion: no slide animation (checked in the screenshot run)
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2's bottom sheet (tap a day or a goal on `#plan`); differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
