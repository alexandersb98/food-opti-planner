# 01: React app side by side, with its app test harness

**What to build:** A developer runs `npm run dev` in `web/` and gets both apps: the Vue app as today, and a new React 19 + TypeScript app under its own HTML entry and base path (`/next/`, see the README's Conventions), showing a placeholder page. `npm test` can render the React app at a URL with the fake server and drive it by roles and labels. This is the toolchain every other ticket builds on.

Spec: "Implementation Decisions › Stack" and "› Migration: side by side, swapped at the end"; "Testing Decisions › Seams" (seam 1); stories 198, 201.

- React 19, React DOM, React Router 7 (data mode: a browser router built from a route tree; a memory router in tests), the Vite React plugin beside the Vue plugin, React Testing Library and user-event, React type packages, the React hooks ESLint rules (and the React rules the react-best-practices skill relies on) for the React folder only.
- TypeScript: `.tsx` included in typecheck (still `vue-tsc --noEmit` until the swap; the JSX setting must not disturb the Vue SFCs).
- Its own source folder and HTML entry; the dev server serves the React entry for every path under the base path (an SPA fallback), and Vue for everything else. The production build still serves the Vue app at `/` (the React entry may be built alongside as long as what the server serves at `/` is unchanged).
- A route tree module with one placeholder route, so later tickets have one place to register routes (ticket 08 replaces the placeholder with the full table).
- The app test harness: a React `mountApp(path)` that renders the React app with a memory router at `path` (with the base path handled), returning the user-event instance; a `resetStores` list it calls before every mount (empty now; later tickets add one line per store). The existing `fakeServer` and `unitRoutes` are moved into a framework-free test module and re-exported from the Vue harness so Vue tests are untouched.
- An ESLint rule that stops the React folder importing `vue`, `vue-i18n`, `quasar` or `.vue` files.

Blocked by: None (can start immediately)

Status: done

- [x] `npm run dev` serves the Vue app at `/` and the React placeholder under `/next/` (including deep paths such as `/next/recipes/3`)
- [x] A React app test renders the placeholder through `mountApp` with a fake server and finds it by role; a second test shows the harness records server calls
- [x] The Vue app, its tests and the e2e flow (e2e not run: production build unchanged) are unchanged and pass
- [x] Lint fails if a file in the React folder imports from Vue/Quasar (checked once by hand, not left failing)
- [x] The README's Conventions section is updated if the folder names or base path chosen differ from the defaults written there
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- React HTML entry is `web/next/index.html`, dev-only; ticket 42 adds it to the production build.
- Base path lives in `web/src/app/base.ts` and `reactBase` in `web/vite.config.ts`.
- Harness: `web/src/app/test-app.tsx`; `mountApp` is async and returns `{ user, router, ...render result }`.
- Placeholder copy is hard-coded English until ticket 04 (translator).
- Locked versions: react/react-dom 19.3.1, react-router 7.18.6, @vitejs/plugin-react 6.3.0, eslint-plugin-react-hooks 7.1.1.
