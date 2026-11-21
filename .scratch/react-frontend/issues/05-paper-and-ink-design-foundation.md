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

Status: done

- [x] Unit tests for the edition store: default follows the device, choice persists under the versioned key, a corrupt or missing stored value falls back to "device", `data-theme` and `theme-color` follow
- [x] No font or stylesheet is requested from a third-party host (checked in the browser's network panel or the built output)
- [x] Contrast of ink and accent on paper meets WCAG AA in both editions (noted with the numbers in Comments)
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2's general look (any D2 view) for type, colours and rules; the specimen page is what is screenshotted; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

**What landed (for the README and later tickets)**

- Styles: `web/src/app/styles/` — `fonts.css` (Fontsource variable packages `@fontsource-variable/fraunces` full axes roman+italic, `@fontsource-variable/instrument-sans` roman+italic; `font-display: swap`), `tokens.css` (D2's `:root` verbatim, both evening blocks, plate colours, shadow/scrim/press, narrow-phone overrides; additions: `--tooth`/`--tooth-size` for the paper tooth and `--page-max: 720px`), `base.css` (elements in `:where()` so any component class wins; focus ring; kickers `.kicker`, small caps `.sc`, `.label`, `.display`, `.num`, `.os`, `.serif-text`, `.lead-text` (standfirst size), `.dropcap`, `.visually-hidden`, `.paper` (paper + tooth); `hr`, `hr.strong`, `hr.double`; reduced motion). `global.css` imports the three; `main.tsx` imports it once. Font families are `"Fraunces Variable"` / `"Instrument Sans Variable"` (Fontsource names), reached through `--serif` / `--sans`.
- `body` is the desk (D2): the page column on top must be painted by the shell (ticket 08) with `.paper` (or `background: var(--paper)` + `var(--tooth)`).
- Text fields get D2's ruled-line look and a red underline on focus as base element styles; primitives (ticket 10) override with their own class.
- Edition store: `web/src/app/stores/edition.ts` (`editionStore` with `getSnapshot`, `subscribe`, `set`, `reset`; `EDITIONS`, `EDITION_STORAGE_KEY = 'planner.edition.v1'`, stored values `paper` / `evening`, "device" removes the key; also follows changes from other tabs). Hook: `stores/useEdition.ts`. Added to `resetStores`. The inline script in `web/next/index.html` applies it before first paint (tested by running the script from the HTML file). `theme-color` metas carry `data-media` with their original query; a picked edition sets its own tag to `all` and the other to `not all` (as D2).
- Screenshot script: `EDITION_STORAGE.key` now defaults to `planner.edition.v1`.
- Specimen: `/specimen` (route only when `import.meta.env.DEV`; the Vite production build is still Vue-only anyway). Registry `web/src/app/specimen/sections.ts`, one line per section `{ id, title, load: () => import('…') }`, each section a lazily loaded default-export component; put a primitive's section in its own folder (e.g. `ui/stepper/Specimen.tsx`) or in `specimen/sections/`. Specimen copy is English in code, not in `en.json` (dev-only page; the translator, ticket 04, ran in parallel).

**Contrast (WCAG, computed from the token values; AA body text needs 4.5:1)**

| Text on ground | Paper | Evening |
|---|---|---|
| ink on paper | 15.1:1 | 14.9:1 |
| ink-2 on paper | 10.9:1 | 11.6:1 |
| muted on paper | 6.0:1 | 7.0:1 |
| accent on paper | 5.8:1 | 7.6:1 |
| good on paper | 5.8:1 | 9.4:1 |
| muted on paper-2 | 5.4:1 | 6.5:1 |
| accent on paper-2 | 5.3:1 | 7.1:1 |
| accent-ink on accent | 6.3:1 | 7.7:1 |
| paper on ink | 15.1:1 | 14.9:1 |
| review-ink on review | 8.6:1 | 8.5:1 |

All pass AA in both editions (the specimen's Palette section shows this table live).

**Screenshots and checks.** Specimen at 390 × 844 and 1280 × 800 in both editions, against D2 `#plan`. Type, weights, the paper tooth, the rules and both palettes look like D2. Only `localhost` is requested; all four font faces load. There is no horizontal scroll at 320 px. Fixed after the first round: the global focus ring beat the field rule (same specificity, earlier in the file), so fields showed a box instead of D2's red underline. The field rule now comes after the ring.

**Deviations / notes for later**
- No `<link rel="preload">` for the fonts: Vite hashes the files and the unicode-range split means preloading would guess. Ticket 42 can add one for the Latin Fraunces roman if first paint shows a visible swap.
- D2's `.phone` frame, masthead, skip link, `.btn`, `.text-btn`, `.seg`, `.chip`, `.input`-as-class are not in base: they belong to the shell (08) and primitives (10).
- `--page-max` (720px) is new, from the spec's desktop rule (D2's phone is 430px).
