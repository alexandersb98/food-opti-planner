# 39: Settings: units, edition and data sources

**What to build:** Settings in the D2 look: preferred units for mass, volume and energy, saved when changed, noting that nothing saved is converted; the edition (follow the device, paper, evening), remembered on this device with the browser toolbar colour following; a language choice that appears only when a second language exists; and the data sources listed with their version, number of foods and how many columns are mapped, loading on their own so a failure doesn't hide the units, each opening its page.

Spec: "Implementation Decisions › Specific interactions" (Theme), "Out of Scope" (no unit catalogue editing, no Swedish file); stories 180–183, 197 (toolbar colour part).

- Replaces the `/settings` stub; preferences store (ticket 07), edition store (ticket 05), the translator's locales (ticket 04), Segmented control (ticket 10).
- Parity checklist: the Vue `SettingsPage` and `DataSourcesCard` tests.

Blocked by: 07, 08, 10

Status: done

- [x] App tests: each unit choice saves through the preferences store; edition choice sets `data-theme` and the stored value; no language choice with one locale (and one with two, via a test-only second locale); data sources list and its own failure state while units still show; source link targets
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#settings`; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

### What was built (`web/src/app/pages/settings/`)

- `Settings.tsx`: the cover ("The small print", italic *Settings*), then the parts in D2's order, each a `section` named by its `h2`: **Edition** (Segmented: Follow the device, Paper, Evening; through `useEdition` and `editionStore.set`, so `data-theme`, local storage and the `theme-color` tags follow), **Language** (Segmented of `useLocale().locales`, each name in its own `lang`; rendered only with two or more locales), then the two parts below.
- `PreferredUnits.tsx`: three native `Select`s in `Field`s (Mass, Volume, Energy; options from `useUnits().offered`, shown as "g (gram)"), each saved on change through `usePreferences().set`. The chosen value shows at once while its save is under way (`aria-busy`) and goes back to the stored value if the save fails, with `common.saveFailed` as a red-pencil alert. A failed units or preferences load shows `settings.loadFailed` with Try again in this part only.
- `DataSources.tsx`: its own `useLoad` of `/api/data-sources`, so its failure (own message and Try again) never hides the units; entries drawn like D2's archive entries (colour dot, serif name, "Version … · n foods · m of n columns mapped", chevron), each a `Link` to `/settings/data-sources/:key`; the empty line when there are none.
- `settings.css` (prefix `settings-`). No new tokens.

### Messages

New keys in `settings`: `kicker`, `edition.{title,device,paper,evening,hint}`, `language.title`. The page title reuses `shell.pages.settings.title`; the rest reuses the existing `settings.*` keys and `common.saveFailed`.

### Tests

`Settings.test.tsx` (17 tests through `mountApp('/settings')`) ports both Vue parity files (`SettingsPage.test.ts`, `DataSourcesCard.test.ts`) except "Settings opens from the menu" (the shell's Contents tests cover that), and adds the edition (pressed state, `data-theme`, stored value, `theme-color` media switching, a stored edition shown pressed) and no language choice with one locale. `SettingsLanguage.test.tsx` mocks the translator with a test-only second locale ("Svenska" with the English messages) to show the choice appears and switches.

### Screenshots and decisions

Shot at 390 × 844 and 1280 × 800, paper and evening, full page, plus keyboard focus on a data-source entry; compared with D2 `#settings`:

- Cover, the rules between parts, the part headings and the Segmented match D2. The base `h2` style (opsz 96, tight tracking) made the part headings look condensed beside D2's, which have neither; the part heading resets both.
- D2's "Units" part (catalogue summary with "Edit the unit catalogue") and "Attributes" part are not built: catalogue editing is out of scope and Attributes has its own page. Preferred units and Data sources take their place, as this ticket asks.
- The three unit lists stack on a phone and sit in three columns from 560 px.
- The edition hint adds "Kept on this device only." (the choice is per device).
- Turn links and folio at the foot (D2) are ticket 12's.
- web-design-guidelines: added `name` to the selects; the focus ring shows on entries and controls; long source names wrap. Native select colours for Windows dark mode belong to the Select primitive (ticket 10) and are unchanged here.
