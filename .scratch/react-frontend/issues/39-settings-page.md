# 39: Settings: units, edition and data sources

**What to build:** Settings in the D2 look: preferred units for mass, volume and energy, saved when changed, noting that nothing saved is converted; the edition (follow the device, paper, evening), remembered on this device with the browser toolbar colour following; a language choice that appears only when a second language exists; and the data sources listed with their version, number of foods and how many columns are mapped, loading on their own so a failure doesn't hide the units, each opening its page.

Spec: "Implementation Decisions › Specific interactions" (Theme), "Out of Scope" (no unit catalogue editing, no Swedish file); stories 180–183, 197 (toolbar colour part).

- Replaces the `/settings` stub; preferences store (ticket 07), edition store (ticket 05), the translator's locales (ticket 04), Segmented control (ticket 10).
- Parity checklist: the Vue `SettingsPage` and `DataSourcesCard` tests.

Blocked by: 07, 08, 10

Status: ready-for-agent

- [ ] App tests: each unit choice saves through the preferences store; edition choice sets `data-theme` and the stored value; no language choice with one locale (and one with two, via a test-only second locale); data sources list and its own failure state while units still show; source link targets
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#settings`; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
