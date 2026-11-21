# 05: Paper and ink: tokens, fonts, editions and the specimen

**What to build:** The React app looks like D2 at the base level: D2's paper and evening palettes, Fraunces and Instrument Sans served with the app, D2's type scale and 4 px rhythm, old-style figures in text and tabular figures in tables, red-pencil focus rings, reduced motion respected, and the edition (follow the device, paper, evening) applied before first paint. A dev-only specimen page shows the tokens and type, and later primitive tickets add their sections to it.

Spec: "Implementation Decisions › Design tokens (from the prototype)" (take the palettes and scale verbatim; read D2's stylesheet for plate colours, paper tooth, kickers, small capitals, drop caps), "› Specific interactions" (the Theme bullet), "› UI quality bar"; stories 188, 189, 190, 193 (focus rings), 194 (global part), 195.

- Design tokens as CSS custom properties: paper edition by default; evening edition when the device is dark unless `data-theme="light"`, or when `data-theme="dark"`. `color-scheme` set per edition. D2's type scale, spacing, gutter, touch size, masthead height, easing.
- Fonts from npm variable font packages through Vite, `font-display: swap`; no Google Fonts.
- Base element styles (body, headings, links, buttons, inputs, tables, focus-visible, kickers, small capitals, rules) in one base stylesheet; nothing page-specific.
- An edition store (framework-neutral: state, `subscribe`, `getSnapshot`): "device" | "paper" | "evening", kept in local storage under a versioned key, sets or removes `data-theme` on the root element and updates the `theme-color` meta tags; a tiny inline script in the React HTML entry applies it before first paint. Add it to `resetStores`. Hook the storage key into the screenshot script (ticket 03).
- `prefers-reduced-motion` turns off all transitions and animations globally.
- A dev-only specimen view (not in Contents, not in production builds) with one section per primitive, each section in its own file and registered with one line (README Conventions).

Blocked by: 01, 03

Status: ready-for-agent

- [ ] Unit tests for the edition store: default follows the device, choice persists under the versioned key, a corrupt or missing stored value falls back to "device", `data-theme` and `theme-color` follow
- [ ] No font or stylesheet is requested from a third-party host (checked in the browser's network panel or the built output)
- [ ] Contrast of ink and accent on paper meets WCAG AA in both editions (noted with the numbers in Comments)
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2's general look (any D2 view) for type, colours and rules; the specimen page is what is screenshotted; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
