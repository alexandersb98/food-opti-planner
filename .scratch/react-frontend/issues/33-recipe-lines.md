# 33: Editing a recipe's sections and lines

**What to build:** In edit mode the owner adds, names and removes sections and moves a line to another section from a line menu; "Add a line" per section opens a searchable ingredient picker sheet (the same ingredient may be picked for several lines); each line's amount and unit are editable, the unit picked from the ingredient's own unit, the catalogue units that convert to it and the ingredient's conversions (AI-suggested marked); "New unit…" opens the conversion sheet for that ingredient and gives the line the new unit once saved; a line whose unit doesn't convert is marked with the reason; lines can be removed; per-portion totals update live.

Spec: "Implementation Decisions › Modules" (Select for line units); stories 128–134, 137 (line errors: no lines, amount invalid, unknown ingredient, refused conversion).

- Uses the recipe-draft hook from ticket 27, the pure line-units and totals modules, Select (ticket 10) and the conversion sheet (ticket 30).
- The ingredient picker sheet is a reusable component with an optional starting search and an optional extra action slot (ticket 35 adds "+ New ingredient").
- Fills the line-editor place in edit mode (ticket 27).
- Parity checklist: the Vue `RecipeSection`, `LineUnitPicker` and `IngredientPicker` tests and the `RecipePage` line tests.

Blocked by: 27, 30

Status: done

- [x] App tests: add, name, remove sections; move a line; picker search and picking the same ingredient twice; unit options grouped with AI marker; New unit… creates a conversion and sets it on the line; non-converting reason; remove line; live totals change with amount and unit; each line error on its field
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#recipe/<id>` → Edit (ingredient lines and the picker sheet); differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

**What landed.** `pages/recipe/LineEditor.tsx` replaces the read-only lines in `SpreadEditor.tsx` (edit mode, stored and new recipes); `SpreadIngredients` stays for view mode. Pure section/line changes live in `pages/recipe/lineEdits.ts` (by line/section key, run through the hook's `edit`). `useRecipeDraft` gained `edit(change, clears?)`, which also clears the line/section errors the change answers (`amounts`, `unitErrors`, `sectionNames`, `lineIngredients` by key, `items` for "no lines"); line errors otherwise stay until the next save. Tests: `pages/recipe/RecipeLines.test.tsx` (17 tests); the read-only assertion in `RecipeEditing.test.tsx` now checks the amount boxes.

**Reusable picker (for ticket 35).** `pages/recipe/IngredientPicker.tsx`: `<IngredientPicker open onClose title ingredients onPick initialSearch? extra? finalFocus? />`, drawn through a portal, a fresh search (from `initialSearch`) on each open, Enter picks a single match, `extra` is the slot under the list for "+ New ingredient". Styles in `ingredient-picker.css` (`picker-` prefix; the line menu sheet uses `.picker-list`/`.picker-row` too).

**New unit…** opens `ConversionSheet` (ticket 30) for the line's ingredient, pre-filled with the line's unit when that unit doesn't convert. On save the line gets the new unit, the totals count it and the page keeps the ingredient's new conversion: `SpreadEditor` has a new required prop `onIngredientChanged(ingredient)`, which both `StoredRecipe` and `NewRecipe` in `RecipeSpread.tsx` handle with `setData` (otherwise the view after saving would flag the line). Focus returns to the unit list.

**Decisions and differences from D2.**
- Unit list: the `Select` primitive (native, grouped: "Ingredient's unit", "Other units", "Conversions" with "dl = 40 g" and "✨ suggested by AI", then "New unit…"). Native options can't show a short value in the box and a long one in the list, so the box draws just the unit over a transparent select (`.lines-unit-shown`). A unit the list doesn't offer is added as "dl (doesn’t convert)".
- A line whose unit doesn't convert shows D2's dagger note ("dl doesn’t convert to g, so this line is left out of the totals.") at once and is `aria-invalid`; after Save it becomes the field error `recipes.unitNotConvertible`. D2's inline "1 pcs = [120] g" editor and "Fix" review rows are not built: conversions are added through "New unit…" (the review rows are ticket 35).
- Sections: D2 shows headings read-only; here a heading is an underlined small-caps input (no wash) once there are several sections or a name. "Remove this section" moves its lines up (as Vue). "Add a section" at the end; adding the second section focuses the first heading.
- Line menu: D2 has none. With several sections each line has a "⋯" button (`Line menu for {name}`) opening a small sheet "Move {name}" with "Move to …" rows; this narrows the name column on a phone (names wrap to two lines at 390 px). Folding × into that menu would widen it, but D2 keeps × on the line, so I kept both.
- × removes at once with a toast "Removed {name}." (as D2; no undo). Focus goes to the section's "Add a line".
- After picking, the focus goes to the new line's amount and it is scrolled into view (D2).

**Screenshots** (`edit-*`, `picker-*`, `errors-*`, `newunit-*`, `menu-*`, `newrecipe-*` vs `d2-edit-*`, `d2-picker-*`): rows, annotations and the picker sheet match D2 at both sizes and in both editions; the section heading was first drawn with the annotation wash and ink colour (spread.css won on specificity), now accent small caps on the dashed line. A new recipe was saved end to end in the browser (pick, amount, New unit…, Save → stored spread with totals).

**For ticket 42:** the `.lines-text-btn` (D2 `.text-btn`), `.lines-icon` (D2 `.icon-btn`) and `.picker-*` styles are page-local copies to fold into shared styles. **For ticket 35:** the review wrapper of a line can go around `LineRow` in `LineEditor.tsx`; an unmatched line (`ingredientId === null`) already renders its `food` with no unit list and shows `lineIngredients` errors.
