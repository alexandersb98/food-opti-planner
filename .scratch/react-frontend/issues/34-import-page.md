# 34: Import a recipe: link or text

**What to build:** An Import page where the owner gives a link or pastes the recipe text (the text kept when switching between the two and after an error), sees "Reading the recipe…" while the AI works, and gets each refusal in words with what to do (no text, too long, no recipe, no recipe on the page, page unreadable, no link, bad link, AI failed, daily limit, no AI key, other). A finished import hands the draft over (imported-draft store, ticket 07) and opens a new spread in edit mode.

Spec: "Implementation Decisions › Routes" (`/recipes/import`, lazy route); stories 141, 142, 143 (hand-over).

- Replaces the lazy `/recipes/import` stub. Segmented control for link/text.
- Until ticket 35 lands, the spread just opens in edit mode with the draft's fields; this ticket's tests check the hand-over and navigation only.
- Parity checklist: the Vue `ImportPage` tests.

Blocked by: 07, 08, 10

Status: ready-for-agent

- [ ] App tests ported from `ImportPage` (text kept across modes and errors, reading state, every refusal message, success puts the draft in the store and goes to `/recipes/new`)
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no import screen: use D2's brief form styling (`#plan` sheets) and kickers; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
