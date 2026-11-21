# 02: Prefactor: separate the pure rules from the Vue hooks

**What to build:** "Make the change easy": every framework-agnostic rule the React app will reuse lives in a module that imports nothing from Vue, vue-i18n or a `.vue` file, so React code never pulls Vue in. The Vue app keeps working exactly as before, importing the rules back from their new home.

Spec: "Implementation Decisions › Modules" ("Split, keeping the pure part"); story 199.

Today several modules mix pure rules with a Vue hook at the end and so import `vue` at the top. Move the pure parts out, leaving the Vue hooks where they are, importing the moved functions:
- the goal, schedule and recipe draft rules (draft from stored value, field checks, fields to send, server errors to fields, what shows when), out of their composables; the schedule draft's meal-name type out of the Vue meal names dialog;
- `loadAll` out of the Vue load composable;
- `goalFields` and `planFields` out of the module that also holds the Vue save hook;
- the unit-change refusal text and its types out of the Vue unit-change composable;
- the recipe count's "latest question wins" rule out of its Vue hook, if it has a pure part worth keeping.
Pure tests move with the functions; Vue-hook tests stay. Pure functions that called `useI18n` take a `Translate` parameter instead (the existing `Translate` type shape).

Blocked by: None (can start immediately)

Status: done

- [x] None of the moved-to modules imports `vue`, `vue-i18n`, `quasar` or a `.vue` file (checked with a search, noted in the ticket's Comments with the list of neutral modules)
- [x] Vue page and component tests pass unchanged (no test text edited other than imports)
- [x] No behaviour change in the Vue app
- [x] The README's Conventions section lists the new neutral module names if they differ from what it says
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

Neutral modules (all in `web/src/`, imported back by the Vue hooks):

| Module | What moved there | From |
|---|---|---|
| `goalDraft.ts` | `GoalDraft`, `GoalErrors`, `noErrors`, `draftFromGoal`, `opensAdvanced`, `showsReference`, `showsSplit`, `showsGuardRail`, `typedReference`, `draftErrors`, `draftFields`, `serverErrors`, `advancedMarked` | `composables/useGoalDraft.ts` |
| `scheduleDraft.ts` | `DAYS`, `MealName` (was in `MealNamesDialog.vue`), `DraftMeal`, `ScheduleDraft`, `ScheduleErrors`, `cellKey`, `validDate`, `validDays`, `scheduleRows`, `planDraft`, `scheduleFields`, `serverErrors` | `composables/useScheduleDraft.ts` |
| `recipeDraft.ts` | `DraftLine`, `DraftSection`, `RecipeDraft`, `RecipeErrors`, `noErrors`, `newKey`, `emptyDraft`, `plainLine`, `draftOf`, `draftOfImport`, `multiplier`, `hasErrors`, `MAX_SERVINGS`, `servingsOf`, `linesOf`, `keptLines`, `checkRecipe`, `serverErrors` (helpers the hook uses are now exported) | `composables/useRecipeDraft.ts` |
| `load.ts` | `loadAll` | `composables/useLoad.ts` |
| `planFields.ts` | `goalFields`, `planFields` | `plan.ts` (keeps `useSavePlan`) |
| `unitChange.ts` | `UnitChangeRequest`, `Translate` (optional named/plural shape), `RefusalContext`, `refusalText` | `composables/useUnitChange.ts` |
| `latest.ts` | `latestQuestion()`: "the latest question wins" rule, used by `useRecipeCount` | `recipeCount.ts` |

Also: `importReviewKey` (a Vue `InjectionKey`) moved out of `importReview.ts` into `composables/importReviewKey.ts`, and `importReview.ts` now takes `DraftLine` from `recipeDraft.ts`, so `importReview.ts` is neutral too. `clash.ts` was pulling Vue in through `useGoalDraft` and `plan`; it now imports `goalDraft` and `planFields` and is neutral.

Check: a script following every relative import transitively from each module above, plus `clash`, `importReview`, `goals`, `format`, `dates`, `lists`, `numbers`, `fractions`, `totals`, `misses`, `colours`, `attributeFields`, `lineUnits` and `api/*`, finds no `vue`, `vue-i18n`, `vue-router`, `quasar` or `.vue` import (type imports included).

Tests: the pure tests moved with their functions (`goalDraft.test.ts`, `scheduleDraft.test.ts`, `load.test.ts` moved whole; the pure halves of `useRecipeDraft.test.ts`, `useUnitChange.test.ts` and `plan.test.ts` went to `recipeDraft.test.ts`, `unitChange.test.ts` and `planFields.test.ts`); hook tests stay. Two small helpers (`line`, `imported`) are duplicated in `recipeDraft.test.ts` and `useRecipeDraft.test.ts`. New `latest.test.ts` (2 tests). Totals: 861 tests before, 863 after. Only imports changed in the Vue page and component tests (`PlanPage`, `RecipeSection`, `ImportLineReview`). The pure tests still build their `t` with vue-i18n (`makeI18n`/`createI18n`); ticket 04 may swap that for the React translator.

Left for 06/07: `solve.ts`, `units.ts`, `preferences.ts`, `importDraft.ts` and `recipeCount.ts` (the hook) still import `vue`; they are the stores those tickets rewrite. Two `Translate` types now exist (`goals.ts`: `(key, named)`; `unitChange.ts`: `(key, named?, plural?)`); the broader one fits both, so ticket 04 can give one translator to both.
