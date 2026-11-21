# 06: Framework-neutral stores for the solve and the plan setup

**What to build:** The running solve and the plan setup live in framework-neutral stores (a plain module with state, `subscribe` and `getSnapshot`, read in React through `useSyncExternalStore`), so the brief, the composing view, The Menu and the Editor's note share one source of truth and the brief can save every tap safely.

Spec: "Implementation Decisions › Modules" ("Shared stores", "Saving the setup"); "Testing Decisions › Modules tested" (Stores); stories 33, 71, 73–76, 82, 83.

- **Solve store**, a port of the Vue solve store's behaviour: start a solve with a fresh solve id carried by Make plan and Cancel; cancel by id; `cancelling` until the server answers; busy (another tab); failure reasons; the clash and its minimality kept until dismissed; answers from before a reset ignored. It must not navigate: it reports the outcome (plan made, infeasible, failure) so the caller decides where to go (ticket 20). Port the Vue solve tests to this API.
- **Plan-setup store**: owns the loaded plan setup; every change sends the whole setup (built with the pure `planFields`/`goalFields`) one save at a time, the next built from the latest state; an optimistic change reverts and reports when its save fails; server field errors are returned to the caller (for sheets that stay open with errors). Unit tests for order, latest state and revert.
- Both added to `resetStores`. The Vue stores are not edited.

Blocked by: 02

Status: done

- [x] Ported solve tests pass against the neutral store (start, cancel by id, a cancel crossing the answer doesn't reach the next solve, busy, failures, clash kept until dismissed, reset)
- [x] Plan-setup tests: three quick changes are saved in order, each from the latest state; a failed save reverts only its own change and reports it; field errors come back to the caller
- [x] No file of the stores imports `vue` or React
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- Stores live in `web/src/app/stores/solve.ts` and `web/src/app/stores/planSetup.ts`; neither imports Vue or React. Use them as modules (`import * as solve from '../stores/solve'`) and read them with `useSyncExternalStore(solve.subscribe, solve.getSnapshot)`; the snapshot is a new object only on change. No React hook wrapper was added (consumers call `useSyncExternalStore` directly).
- **Solve store**: `start(seconds)` resolves to `{ plan, failure: null }` or `{ plan: null, failure }`, or `null` when a solve was already running or the store was reset meanwhile. It never navigates: ticket 20 opens The Menu on a plan when still on the brief. `cancel()`, `dismiss()`, `reset()` as in Vue. Vue's two navigation tests became outcome assertions; added tests for subscribe/snapshot stability, a failed Cancel crossing into the next solve, and a reset ignoring the answer.
- **Plan-setup store**: `load()` (GET /api/plan; an answer crossing a save is ignored), `change(update, { optimistic = true })` where `update: (plan: Plan) => Plan` runs on the latest saved setup (the previous save's server answer) when its turn comes; the body is `planFields(update(saved))`. Resolves to `{ plan, errors: null }` or `{ plan: null, errors }` (field errors via `fieldErrors`, `{}` for other failures). Shown state = saved setup plus pending optimistic changes, so a failed save drops only its own change. `optimistic: false` is for sheets that stay open with errors (the change shows once saved). `settled()` waits for all queued saves (for "Try again", which saves then solves). Write changes as "set" functions (set this cell skipped), not toggles, since they are re-applied to newer state.
- For the README: both stores added to `resetStores` in `web/src/app/test-app.tsx` (the array became one entry per line).
