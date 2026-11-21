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

Status: in-progress (part 1 done; part 2 owes the items listed under Comments)

- [x] `package.json` lists no `vue`, `quasar`, `@quasar/*`, `vue-i18n`, `vue-router`, `@vitejs/plugin-vue`, `eslint-plugin-vue`, `@vue/*` or `vue-tsc`; no `.vue` file remains
- [x] `npm run lint`, `npm run typecheck` (now `tsc`), `npm test` pass in `web/`; the container builds and serves the React app at `/` with deep links working
- [x] The e2e flow passes against the built container locally (`E2E_PASSWORD=… E2E_BASE_URL=… npm run e2e`), or, if Docker is unavailable, against uvicorn serving the built app, noted in Comments
- [x] Manifest and icon updated; installing to a phone home screen shows the new name and colours
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with every D2 view (`#plan`, `#menu`, `#recipes`, `#recipe/<id>`, `#archive`, `#ingredients`, `#settings`) against the matching React page; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- (lead, after wave 4) Portions read differently on the brief ("× 0.7", rounded to a tenth with halves and quarters as fractions, `portionAmount`/`portionFigure` in `pages/brief/TodayMeals.tsx`) and on The Menu ("× 0.66"). Pick one rule, move it to a shared module and use it on both pages.

### Part 1 (swap, deletions, e2e, manifest)

- **Entry and base path.** `web/next/index.html` moved to `web/index.html` (the only entry, served at `/`); `src/app/base.ts`, `BASE_PATH`, `reactBase` and the dev fallback plugin are gone. The router has no basename; tests use plain paths (`'/recipes/1'`, `pathname` without slicing). The production build contains the React app; `/specimen` stays dev-only (`import.meta.env.DEV` in `routes.tsx`; checked: no specimen code in `dist/`).
- **Deleted.** `App.vue`, `main.ts`, `router.ts`, `pages.ts`, `i18n.ts`, `env.d.ts`, the Vue harness `test-app.ts`, `components/`, `composables/` (incl. `importReviewKey.ts`), `layouts/`, `pages/` (Vue), `translator.vue-parity.test.ts`, and the Vue copies of the stores in `src/` (`units`, `solve`, `preferences`, `recipeCount`, `importDraft`, `plan`, with their tests; the React stores in `app/stores/` cover them). Unused `shell/PageStub.tsx` and its CSS. Packages: vue, vue-i18n, vue-router, quasar, @quasar/extras, @quasar/vite-plugin, @vitejs/plugin-vue, eslint-plugin-vue, @vue/eslint-config-typescript, @vue/test-utils, vue-tsc, sass-embedded (nothing used Sass). `typecheck` and `build` use `tsc --noEmit`. ESLint now uses `typescript-eslint`'s recommended config directly (what `vueTsConfigs.recommended` wrapped); the "no Vue in src/app" rule went with Vue, the "stores import no React" rule stays. `test-setup.ts` lost the Quasar-only ResizeObserver/scrollTo stubs.
- **Pure tests moved to the app's translator.** `goals`, `goalDraft`, `recipeDraft`, `scheduleDraft`, `misses`, `clash`, `unitChange` tests use `makeTranslator(findLocale('en'))`; `lineUnits` and `importReview` tests use `catalogue(unitCatalogue().units)` from `app/stores/units`.
- **Messages.** Removed the 94 keys nothing in `src/` used any more (found by a script: every key that is neither a string literal in the source nor under a template-literal prefix such as `brief.failure.${…}`), incl. the whole `app` and `pages` namespaces, `plan.*` Vue copy, `schedule.*`/`results.*`/`clash.*` Vue copy, `shell.stub.*`, `import.title/intro/pasteText/needsKey`. Existing values were not edited (the straight apostrophes in `import.error.*` are still straight).
- **Manifest and icon.** `public/manifest.webmanifest`: name "The Weekly Table", short name "Weekly Table", theme and background `#f4efe4` (paper), icons 192, 512 and a maskable 512; `apple-touch-icon.png` (180) and `favicon-32.png`. The icon is the D2 masthead in miniature: paper with tooth, a strong and a thin rule, a Fraunces "W" in ink and a vermilion pencil stroke (rendered from Fraunces with Playwright; PNGs only, no generator committed). `index.html` links the manifest, icons and `apple-mobile-web-app-title`, keeps ticket 05's two `theme-color` metas (paper `#f4efe4`, evening `#16130f`) and the pre-paint edition script; title "The Weekly Table". Checked by serving the built container and reading the manifest and icons; not installed on a physical phone.
- **E2E.** `web/e2e/catalog.e2e.ts` rewritten for the React app, same flow and assertions where the app still has them: navigation through Contents (`openPage`), the recipe spread (Edit/Save, Add a line, sections), conversions, import from a link and pasted text with review, the brief (schedule sheet, goal sheet, filters sheet), Compose the week, The Menu and Save to the archive, The archive, the Editor's note (Make Prefer, Try again), column mapping, add from data source, updated values, equivalent tags. Changed where the app differs: Save stays enabled during import review (the banner says "Match, convert or skip every line to save."), the AI mark is text, saving a plan returns to the brief, a filter with no recipe reads "No recipe fits these filters.". Run (about 85 s) against **the built container** (`docker build` + `docker run --network host`, SQLite inside the container instead of CI's Postgres) and against uvicorn serving `web/dist`: both pass. Sandbox notes: Docker Hub answered 429, so the base images came from `mirror.gcr.io` and were tagged locally, and the build used a copy of the Dockerfile that only adds the sandbox proxy's CA bundle (`--build-context ca=…`, `NODE_EXTRA_CA_CERTS`, `PIP_CERT`); the repo's Dockerfile is unchanged and needs no change (it builds `web/` with `npx vite build`, which now builds the React entry). CI's command names (lint, typecheck, test, e2e) are unchanged.
- **Quick screenshots** (`/`, The Menu `/plans/new`, a recipe `/recipes/1`, both widths and editions, from the container): render at the root, no `/next/`.
- **Docs.** README: the Status section describes the React app (Contents, brief, The Menu, archive, Editor's note, spread) instead of the Vue pages; the `/next/` paragraph replaced. Comments in neutral modules no longer name Vue hooks. `scripts/screenshot.ts` usage says `/recipes`. Dev container no longer recommends the Vue (Volar) extension.
- **For the lead's README** (`issues/README.md`, not edited here): "Entry, base path, harness" and "Base path" conventions are obsolete (entry `web/index.html`, no base path, no `BASE_PATH`); in "Screenshot checks" the target is `/recipes`, not `/next/recipes` ("`/recipes` for Vue" no longer applies), and the example is `npm run shot -- / --click Contents`; "Vue tests stay untouched until 42" and the Messages rule about Vue tests no longer apply.

### Found in passing

- Typing into a new recipe line's amount straight after picking the ingredient could be lost in the e2e (the value was empty after `fill`); waiting until the new amount field has focus fixed it. Possibly the line re-mounting as focus moves; worth a look.
- The production build warns that the main chunk is over 500 kB (516 kB, 156 kB gzipped); the routes could load lazily.

### Part 2 still owes

- Fold the page-local copies of D2's `.cover`, `.standfirst`, `.annot`, empty state and the `.btn` copies (`review-btn`, `lines-text-btn`, `spread-annot`, `tags-annot`, `attributes-annot`, …) into shared styles, and local custom properties into tokens.
- One portion-rounding rule for the brief and The Menu (the lead's comment above).
- The Button ref, and moving `isoWeek` (now in `shell/Contents.tsx`) and the issue line to a shared module.
- Applying the frontend-design, react-best-practices and web-design-guidelines skills over the final app (box above not ticked).
- The final screenshot pass of every page at both widths and editions against every D2 view (box above not ticked).

