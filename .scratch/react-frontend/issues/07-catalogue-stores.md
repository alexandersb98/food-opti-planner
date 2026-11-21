# 07: Framework-neutral stores for units, preferences, questions and hand-overs

**What to build:** The shared catalogues and hand-overs the catalogue pages need live in framework-neutral stores (state, `subscribe`, `getSnapshot`; read in React with `useSyncExternalStore`), keeping today's behaviour: load once and share, retry after failure, ignore answers from before a reset, serialised preference saves.

Spec: "Implementation Decisions › Modules" ("Shared stores", "Recipe count"); "› Performance and React practice" (shared catalogues load once); stories 64, 156, 158, 171, 180.

- **Unit catalogue**: loaded once and shared, a failed load retried by the next reader, a generation reset for tests; the lookups the Vue units module offers.
- **Preferences**: loaded once, saves serialised, the preferred unit per kind.
- **Unit-change question**: a page asks the question and awaits the owner's answer (convert, keep, cancel); one question at a time (the sheet is ticket 37).
- **Imported draft hand-over**: the import page puts a draft, the recipe spread takes it once.
- **Recipe count**: "the latest question wins" counter (answers that arrive late are dropped), as a neutral function/store over the pure rule.
- All added to `resetStores`; the Vue stores are not edited; their existing tests are ported to the neutral API.

Blocked by: 02

Status: ready-for-agent

- [ ] Ported tests pass: units and preferences load once, retry after failure, generation reset; preference saves serialised; unit-change question resolves with the chosen answer; draft taken once; recipe count drops a late answer
- [ ] No file of the stores imports `vue` or React
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
