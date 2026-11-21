# 33: Editing a recipe's sections and lines

**What to build:** In edit mode the owner adds, names and removes sections and moves a line to another section from a line menu; "Add a line" per section opens a searchable ingredient picker sheet (the same ingredient may be picked for several lines); each line's amount and unit are editable, the unit picked from the ingredient's own unit, the catalogue units that convert to it and the ingredient's conversions (AI-suggested marked); "New unit…" opens the conversion sheet for that ingredient and gives the line the new unit once saved; a line whose unit doesn't convert is marked with the reason; lines can be removed; per-portion totals update live.

Spec: "Implementation Decisions › Modules" (Select for line units); stories 128–134, 137 (line errors: no lines, amount invalid, unknown ingredient, refused conversion).

- Uses the recipe-draft hook from ticket 27, the pure line-units and totals modules, Select (ticket 10) and the conversion sheet (ticket 30).
- The ingredient picker sheet is a reusable component with an optional starting search and an optional extra action slot (ticket 35 adds "+ New ingredient").
- Fills the line-editor place in edit mode (ticket 27).
- Parity checklist: the Vue `RecipeSection`, `LineUnitPicker` and `IngredientPicker` tests and the `RecipePage` line tests.

Blocked by: 27, 30

Status: ready-for-agent

- [ ] App tests: add, name, remove sections; move a line; picker search and picking the same ingredient twice; unit options grouped with AI marker; New unit… creates a conversion and sets it on the line; non-converting reason; remove line; live totals change with amount and unit; each line error on its field
- [ ] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [ ] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#recipe/<id>` → Edit (ingredient lines and the picker sheet); differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
