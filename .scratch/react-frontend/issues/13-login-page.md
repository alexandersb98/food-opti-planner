# 13: Login page in the D2 look

**What to build:** The owner logs in with the password on a page in D2's look, sees "Wrong password." or "Could not log in" as appropriate, and comes back to the page asked for.

Spec: "Implementation Decisions › Routes" (`/login`, `redirect`); stories 1–3.

- Replaces the `/login` stub (ticket 08) outside the shell: the wordmark as on the masthead, a password field, Log in.
- Wrong password (401) says "Wrong password."; a failed request says it could not log in; success goes to `redirect` or `/`.
- Parity checklist: the Vue `LoginPage` tests.

Blocked by: 08, 10

Status: done

- [x] App tests ported from the Vue `LoginPage` tests (success, redirect back, wrong password, failure), queried by role and label
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no login screen: compare with D2's cover typography and form fields on `#plan`; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- **Files.** `web/src/app/pages/login/` (`Login.tsx`, `login.css`, `Login.test.tsx`). The route line was already `{ path: '/login', Component: Login }`, so `routes.tsx` is unchanged; only the stub file was replaced.
- **Messages.** New keys in `login`: `login.standfirst` ("Enter the password to open the planner."), `login.enterPassword` ("Enter the password."), `login.busy` ("Logging in…"). Reused `login.title/password/submit/wrong/failed`, `shell.wordmarkArticle/wordmarkName/documentTitle`.
- **Behaviour.** 401 says "Wrong password."; any other status or a failed request says "Could not log in. Try again." Both clear the password and focus it again (the error is the Field's `role="alert"` line, and the input gets `aria-invalid`). Success replaces the history entry with `redirect` if it is an app path (starts with `/`, not `//` or `/\`), else `/`. Deviation from Vue: Log in stays enabled with an empty password (web-design-guidelines: submit stays enabled until the request starts) and then says "Enter the password." without calling the server; during the request it is disabled and reads "Logging in…".
- **Focus.** The password takes focus on open except on a coarse pointer (no keyboard thrown over the page on phones), instead of Vue's unconditional autofocus.
- **Tests** (10): layout and focus, wrong password, server error and unreachable server, back to the asking page with its query and the password sent, no/foreign/absolute redirect goes to the brief, empty password, busy state. The redirect-guard tests were checked to fail with the guard removed.
- **Screenshots** (390 × 844 and 1280 × 800, paper and evening, plus the wrong-password state) compared with D2 `#plan`: the wordmark line matches the masthead (same type; a plain line, not a link, and no Contents); the cover title uses D2's `.cover-title` sizes and the standfirst its `.standfirst` type; the field is D2's ruled `.input.serif`. No kicker above the title: D2's cover kicker is the issue line, which says nothing useful here. Fixed: `display: flex` on the wordmark swallowed the space after "The" (now a block). On desktop the page is the shell's centred column on the desk; the form is capped at 22 rem; on phones Log in is full width.
- **For ticket 42 / README.** The login page repeats the masthead's wordmark type in `login.css` (`.login-wordmark`) rather than importing shell.css; if a `Wordmark` component is ever extracted from `Masthead`, the login page can use it.
