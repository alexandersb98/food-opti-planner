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

Status: done

- [x] Ported tests pass: units and preferences load once, retry after failure, generation reset; preference saves serialised; unit-change question resolves with the chosen answer; draft taken once; recipe count drops a late answer
- [x] No file of the stores imports `vue` or React
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- **Where.** Stores in `web/src/app/stores/` (`units.ts`, `preferences.ts`, `unitChangeQuestion.ts`, `importDraft.ts`, `recipeCount.ts`, on a tiny `state.ts` helper: `createState` with `subscribe`/`getSnapshot`/`set`/`update`, immutable snapshots). React hooks over them in `web/src/app/hooks/` (`useUnits`, `usePreferences`, `useUnitChangeQuestion`, `useImportedDraft`, `useRecipeCount`).
- **Lint.** `eslint.config.ts` gained a block for `src/app/stores/**/*.ts` forbidding React (and still Vue) imports, so "no store imports a framework" is checked, not just promised. Ticket 06 may add the same; keep one block.
- **Units.** `unitsStore` (`load`, `reset`, snapshot `{ units, loading, failed }`) plus the pure `catalogue(units)` with the Vue module's lookups (`offered`, `findUnit`, `convertible`, `ratio`, `label`, `basisFor`). The lookups are a copy of the Vue `units.ts` logic (the Vue store is not edited, per this ticket); ticket 42 removes the Vue copy. `useUnits()` loads on mount and memoises the lookups on the catalogue.
- **Preferences.** `preferencesStore` (`load`, `set` serialised, `reset`) plus `preferredUnit(preferences, category)`.
- **Unit-change question.** `unitChangeQuestion.ask(request)` resolves to a yes/no, as today: yes is Convert (preview converts) or Change unit (preview keeps the numbers), the label coming from `request.change.kind`; no is Cancel. A second `ask` settles the first as no; `reset` settles an open one as no. Ticket 37's sheet reads `useUnitChangeQuestion()` and calls `unitChangeQuestion.answer(ok)`; it should also answer no when it unmounts (as the Vue dialog does).
- **Imported draft.** `importDraftStore.put/take`. React's StrictMode (on in `main.tsx`) renders twice, so the spread must not `take()` during render: `useImportedDraft()` reads the draft in a `useState` initialiser and takes it in an effect (tested under StrictMode). Tickets 26/34/35 use this.
- **Recipe count.** `createRecipeCount()` is one store per reader (the filters sheet), not shared, so it has no `resetStores` line; `useRecipeCount()` holds one per component. Ticket 19 uses it.
- **resetStores.** Four lines: units, preferences, unit-change question, imported draft.
- Ported tests: `web/src/app/stores/*.test.ts` (all Vue scenarios, plus reset-in-flight and subscriber tests); hooks: `web/src/app/hooks/hooks.test.tsx`.
