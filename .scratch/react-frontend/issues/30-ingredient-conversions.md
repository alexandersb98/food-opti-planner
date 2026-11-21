# 30: Ingredient conversions and the conversion sheet

**What to build:** The ingredient page lists its conversions ("1 dl = 100 g") with add, edit and delete; delete disabled while a recipe uses one; AI-suggested ones marked. The conversion sheet refuses the ingredient's own unit, a duplicate and a bad number, and says only the number can change when a recipe uses the unit.

Spec: "Implementation Decisions › Specific interactions" (conversions are sheets); stories 159, 160.

- The conversion sheet is a reusable component: opened for an ingredient (optionally for a given unit), it reports the saved conversion, so a recipe line can use it ("New unit…", ticket 33).
- Fills the conversions place on the ingredient page (ticket 29) with one line.
- Parity checklist: the Vue `ConversionsCard` and `ConversionDialog` tests.

Blocked by: 29

Status: done

- [x] App tests ported from `ConversionsCard` and `ConversionDialog` (list text, add, edit, delete disabled when used, AI marker, each refusal on its field, number-only edit when used)
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 bottom sheet styling (`#plan` sheets) and D2's list rules; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

**What landed** (all in `web/src/app/pages/ingredient/`)
- `Conversions.tsx`: the list on the ingredient page. API: `<Conversions ingredient={stored} onChange={(conversions) => …} />`. Rows "1 dl = 100 g" (serif, D2's ingredient-line rules: hairline on top, dotted between) with Edit (ink) and Delete (red) text buttons, aria-labels "Edit/Delete the conversion for dl". Under a row, a muted italic note: "Used in 2 recipes" (also the disabled Delete's description) and, for an AI one, "Suggested by AI, not checked by you" in the red pencil (visible text instead of Vue's sparkle tooltip: no hover on a phone). "No conversions yet." when empty; "+ Add conversion" below. Delete asks with `useConfirm` ("Delete the conversion for dl?" / "Nothing else uses it."); a 409 says "Can't be deleted while a recipe uses it.", other failures "Could not delete the conversion."; after a delete focus goes to "+ Add conversion" once the question has slid away.
- `ConversionSheet.tsx`: **the reusable conversion sheet for ticket 33**: `<ConversionSheet open ingredient={{ id, name, unit }} conversion? unit? onSaved={(conversion) => …} onClose />`. `unit` prefills a new conversion's unit (a recipe line's "New unit…"); focus starts in the unit box for a blank new one, else in the number. The caller sets `open` false in `onSaved` and `onClose`. The sheet is drawn with `createPortal` into `document.body` (it is opened from inside the ingredient `<form>` and will be from the recipe spread's form; nested forms are invalid) and its submit stops propagation (React passes portal events up the component tree, which would otherwise submit the ingredient form; a test checks no ingredient PUT is sent).
- Sheet content: a D2 `.sheet-preview` sentence that follows the fields ("1 tsk of Olive oil makes 4.5 g.", "…" for what is still missing), the unit field (volume, mass, other), "How many g one makes" with the own unit after the number, Cancel and Save. Refusals on their fields: empty unit, number not above 0, own unit, duplicate, unit not for an ingredient, too many digits; a failed save in a red line. Focus moves to the first marked field.
- **Number-only when used**: editing a conversion with `recipe_count > 0` disables the unit box and shows "A recipe uses this unit, so only the number can change." as its hint, up front (Vue only said so after a 409). The server's `conversion_in_use` 409 still lands on the unit (a recipe started using it meanwhile).
- `IngredientForm.tsx`: the `const conversions = …` line, plus one import line (`import { Conversions } from './Conversions'`, after the UnitField import; tickets 31/37 may add imports next to it). A save, edit or delete updates `stored` via `setStored`, so the ingredient's delete question lists the conversions as they are now (tested).
- `conversions.css` (prefix `conv-`), `Conversions.test.tsx` (20 app tests: every ConversionsCard and ConversionDialog scenario, plus number-only-when-used, the portal not saving the ingredient, focus after delete, Cancel reopening afresh).
- Messages: one new key `conversions.preview`. Everything else reuses the existing `conversions.*` keys.
- `Ingredient.test.tsx` (ticket 29): its two "new ingredient" save answers were partial ingredients without `conversions`; they now build on `ingredient(...)` from test-data (the page renders the saved ingredient's conversions for a moment before leaving).

**Screenshots** (`/next/ingredients/12`, Olive oil with a used, an AI and a plain conversion; the edit sheet for the AI and the used one; the add sheet with the duplicate refusal; and D2 `#plan`'s Add goal sheet) at 390 × 844 and 1280 × 800, paper and evening. The list sits under "iii Conversions" in the page's section style; the sheet matches D2's sheet (grip, italic title, preview bar with the red rule, ruled fields, Cancel ghost + ink Save). No horizontal scroll at 390. Escape in the unit list closes the list, not the sheet.
- Difference from D2: D2's preview is italic when it is a prompt; ours is always a filled sentence (roman), with "…" in the gaps.
- The unit field's error has no dagger and is not announced (ticket 11's own style), unlike Field's; focus moving to it reads it through `aria-describedby`.

**For the README**
- Ticket 33: use `ConversionSheet` from `pages/ingredient/ConversionSheet.tsx` as above; it portals itself, so it can sit inside the spread's form.
- No new tokens.
