# 38: The Tags page

**What to build:** Tags are listed in the D2 look, hand-made first and source tags after, each with its rule ("when all/any ingredients have it") and where it comes from. A tag opens in place to edit its name and rule, saved on close. Source tags show in their source's colour without a name field or Delete, with a note that they can't be renamed or deleted. Tags are made equivalent by adding them to a group, the picker saying which tags a candidate is already equivalent to; the server's questions about groups (move a tag here, switch its rule, change the whole group's rule) are asked one at a time with their answers. Delete says what else is removed (from ingredients, recipes and plan filters) and that the tag leaves its group. "+ New tag" and name errors (missing or in use).

Spec: "Implementation Decisions › Routes" (lazy route), "› Specific interactions" (one open row, saved when it closes; tag-group questions are sheets); stories 173–179.

- Replaces the lazy `/tags` stub; Sheet and Confirm (ticket 09).
- Parity checklist: the Vue `TagsPage` and `TagGroupQuestions` tests.

Blocked by: 08, 09, 10

Status: ready-for-agent

- [ ] App tests ported from those files (order, rule text, edit and save on close, source tag restrictions, group picker equivalence text, each group question and answer in turn, delete consequences, new tag and errors)
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no Tags page: use D2's list, rule tags and the annotated editing style; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
