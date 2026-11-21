# 35: Reviewing an imported recipe

**What to build:** A finished import opens as a new spread in edit mode under review: a banner says where it came from (pasted text or the site's name), how many lines need the owner, and that the end was left out when the text was long. Each imported line shows its original text and what it needs: pick an ingredient (search starting from the line's food, with "+ New ingredient" opening the ingredient form in a sheet with the food as the name and matching the line once saved), give a factor ("1 dl = [100] g", the AI's suggestion to accept or change), pick another unit, or skip; skipped lines are greyed with "Add anyway" or "Add back". Save is blocked with "Match, convert or skip every line to save" until each line is settled; accepted factors are saved as conversions with the recipe (AI-suggested until edited). Leaving an unsaved import asks "Discard this recipe?" with "Keep editing" and "Discard".

Spec: "Implementation Decisions › Stack" (router blocker), "› Specific interactions" (Unsaved edits); stories 143–150.

- Takes the draft from the imported-draft store (ticket 07) into the recipe-draft hook (ticket 27); the pure import-review rules.
- Reuses the ingredient picker (ticket 33) and the ingredient form in a sheet (ticket 29, already done since 33 needs it through 30).
- React Router's blocker with a Confirm sheet for leaving.
- Fills the import-banner place in edit mode (ticket 27).
- Parity checklist: the Vue `ImportLineReview` and `NewIngredientDialog` tests and the `RecipePage` import tests.

Blocked by: 33, 34

Status: ready-for-agent

- [ ] App tests ported from those files (banner variants, each line state, search starts from the food, new ingredient matched, factor accept and change, skip and add back/anyway, Save blocked message, conversions sent with the recipe, leave asks and both answers work)
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#recipe/<id>` → Edit, with the review banner and line states in D2's "review" colours; differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
