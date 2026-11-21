# 27: Editing a recipe: the annotated spread

**What to build:** "Edit" turns the spread into an annotated page where every changeable thing is underlined in red pencil, with Cancel and Save in a bar. The owner edits the name, the servings ("amounts are for the whole recipe"), the portion size (From, To, "any amount" or "in steps" with the step), the Advanced portion settings (never more than, with its default explained, and the over-size penalty), the tags as chips (the ones from ingredients on and marked "auto", by each tag's rule as the server says; others switchable), the instructions as one text field and the source link. Every field error shows on its field. Save stores the recipe and leaves edit mode; Cancel restores the spread; Delete (in edit mode) asks first. "New recipe" opens a blank spread already in edit mode. Leaving an existing recipe mid-edit throws the edits away with a toast.

Spec: "Implementation Decisions › Modules" (Draft rules: React hook over the pure recipe rules), "› Specific interactions" (Recipe spread, Unsaved edits); stories 124–127, 135–140 (errors other than line errors).

- A React recipe-draft hook (`useReducer`) over the pure recipe rules from ticket 02, holding the whole draft including sections and lines (their editing UI is ticket 33); it must also accept an imported draft (ticket 35).
- `/recipes/new` replaces its stub. The editing spread carries `data-no-swipe`.
- Lines are shown read-only in edit mode for now; leave a clear place in the edit mode for the line editor (ticket 33) and for the import banner (ticket 35).
- Parity checklist: the Vue `RecipePage` tests for these fields, save, cancel, delete and new recipe; the recipe draft rule tests.

Blocked by: 09, 26

Status: ready-for-agent

- [ ] App tests: Edit and Cancel restore; each field error of story 137 (name missing or in use, servings, multipliers invalid or below each other, not whole steps, penalty, bad link) on its field; tag chips with auto tags marked and locked; Save sends the fields and leaves edit mode; Delete confirms; New recipe opens in edit mode; leaving mid-edit discards with a toast
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#recipe/<id>` → Edit (the annotated page); differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
