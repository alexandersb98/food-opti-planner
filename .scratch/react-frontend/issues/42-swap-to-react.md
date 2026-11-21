# 42: Swap: React becomes the app, Vue is removed

**What to build:** The deployed app is the React app: it is served at `/` from the root entry, the home-screen app's name, colours and icon match the new look, the end-to-end test drives the React app, and Vue, Quasar and vue-i18n are gone. CI's web commands (lint, typecheck, test) keep their names.

Spec: "Implementation Decisions › Migration" (the final swap bullet), "Testing Decisions › Seams" (seam 3); stories 197, 201, 202, 203.

- Make the React entry the root entry; drop the `/next/` base path and its dev fallback.
- Port the Playwright e2e flow to the React app's accessible names and the new navigation (Contents instead of the drawer, The archive, the Editor's note, the spread); keep it the one e2e test.
- Delete the Vue app, its tests and wrappers, Quasar and its extras, vue-i18n, vue-router, the Vue Vite and ESLint plugins, Vue Test Utils and `vue-tsc` (typecheck becomes `tsc --noEmit`); the Sass dependency if nothing else needs it. Keep the neutral modules and their tests.
- Messages: remove keys only the Vue app used (the translator test keeps checking the rest).
- The web app manifest's name, short name, theme and background colours, and the icon, in the D2 look; the `theme-color` meta tags per edition.
- The dev-only specimen stays out of production builds.
- A final screenshot pass of every page at both widths and editions, compared with D2.

Blocked by: 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41

Status: ready-for-agent

- [ ] `package.json` lists no `vue`, `quasar`, `@quasar/*`, `vue-i18n`, `vue-router`, `@vitejs/plugin-vue`, `eslint-plugin-vue`, `@vue/*` or `vue-tsc`; no `.vue` file remains
- [ ] `npm run lint`, `npm run typecheck` (now `tsc`), `npm test` pass in `web/`; the container builds and serves the React app at `/` with deep links working
- [ ] The e2e flow passes against the built container locally (`E2E_PASSWORD=… E2E_BASE_URL=… npm run e2e`), or, if Docker is unavailable, against uvicorn serving the built app, noted in Comments
- [ ] Manifest and icon updated; installing to a phone home screen shows the new name and colours
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with every D2 view (`#plan`, `#menu`, `#recipes`, `#recipe/<id>`, `#archive`, `#ingredients`, `#settings`) against the matching React page; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- (lead, after wave 4) Portions read differently on the brief ("× 0.7", rounded to a tenth with halves and quarters as fractions, `portionAmount`/`portionFigure` in `pages/brief/TodayMeals.tsx`) and on The Menu ("× 0.66"). Pick one rule, move it to a shared module and use it on both pages.
