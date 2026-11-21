# 13: Login page in the D2 look

**What to build:** The owner logs in with the password on a page in D2's look, sees "Wrong password." or "Could not log in" as appropriate, and comes back to the page asked for.

Spec: "Implementation Decisions › Routes" (`/login`, `redirect`); stories 1–3.

- Replaces the `/login` stub (ticket 08) outside the shell: the wordmark as on the masthead, a password field, Log in.
- Wrong password (401) says "Wrong password."; a failed request says it could not log in; success goes to `redirect` or `/`.
- Parity checklist: the Vue `LoginPage` tests.

Blocked by: 08, 10

Status: ready-for-agent

- [ ] App tests ported from the Vue `LoginPage` tests (success, redirect back, wrong password, failure), queried by role and label
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no login screen: compare with D2's cover typography and form fields on `#plan`; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
