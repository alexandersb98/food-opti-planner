# 27: Editing a recipe: the annotated spread

**What to build:** "Edit" turns the spread into an annotated page where every changeable thing is underlined in red pencil, with Cancel and Save in a bar. The owner edits the name, the servings ("amounts are for the whole recipe"), the portion size (From, To, "any amount" or "in steps" with the step), the Advanced portion settings (never more than, with its default explained, and the over-size penalty), the tags as chips (the ones from ingredients on and marked "auto", by each tag's rule as the server says; others switchable), the instructions as one text field and the source link. Every field error shows on its field. Save stores the recipe and leaves edit mode; Cancel restores the spread; Delete (in edit mode) asks first. "New recipe" opens a blank spread already in edit mode. Leaving an existing recipe mid-edit throws the edits away with a toast.

Spec: "Implementation Decisions › Modules" (Draft rules: React hook over the pure recipe rules), "› Specific interactions" (Recipe spread, Unsaved edits); stories 124–127, 135–140 (errors other than line errors).

- A React recipe-draft hook (`useReducer`) over the pure recipe rules from ticket 02, holding the whole draft including sections and lines (their editing UI is ticket 33); it must also accept an imported draft (ticket 35).
- `/recipes/new` replaces its stub. The editing spread carries `data-no-swipe`.
- Lines are shown read-only in edit mode for now; leave a clear place in the edit mode for the line editor (ticket 33) and for the import banner (ticket 35).
- Parity checklist: the Vue `RecipePage` tests for these fields, save, cancel, delete and new recipe; the recipe draft rule tests.

Blocked by: 09, 26

Status: done

- [x] App tests: Edit and Cancel restore; each field error of story 137 (name missing or in use, servings, multipliers invalid or below each other, not whole steps, penalty, bad link) on its field; tag chips with auto tags marked and locked; Save sends the fields and leaves edit mode; Delete confirms; New recipe opens in edit mode; leaving mid-edit discards with a toast
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#recipe/<id>` → Edit (the annotated page); differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

**Where things are** (`web/src/app/pages/recipe/`): `useRecipeDraft.ts` (the React draft hook: `useReducer` over `src/recipeDraft.ts`, actions `set` (text fields), `inSteps`, `toggleTag` and a generic `edit` (a pure `draft => draft` function, for ticket 33's sections and lines and ticket 35's review); starts from the stored recipe, an `imported` recipe (`draftOfImport`) or blank; asks `POST /api/recipes/derived-tags` whenever the set of kept ingredients differs from the stored one, the latest answer winning; `save(tags, converts)` and `remove()`), `SpreadEditor.tsx` (the annotated page, a `<form id="spread-editor" data-no-swipe>`), `RecipeSpread.tsx` (`EditBar` with the hint, Cancel and Save, which submits the form through `form="spread-editor"`; `StoredRecipe` and the new `NewRecipe`), `spread.css` (edit-mode rules at the end), `RecipeEditing.test.tsx` (15 app tests).

**Places left.** Ticket 33: the read-only `SpreadIngredients` in `SpreadEditor.tsx` (marked) is where the line editor goes; line errors (`amounts`, `unitErrors`, `sectionNames`, `lineIngredients`) are already in the hook's `errors`, and `dispatch({ type: 'edit', change })` changes lines. Ticket 35: the banner goes at the marked line above the head in `SpreadEditor.tsx`; `NewRecipe` has a marked line where `useImportedDraft()` is passed as `imported` (the hook already starts from it).

**Decisions.**
- Save on an existing recipe stores, updates the spread with the server's answer, leaves edit mode (focus back on Edit) and toasts "Saved <name>."; on a new recipe it opens `/recipes/<id>` (replace) in view mode. While saving the bar's Save reads "Saving…" and is disabled.
- Cancel restores the spread without a toast (D2 toasts "Changes thrown away."; an explicit Cancel needs no confirmation). Leaving an existing recipe mid-edit toasts "Left without saving; the recipe is as it was." (D2); a new recipe's Cancel goes to the index and leaving it says nothing (as Vue).
- Delete: "Delete this recipe" (text button) at the foot of the edit mode, then the Confirm sheet "Delete <name>?"; on success the index and "Deleted <name>."; a failure is said next to the button.
- Servings is an annotated number field, not D2's stepper, so its errors (typed or the server's) can show on it; it sits in D2's row (label left, number right) with "Amounts are for the whole recipe." below.
- Portion size: Any amount / In steps (Segmented), then From, To and "In steps of" (only in steps), each with "×" and its own error. Advanced (Disclosure) holds Never more than (placeholder and hint give 3 × To) and Over-size penalty; it starts open when they hold something other than the defaults, and opens on an error in them.
- Errors stay on their field until the next save, except that changing a field clears its own error; after a check marks fields, focus goes to the first marked one.
- The method is one textarea (spec), not D2's step-per-box editor, with the hint "One step per paragraph: leave a blank line between steps."
- Focus on entering edit mode: the name (D2) with a fine pointer; on touch screens the (visually hidden) h1 "Editing <name>" / "New recipe", so no keyboard pops up.
- A new recipe shows a blank plate (a dashed pencil rim on hatched paper) and "Plate not yet numbered"; its kicker is "A new recipe" and running head "New recipe".
- The live per-portion table also shows in edit mode (it follows the servings as typed).
- `Shell.test.tsx`: removed the `/recipes/new` stub row; the running head is covered in `RecipeEditing.test.tsx`. The edit test in `RecipeSpread.test.tsx` now checks the h1 instead of a missing Ingredients region.
- A new recipe cannot be saved yet: it has no way to add lines until ticket 33 (Save says "Add at least one ingredient.").

**Screenshots** (`/next/recipes/3` → Edit, with an error pass; `/next/recipes/new`; against D2 `#recipe/r9` → Edit; 390 × 844 and 1280 × 800, paper and evening): the red-pencil annotations, the tinted bar with Cancel and Save, the head rules, chips with "auto", the nutrition table and the source field match D2 in both editions; no sideways scroll at 390. Changed after the first pass: Serves moved into D2's row; the empty name got a placeholder ("The dish’s name…"). Differences kept: no line editor yet (33), the method as one text field (spec), Serves as a field not a stepper.

**Web interface review**: `autoComplete="off"`, `inputMode` and `type="url"` with `spellCheck={false}` on the fields, placeholders ending in "…", focus on the first error, Save disabled only while saving, "Saving…", no autofocus on touch screens. Not done: a `beforeunload` warning (the spec chose D2's toast for existing recipes).

**For the README.** Ticket 33 and 35 places as above. New messages in `recipe` (`editing`, `annotating`, `annotatingNew`, `kickerNew`, `namePlaceholder`, `unnumbered`, `stepOf`, `portionMode`, `methodHint`, `noLines`, `auto`, `tagsHint`, `delete`, `deleteMessage`, `saved`, `saving`, `deleted`, `leftUnsaved`). Ticket 42: `spread.css` has its own `.spread-annot` (D2's `.annot`, like `tags-annot` and `attributes-annot`), a candidate for `base.css`.
