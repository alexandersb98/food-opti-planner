# 09: Sheet and Confirm

**What to build:** The overlay primitives every editing flow uses: a bottom sheet that slides up with a grip, a title and a close button, and a Confirm sheet with a warning and two actions. They work equally by touch, keyboard and screen reader, and are centred and page-wide on a desktop.

Spec: "Implementation Decisions › Modules" (UI primitives: Sheet, Confirm), "› Specific interactions" (Desktop), "› UI quality bar"; "Testing Decisions › Prior art" (dialog polyfill), "Assumptions to confirm" 1 (component tests for the sheet's focus trap); stories 191, 194 (sheets), 196.

- **Sheet**: a native `dialog` opened modally; focus moves in and is trapped; Escape and a backdrop tap close it (a `beforeClose` hook lets a dirty form refuse); the page's scroll is locked; focus returns to what opened it; animated open and close (none with reduced motion); a full-screen variant (used by Add from data source, ticket 32). Carries `data-no-swipe` (README Conventions).
- **Confirm**: a sheet with a title, a warning text, a cancel action and a (possibly destructive) confirm action; returns the choice to the caller.
- A `dialog` polyfill in the test setup if jsdom lacks modal dialogs.
- Specimen sections for both (README Conventions).

Blocked by: 04, 05

Status: done

- [x] Component tests: opening moves focus inside; Tab cycles inside; Escape and backdrop close; focus returns to the opener; `beforeClose` can keep it open; Confirm resolves with the chosen action
- [x] Reduced motion: no slide animation (checked in the screenshot run)
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2's bottom sheet (tap a day or a goal on `#plan`); differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

**What landed**
- `web/src/app/ui/sheet/Sheet.tsx` (+ `sheet.css`): `<Sheet open onClose title beforeClose? fullScreen? initialFocus? finalFocus? role? describedBy?>`, controlled. The native `dialog` covers the viewport and is the scrim; the panel inside is D2's sheet (grip, sticky head with italic serif title and close button, double rule on top, 88dvh, slide up .36s / down .22s, scrim fade). A tap on the dialog itself (press and release outside the panel) closes; Escape is handled on keydown (stopped there, so the shell's global Escape does not also see it), and the native `cancel` (back gesture) goes the same way. `beforeClose` may return a boolean or a promise (ask with a Confirm); it is not asked when the caller sets `open` to false. Tab is trapped explicitly (jsdom and the browser chrome). Focus starts on the title (D2) or `initialFocus`, and returns to the opener or `finalFocus` after the closing animation; a sheet that closes while a Confirm opened from it is still on screen hands its opener on to that Confirm. Scroll lock is CSS only: `:root:has(.sheet[open]) { overflow: hidden }`. Carries `data-no-swipe`.
- Shared parts in `sheet.css` for sheet bodies: `.sheet-preview` (D2's live preview sentence), `.sheet-actions`, and D2's `.btn` as `.sheet-btn` + `.sheet-btn-primary` / `-ghost` / `-danger` (no ticket owns a Button primitive; pages may use these classes in their sheets).
- `web/src/app/ui/confirm/Confirm.tsx`: `<Confirm>` (role `alertdialog`, warning as `aria-describedby`, focus on Cancel, destructive confirm in the accent colour) and `useConfirm()` → `[confirm, confirmSheet]`; `await confirm({title, message, confirmLabel, cancelLabel?, destructive?})` resolves true/false (false for Cancel, Escape, close, tap outside, a newer question, or the caller unmounting).
- `web/src/test-setup.ts`: jsdom lacks `show`/`showModal`/`close`; a small polyfill adds them (no inertness, no cancel on Escape).
- Message: new namespace `sheet` (`sheet.close`) after `common`.
- Specimen: one line in `specimen/sections.ts` ("Sheets and Confirm", `ui/sheet/Specimen.tsx`) with the at-least sheet, a note sheet whose `beforeClose` asks a Confirm, a full-screen sheet and a destructive Confirm.

**Screenshots** (390×844, 1280×800, paper and evening; specimen vs `d2:plan` with a day and a goal tapped). The at-least sheet matches D2's in grip, rule, title, preview, spacing and Done button in both editions. Checked in Chromium: reduced motion gives no animation at all (computed `animation-name: none`, the sheet closes at once); without it the panel runs `sheet-up`/`sheet-down`; Tab/Shift+Tab cycle, Escape inside a Confirm closes only the Confirm, focus returns to the opener even when the sheet and its Confirm close together (a bug found this way and fixed, with a test).

**Decisions and deviations**
- Desktop: "centred" read as horizontally centred and still anchored to the foot, at the page column's width (`--page-max`, 720px, from 768px) with wider inner padding (32px). Full-screen fills the page column's width at full height.
- The grip is decorative (as in D2): no drag-to-dismiss.
- Full-screen variant hides the grip and the top rule.
- Focus on open is the title (D2), which has no focus ring (not reachable by Tab); Confirm starts on Cancel (APG alertdialog).
- A press on the scrim does not move focus (`mousedown` default prevented), so a field keeps focus when `beforeClose` refuses.

**For the README / ticket 42**
- Conventions: sheets use `Sheet` / `useConfirm` from `app/ui/sheet` and `app/ui/confirm`; sheet bodies can use `.sheet-preview`, `.sheet-actions`, `.sheet-btn(-primary|-ghost|-danger)`.
- Ticket 42 could fold `.sheet-btn` into a shared Button and add `scrollbar-gutter: stable` on `html` (the scroll lock shifts the desktop layout by the scrollbar width when the page has one).
- Ticket 08: the Contents dialog may reuse `Sheet` with `fullScreen` or at least its Escape handling; a sheet stops Escape from reaching a document-level listener.
