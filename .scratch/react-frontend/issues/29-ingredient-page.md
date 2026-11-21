# 29: The ingredient page

**What to build:** An ingredient has a page in D2's look with its name, the unit it is measured in (unit field: from the catalogue grouped by kind, preferred first, or typed), its value basis following the unit unless changed, a value per attribute (empty meaning 0) and its tags. A new ingredient starts in the preferred mass unit. Errors show on their fields. "Used in n recipes · Show" lists those recipes on request; delete is refused while recipes use it and its confirmation says which conversions go with it.

Spec: stories 155–157, 161, 162 (the unit-change question is ticket 37; conversions ticket 30; the source link ticket 31).

- Replaces the `/ingredients/new` and `/ingredients/:id` stubs. The form is a component that can also run inside a sheet with a given starting name and report the saved ingredient (used by ticket 35's "+ New ingredient").
- Unit field from ticket 11, preferences and unit catalogue from ticket 07, Confirm from ticket 09.
- Leave clear places, one line each, for the conversions section (ticket 30), the source section and updates banner (ticket 31) and the unit-change question call (ticket 37).
- Parity checklist: the Vue `IngredientPage` and `IngredientForm` tests for these stories.

Blocked by: 08, 09, 10, 11

Status: done

- [x] App tests: new ingredient starts in the preferred mass unit; basis follows the unit until changed; empty values sent as 0; each error of story 157 on its field (name missing or in use, unit missing or not for an ingredient, non-mass unit for a linked ingredient, basis, number invalid or too long); used-in list on Show; delete refused while used; confirmation names the conversions
- [x] The form works inside a sheet (one component test or app test through a temporary host is enough)
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#ingredients` (D2 has no ingredient editor: use its list and form styling); differences and decisions noted under `## Comments` (screenshots not committed)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/` (lint and typecheck pass; `npm test` passes except two rows of ticket 08's `Shell.test.tsx`, see Comments)

## Comments

**What landed** (all in `web/src/app/pages/ingredient/`; the route lines already pointed at `Ingredient`, so the route table is untouched)
- `Ingredient.tsx`: the page. Renders `IngredientForm` keyed by id; after a save or delete it toasts ("Saved Oats.", "Deleted Oats.") and goes back to `/ingredients`.
- `IngredientForm.tsx`: the form, usable in a sheet. API: `<IngredientForm id={number | null} initialName? onSaved={(ingredient) => …} onDeleted? inSheet? />`. It loads attributes, tags and the ingredient through `loadAll` in parallel with `preferencesStore.load()` (a new ingredient starts in the preferred mass unit, grams if the preferences fail). `inSheet` drops the page heading, back link and sticky bar, puts Save (primary, full width) in `.sheet-actions` at the foot, and leaves out the conversions note. The page sets the running head to the ingredient's name.
- `ingredient.css` (prefix `ingredient-`), `Ingredient.test.tsx` (28 app tests), `IngredientForm.test.tsx` (3 component tests of the form inside `Sheet`).
- Messages: `ingredients.page.{back, values, saved, deleted, usedInList}` (nested inside `ingredients`, after `edit`). Reused existing keys for everything else.

**Places left for later tickets** (search `Ticket 3` in `IngredientForm.tsx`)
- Ticket 30 (conversions): the `const conversions = …` line. Today it is null for a saved ingredient (no section drawn) and "Save the ingredient to add conversions." for a new one on the page. Replace the null with the conversions component; the section head "iii Conversions" is drawn around whatever the line gives. Call `setStored` with the changed conversions so the delete question counts them.
- Ticket 31 (source link and banner): two comment lines, under the name and before section i. `stored` / `setStored` hold the ingredient as the server last sent it; a linked one (`stored.source`) already limits the unit field to mass units. The banner's Accept must also update `draft.values` (via `setDraft`).
- Ticket 37 (unit-change question): in `save`, the line `const answer: UnitChangeAnswer = { go: true }` runs only when a saved ingredient's unit changed; replace it with the preview + question. `{ go: false, unitError }` shows the refusal under the unit, `{ go: false, saveError }` a failed preview in the bar. Until then a unit change saves straight away (the server still refuses what it must, shown under the unit).

**Design decisions** (D2 has no ingredient page; built from the recipe spread and its form fields)
- Sticky bar like D2's `.spread-bar`: "Back to Ingredients" and an accent Save. A failed save shows inside the bar so it is seen wherever the page is scrolled. On a failed check focus moves to the first marked field (fields keep clear of masthead + bar with `scroll-margin-top`).
- Head: kicker-sized italic h1 ("Edit ingredient" / "New ingredient") over the name written large (serif, 34/44px, label visually hidden, placeholder "Name"). Under it a measure strip like D2's `.spread-meta`: "Measured in" (ticket 11's `UnitField`) and "Values per [100] g" side by side on desktop, stacked on the phone.
- Numbered sections as in the spread: i Values (D2's `.nutri` table with a strong top rule; numbers right-aligned, tabular, on a dashed write-in line, unit muted beside), ii Tags (the shared `TagPicker`: the chosen tags as chips, the others behind "Add a tag" with a find box, so a long catalogue does not lengthen the page), iii Conversions (new only, for now).
- Foot behind a double rule: "Used in 2 recipes · Show"; Show loads the recipes (sorted) as a ruled list of links to their spreads. Delete is an outlined small button, disabled with "Recipes use it, so it can't be deleted." as its description. The delete question lists the conversions that go ("This also removes its 2 conversions." then "1 dl = 60 g", "1 msk = 8 g"), not only their count as Vue did.
- No unsaved-changes warning on leaving (Vue had none either).
- Errors use Field's dagger line (`role="alert"`); the unit field's error is its own (ticket 11, no dagger, not announced), read through `aria-describedby` when focus moves there.

**Screenshots** (390×844 and 1280×800, paper and evening; existing, new, check errors, Show list, delete question, unit list open, and the form inside a sheet through a temporary specimen section that was removed again) compared with `d2:ingredients` and `d2:recipe/r9`. Type, rules and colours match D2 in both editions; no horizontal scroll at 390.
- Ticket 11's note (unit list hangs below the box with no portal): inside a sheet the field sits near the top, so the list overlays the values below it and stays inside the panel at both sizes. No change needed here; a unit field low in a short sheet could still extend the sheet's scroll.
- The middle dot in "Used in … · Show" first was CSS generated content, which made Show's accessible name "· Show"; now an `aria-hidden` span.
- `<header>`/`<footer>` inside the form were read as banner/contentinfo landmarks by jsdom; plain divs instead.

**For the README / later tickets**
- Ticket 35 can host the form as `<Sheet title={t('ingredients.new')}><IngredientForm id={null} initialName={food} inSheet onSaved={…} /></Sheet>`.
- No new tokens. The bar's 52px height is a literal (D2 `.spread-bar`); ticket 26's spread bar could share it with a `--bar` token in ticket 42.

**Needs the lead: two stale rows in ticket 08's shell test.** `web/src/app/shell/Shell.test.tsx`, the `test.each` "shows its page under the running head" table, expects the stub heading "An ingredient" on `/ingredients/new` and `/ingredients/7`. With the real page those rows fail (the page's h1 is "New ingredient" / "Edit ingredient", and the shell test's fake server has no attributes or tags, so the page shows its load failure). I did not edit another ticket's test file; the fix is to delete those two rows. Their checks (folio 5, running head "Ingredients", and the ingredient's name for `/ingredients/7`) are covered in `Ingredient.test.tsx` ("the running head names the ingredient, on the Ingredients folio"). Other page tickets replacing stubs will hit the same table.
