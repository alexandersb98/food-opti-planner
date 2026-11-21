# 10: Form and display primitives, and the load hook

**What to build:** The small building blocks every page uses, in D2's look: a page's data loaded with loading, failed and Try again states; labelled fields with hints and errors wired for screen readers; steppers, segmented controls, chips, native selects, disclosures; importance dots, rule tags and the drawn colour plate.

Spec: "Implementation Decisions › Modules" (Load hook, UI primitives other than Sheet, Confirm and Combobox), "› Performance and React practice", "› UI quality bar"; stories 25 (pattern), 45 (dots), 60 (rule tag), 115 (plate), 193.

- **Load hook**: a page's data loaded when it opens, several calls in parallel through `loadAll` (moved by ticket 02); loading, failed and retry; answers that arrive after the page left or after a newer load are ignored (safe under strict-mode double effects). Unit-tested.
- **LoadState**: loading and "failed, Try again" display.
- **Field** (label, hint, error; `aria-describedby`, `aria-invalid`; error announced), **Stepper** (min, max, step function, 44 px targets), **Segmented control** (a group of pressed buttons), **Chips** (toggle chips with pressed state), **Select** (native, with option groups), **Disclosure** (for Advanced parts; can start open).
- **Importance dots** (1–5, with text for screen readers), **Rule tag** ("Never: pork"), **Plate** (the drawn SVG colour plate and a small swatch, hue derived deterministically from the recipe id, as in D2).
- Stepper, Segmented and Chips carry `data-no-swipe`.
- One stylesheet per primitive; one specimen section per primitive (README Conventions).

Blocked by: 02, 04, 05

Status: ready-for-agent

- [ ] Load hook tests: parallel calls; failure and retry; a stale answer after unmount or after a newer load is ignored; strict mode does not show stale data
- [ ] Field wiring tested once (label, hint and error reachable by accessible description; `aria-invalid` set)
- [ ] Plate hue is stable for a given id and varies across ids (unit test)
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2's controls on `#plan` (steppers, segmented controls, chips in sheets, rule tags, importance dots) and plates on `#recipes`; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
