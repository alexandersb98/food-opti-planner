# 28: The Ingredients page

**What to build:** Ingredients are listed alphabetically in the D2 look, each with its basis and values ("per 100 g · Energy 389 kcal · Protein 16.9 g"). The owner searches them ("No ingredients yet", "No ingredients match"), sees ingredients with updated values from their data source marked, can show "Only with updated values (n)" when any have them, and can add a new ingredient from here.

Spec: stories 151–154 ("Add from data source" entry is added by ticket 32).

- Replaces the `/ingredients` stub; an add menu in its own component with "New ingredient" (ticket 32 adds one line for "Add from data source").
- Parity checklist: the Vue `IngredientsPage` tests.

Blocked by: 08, 10

Status: done

- [x] App tests: order and value line; search and both empty states; updated marker and the toggle with its count (hidden when none); New ingredient goes to `/ingredients/new`; load failure and Try again
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#ingredients`; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

### What was built

- `web/src/app/pages/ingredients/Ingredients.tsx` (page, `Larder`, `IngredientEntry`), `AddMenu.tsx`, `ingredients.css` (prefix `ingr-`), `Ingredients.test.tsx` (11 app tests). The route line was already `Ingredients` from this folder, so `routes.tsx` is unchanged.
- Cover as D2: accent italic kicker "16 in the larder" (blank until loaded), italic display title, standfirst from `ingredients.intro`. The cover and the "Add an ingredient" menu render while loading or failed, so the page always has its h1.
- Entries: name (serif 19), "per 100 g · Energy 389 kcal · …" (sans 13.5, muted, lining tabular figures), the "Updated values available" slip in D2's review colours, and "Used in n recipes" in italics in the margin (under the values below 420 px). Each entry is one link to `/ingredients/:id`.
- Search and the "Only with updated values (n)" chip (pressed button, hidden when none) are kept in the address (`?q=…&updated=1`, replaced), so Back from an ingredient finds the list as left. A visually hidden `role="status"` announces the count while narrowed.
- Empty states: "No ingredients yet." with a hint and a New ingredient link; "No ingredients match." (or "No ingredients have updated values." when the filter is on and the search found only others) with D2's "Clear the search", which refocuses the search.

### For ticket 32 (Add from data source)

`AddMenu.tsx` is a disclosure (button with `aria-expanded`, list of ordinary links and buttons), not an ARIA menu. Add one `<li>` with your entry (class `ingr-add-entry` for the look). The list stays mounted while closed (`hidden`), so an entry may own its sheet's state; any click inside the list closes it. Escape and a tap or focus outside close it too.

### Messages (in `ingredients`)

New: `larder` (three plural forms), `searchLabel`, `clearSearch`, `emptyHint`, `add`. Reused: `intro`, `empty`, `noMatch`, `noUpdated`, `loadFailed`, `new`, `perBasis`, `usedIn`, `updatedMarker`, `onlyUpdated`, `count.recipes`, `count.ingredients`, `shell.pages.ingredients.title`.

### Screenshots and decisions (390 × 844 and 1280 × 800, paper and evening, against D2 `#ingredients`)

- D2 lists bare names in two dotted columns. With the basis and values on every entry, two columns at 720 px wrapped each value line to three lines, so the list is one column with D2's strong top rule and dotted entry rules; names keep D2's serif.
- D2 has no add action on this page; the add menu sits in the cover under the standfirst (outlined small button with a drawn caret), with its list as a paper panel ruled in ink.
- The updated mark uses `--review`/`--review-ink` (D2's "needs review" colours), legible in both editions.
- The `.kicker` colour from `base.css` won over a single-class rule; the accent is set with `.ingr-cover > .ingr-kicker`.
- web-design-guidelines: kept D2's placeholder "Search ingredients" without an ellipsis (same as its visually hidden label); added `content-visibility: auto` on entries for a long larder; filter state in the URL.
- No horizontal scroll at 390; focus ring visible on the toggle, entries and chip.

### For the README

- Testing Library treats a `<header>` inside the page's `<article>` as a second `banner`, which breaks the shell tests' `getByRole('banner')`; page covers use a `<div>`.
