# 04: Translator reading the existing English messages

**What to build:** React components get their text through a `useT` hook backed by a small in-house translator that reads the existing English message file as it is, so every text in the React app goes through i18n from the first page on and Swedish can later be added as another file.

Spec: "Implementation Decisions › Stack" (the i18n bullet); "Testing Decisions › Modules tested" (Translator); stories 182 (locales list only), 200.

- A pure translator over the vue-i18n subset the app uses: named placeholders (`{name}`), pipe-separated plurals (two forms: one | other; three forms: zero | one | other), the implicit `{n}`, and the four call shapes (key; key + named; key + count; key + named + count). Its signature satisfies the `Translate` types the framework-agnostic modules already take, so they are reused unchanged.
- Holds the locale (English now) with a per-locale plural rule, and exposes the list of available locales (Settings shows a language choice only when there is more than one, ticket 39).
- A React context provider and `useT` hook; the provider wraps the React app root and the `mountApp` harness.
- No i18next, FormatJS or `@intlify/*`.

Blocked by: 01

Status: ready-for-agent

- [ ] Unit test: every message in the English file renders with sample values and leaves no `{…}` placeholder behind
- [ ] Unit tests: two- and three-form plural choice (0, 1, many), implicit `{n}`, named and count call shapes, a missing key falls back visibly (the key itself) and is reported in tests
- [ ] The framework-agnostic modules (goals, clash, misses, unit-change refusal text) type-check when given the translator
- [ ] The React placeholder page shows a translated string through `useT`, tested through `mountApp`
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
