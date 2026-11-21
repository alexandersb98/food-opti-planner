# 25: The recipe index

**What to build:** Recipes are an A-to-Z index under letter headings, each with a small drawn plate, its tags and its per-portion totals. The owner searches by name and narrows with quick tag chips (every tag some recipe has, in tag order; all chosen tags must match). "No recipes yet" and "No recipes match" (with a way to clear the search) explain empty results. An add menu offers "New recipe" and "Import recipe", the import disabled with "Needs an AI key" when the server has none; the index never waits for that check.

Spec: "Implementation Decisions › Performance and React practice" (AI-key check never blocks); "Out of Scope" (no "not this week" marker); stories 109–114.

- Replaces the `/recipes` stub. Plate and Chips from ticket 10; pure lists module for search.
- The add menu is an accessible menu button (or disclosure) in its own component.
- Parity checklist: the Vue `RecipesPage` and `AddMenuButton` tests.

Blocked by: 08, 10

Status: done

- [x] App tests: letter grouping and order; search; tag chips intersect; both empty states and clearing; add menu items and the AI-key-disabled state; the list shows while the AI-key call is still pending
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#recipes`; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

### What was built

- `web/src/app/pages/recipes/`: `RecipeIndex.tsx` (page, the AI-key hook and the index), `AddMenu.tsx` (the add menu), `letters.ts` (filing by letter: first letter without accents, capitals, `#` for a non-letter), `recipe-index.css` (prefix `recipes-`), `RecipeIndex.test.tsx` (15 app tests).
- Search is `searchByName` from `web/src/lists.ts` (by name only, as story 110; D2 also searched tags). Tag chips use the `Chips` primitive; the swatch is `Plate variant="swatch"`.
- The AI-key check (`GET /api/health`) is its own call outside `useLoad`, so the index never waits for it. While it is pending, Import shows disabled with "Checking for an AI key…"; a failed or missing answer counts as no key ("Needs an AI key"). The test with a never-answering health call shows the list.
- The add menu is a disclosure, not an ARIA menu: a block button ("Add recipe", `aria-expanded`, `aria-controls`) at D2's place under the list (D2's "New recipe" button), opening a list of links in place below it. Escape closes it and returns focus; a press or focus outside closes it. A disabled item is a `span aria-disabled="true"`, not a link, with its reason as its hint.
- A visually hidden `role="status"` line says "n recipes shown" while a search or chip narrows the list. Letter headings read e.g. "P, 2 recipes".
- No-match offers "Clear the search" (or "Clear the chosen tags" when only chips are on), clearing both and focusing the search field. The empty index ("No recipes yet.") has no search or chips; the add menu stays.

### Messages

New keys in `recipes.index.*` (after `recipes.intro`): kicker, title (`The recipe {em}` with `titleEm` "index", so the italic word stays a translatable word), standfirst, search, searchPlaceholder, tags, shown, emptyHint, clearSearch, clearTags, newHint, importHint, checkingKey. Reused: `recipes.empty`, `noMatch`, `loadFailed`, `new`, `import`, `needsKey`, `add`, `totalsLine`, `shell.count.recipes`.

### Screenshots and decisions (vs D2 `#recipes`)

- Cover, search line, red italic letter headings with oldstyle counts, 44 px swatches and hairline entries follow D2.
- D2's right-hand minutes column is dropped (recipes have no time); the per-portion totals go on their own italic line under the tags. Each value is kept unbroken (`white-space: nowrap`), so a long line on a phone breaks between values, not inside "Fibre 0.7 g".
- D2's "not this week" marker is out of scope (spec).
- D2 has no tag chips on the index. They use the chips primitive, slightly lighter here (40 px high, 14.5 px; local override `.recipes-chips .chip`) so eight tags don't outweigh the index.
- The search text is set at weight 360 / opsz 24 like the standfirst; at the default it looked bold.
- Letter groups get `content-visibility: auto` for long indexes.
- web-design-guidelines review: placeholder ends with "…"; focus rings show on entries, chips, the add button and its items in both editions; no horizontal scroll at 390.
- Not done: search and chosen tags are not kept in the URL, so coming back from a recipe shows the whole index again. A later ticket could keep them in `?q=` / `?tag=`.

### For the README

- A page's cover must not be a `<header>`: Testing Library counts a `<header>` inside the page's `<article>` as a second `banner`, which breaks the shell test's `getByRole('banner')` (the running-head checks). The cover here is a `<div className="recipes-cover">`.
- `src/app/specimen/Specimen.test.tsx` ("the edition switch…") timed out in two full runs while about a dozen agents shared the machine (the lazy `/specimen` route never rendered: empty body); it passes alone and with the shell and recipe tests. Not touched by this ticket; its 5 s wait may need raising under load.
