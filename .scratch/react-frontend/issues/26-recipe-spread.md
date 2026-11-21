# 26: The recipe spread (viewing a recipe)

**What to build:** A recipe opens as a cookbook spread: a drawn colour plate in the recipe's colour, the plate number (the recipe id), a kicker, the name as a large title, the servings and portion range, the ingredients per section (amount, unit, name; section names only when there is more than one section or it has a name), lines whose unit doesn't convert or whose ingredient no longer exists flagged, the instructions as a numbered method (one step per paragraph), the tags with the ones from ingredients marked, a per-portion nutrition table, the source as a readable link (http/https only, new tab), and "Back to the index". The running head shows the recipe's name.

Spec: "Implementation Decisions › Specific interactions" (Recipe spread: method split on blank lines, or line breaks when none; no minutes); stories 115–123.

- Replaces the `/recipes/:id` stub with the view mode of the spread page; leave an "Edit" entry point and a clear place for edit mode (ticket 27).
- Totals from the pure totals module.
- Parity checklist: the view-related parts of the Vue `RecipePage` tests (lines, flags, totals, tags, source link).

Blocked by: 08, 10

Status: done

- [x] App tests: header (plate number, name, kicker, servings, portion range); section names rule; flagged lines; method steps for blank-line and line-break text; tags from ingredients marked; nutrition table; source link only for http(s) with `target` and `rel`; back link; running head shows the name
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#recipe/<id>` (view mode); differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

**Where things are** (`web/src/app/pages/recipe/`): `RecipeSpread.tsx` (route host: `/recipes/new` goes straight to the editor; `/recipes/:id` loads recipe, attributes, tags and ingredients in parallel through `useLoad`, sets the running head, draws the plate, figcaption and the sticky bar, and switches between view and edit mode with `editing` state), `SpreadView.tsx` (view mode: head, ingredients, method, notes), `SpreadIngredients.tsx` (read-only lines, memoised, meant to be reused read-only by the edit mode), `SpreadEditor.tsx` (edit mode: a stub for ticket 27), `spread.ts` (pure rules: `spreadSections`, `spreadTotals`, `spreadTags`, `methodSteps`, `sourceLink`, `plateNumeral`, `portionText`), `spread.css` (prefix `spread-`), `RecipeSpread.test.tsx` (20 app tests). The route table is unchanged: its lines already pointed at `RecipeSpread`.

**Places left for later tickets.**
- Ticket 27: `SpreadEditor.tsx` replaces its stub (it takes `data`, null for a new recipe). The bar's edit-mode branch in `RecipeSpread.tsx` (marked "Ticket 27") gets the annotating hint and Save beside Cancel; Cancel already returns to the spread and puts the focus back on Edit. The edit mode can show `SpreadIngredients` read-only.
- Ticket 33: the line editor takes the place of `SpreadIngredients` in the edit mode.
- Ticket 35: the import banner goes above the head in the edit mode (noted in `SpreadEditor.tsx`).

**Decisions.**
- Totals: computed with `portionTotals` and `lineFactor` once the unit catalogue is known. Until then, or if it fails to load, the spread shows the server's `totals` and flags no unit (the server decides, as in Vue). Lines whose ingredient is gone count 0.
- Flags: a line whose ingredient no longer exists shows its original text (else "Unknown ingredient") and "It no longer exists, so it is left out of the totals."; a unit that doesn't convert says "dl doesn’t convert to g, so this line is left out of the totals.", in red-pencil italics with D2's dagger (CSS only). The server refuses unconvertible units on save, so in practice flags appear only after the catalogue or a conversion changes; they are covered by the tests, not the screenshots.
- Plate number: roman (Plate IX) as in D2, up to 3999, printed `aria-hidden`, with "Plate 9" for screen readers. Kicker: "Recipe 9, filed under <first tag in tag order>", or "Recipe 9".
- No minutes (spec). D2's figcaption "35 minutes, serves 4" became the ingredient count ("6 ingredients"); the meta row has Serves and Portions ("½–2", with "in steps of ½" when the recipe has a step; quarters, halves and three-quarters printed as fractions).
- Method: split on blank lines, else on line breaks; a paragraph keeps its inner line breaks (`white-space: pre-line`). No instructions means no Method section, and the Notes become ii.
- Tags: all the recipe's tags (added and derived) in tag order, D2's slash-separated line, then "From the ingredients: …". No tags means no Tags block. No attributes shows `ingredients.noAttributes` instead of the table.
- Source: only http(s) links, shown without scheme, "www." or trailing slash, `target="_blank"` and `rel="noopener noreferrer"`, with a visually hidden "(opens in a new tab)".
- "Back to the index" is in the sticky bar as in D2 (`buttonClass({ variant: 'text-plain' })`, underlined at rest like D2's `.text-btn.plain`, a local rule since the primitive underlines only on hover). The Edit button's name is "Edit <recipe>". D2's bottom turn links and folio are ticket 12's.
- `Shell.test.tsx`: removed the `/recipes/12` row of the stub table (it expected the stub page); the spread's own test checks the running head (name, folio 3).
- Messages: new namespace `recipe` directly after `recipes` in `en.json`; reused `recipes.loadOneFailed`, `recipes.sectionN`, `common.cancel`, `ingredients.noAttributes`.

**Screenshots** (`/next/recipes/3` with sample data and a source link added, against D2 `#recipe/r9`; 390 × 844 and 1280 × 800, paper and evening, full page and with keyboard focus on Edit): the plate, caption, bar, head, numbered sections, ingredient grid, method numerals, tag line, nutrition table and source match D2 in type, spacing and rules in both editions; no sideways scroll at 390; the red-pencil focus ring shows on Edit; the sticky bar sits under the masthead. Fixed after the first pass: the back link was serif italic; it is now D2's underlined sans.

**Web interface review** (web-design-guidelines): added `text-wrap: balance` and long-word breaking to the title, `scroll-margin-top` for focus under the sticky bar, and the new-tab hint on the source link.

**For the README.** Ticket 27 fills `pages/recipe/SpreadEditor.tsx` and the bar's edit branch in `RecipeSpread.tsx`; 33 and 35 fill the places noted in `SpreadEditor.tsx`. Ticket 42: `spread.css` has a local `.text-btn` underline for the back link; fold into the button primitive if D2's always-underlined text button is wanted everywhere.
