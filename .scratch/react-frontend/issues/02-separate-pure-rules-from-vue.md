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

Status: ready-for-agent

- [ ] None of the moved-to modules imports `vue`, `vue-i18n`, `quasar` or a `.vue` file (checked with a search, noted in the ticket's Comments with the list of neutral modules)
- [ ] Vue page and component tests pass unchanged (no test text edited other than imports)
- [ ] No behaviour change in the Vue app
- [ ] The README's Conventions section lists the new neutral module names if they differ from what it says
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
