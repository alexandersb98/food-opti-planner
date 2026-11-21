# 04: Translator reading the existing English messages

**What to build:** React components get their text through a `useT` hook backed by a small in-house translator that reads the existing English message file as it is, so every text in the React app goes through i18n from the first page on and Swedish can later be added as another file.

Spec: "Implementation Decisions › Stack" (the i18n bullet); "Testing Decisions › Modules tested" (Translator); stories 182 (locales list only), 200.

- A pure translator over the vue-i18n subset the app uses: named placeholders (`{name}`), pipe-separated plurals (two forms: one | other; three forms: zero | one | other), the implicit `{n}`, and the four call shapes (key; key + named; key + count; key + named + count). Its signature satisfies the `Translate` types the framework-agnostic modules already take, so they are reused unchanged.
- Holds the locale (English now) with a per-locale plural rule, and exposes the list of available locales (Settings shows a language choice only when there is more than one, ticket 39).
- A React context provider and `useT` hook; the provider wraps the React app root and the `mountApp` harness.
- No i18next, FormatJS or `@intlify/*`.

Blocked by: 01

Status: done

- [x] Unit test: every message in the English file renders with sample values and leaves no `{…}` placeholder behind
- [x] Unit tests: two- and three-form plural choice (0, 1, many), implicit `{n}`, named and count call shapes, a missing key falls back visibly (the key itself) and is reported in tests
- [x] The framework-agnostic modules (goals, clash, misses, unit-change refusal text) type-check when given the translator
- [x] The React placeholder page shows a translated string through `useT`, tested through `mountApp`
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- **Where it lives.** The pure translator is `web/src/translator.ts` (framework-neutral, beside the other neutral modules): `makeTranslator(locale, onMissing?)`, `locales` (English only), `findLocale(code)`, `englishPlural`, and the types `Translate`, `Messages`, `Locale`, `PluralRule`. React side: `web/src/app/i18n/i18n.tsx` with `I18nProvider`, `useT()` and `useLocale()` (`{ locale, locales, setLocale }`, for ticket 39's language choice; persisting the choice is ticket 39's). The provider wraps the router in `App.tsx`, so `main.tsx` and `mountApp` both get it.
- **Translate type.** The translator's `Translate` has two overloads, `(key, count)` and `(key, named?, count?)`; it is assignable to both existing `Translate` types (`goals.ts`, `unitChange.ts`) and to the one `misses.ts` keeps private. Tested by calling `rangeText`, `boundError`, `clashServerErrors`, `missRows` and `refusalText` with it.
- **vue-i18n semantics copied exactly** (checked by `web/src/translator.vue-parity.test.ts`, which compares every English message in five call shapes against vue-i18n): spaces next to `|` are dropped, a message's own leading/trailing spaces kept; a missing named value renders empty; with no count a plural message picks the "one" form; a *number* given as named `count` or `n` picks the plural form even without (and ahead of) the count argument (e.g. `settings.dataSources.mapped` is called with `{ mapped, n }` only); the count fills `{n}`/`{count}` unless a truthy named value of that name is given. **Ticket 42 must delete `translator.vue-parity.test.ts`** together with vue-i18n.
- **Missing keys.** A key with no message renders as the key itself and goes to `onMissing`; in development the app logs a warning, and the `mountApp` harness fails the test (afterEach) listing the missing keys. Unsupported syntax (linked `@:` messages, `{'literal'}`, `{0}`) is rejected by the translator test, so a later message using it fails CI instead of rendering wrongly.
- **Placeholder page.** Only its heading goes through `useT` (`app.title`); its other lines are dev-only scaffolding that ticket 08 replaces, so no keys were added to `en.json`.
- **For later tickets (README):** get text with `const t = useT()` from `app/i18n/i18n`; pass `t` straight to the neutral modules. A typo'd key fails the app test that renders it.
