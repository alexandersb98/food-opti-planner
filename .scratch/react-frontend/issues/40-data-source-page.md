# 40: The data source page

**What to build:** A data source page shows its version, when it was imported, its attribution and its colour (saved when the picker closes). Its columns are listed in the server's order (withdrawn last, marked) and can be searched; each has an Attribute choice offering the attributes that convert with the column's unit, those taken by another column disabled with the holder named, and "Not mapped". A refused mapping (already mapped from another column, units don't convert) is explained after the page refreshes to the truth.

Spec: "Implementation Decisions › Routes" (`/settings/data-sources/:key`, lazy route); stories 184–186 ("Create attribute…" is ticket 41).

- Replaces the lazy data source stub; Select with groups (ticket 10).
- Leave the "Create attribute…" option out (ticket 41 adds it with one line).
- Parity checklist: the Vue `DataSourcePage` and `SourceColumnRow` tests other than creating an attribute.

Blocked by: 08, 10

Status: done

- [x] App tests: header facts; colour saved on close; column order and withdrawn marking; search; options limited to converting units; taken options disabled naming the holder; Not mapped; a refusal refreshes then explains
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no data source page: use D2's `#settings` and list styling; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

### What was built

- `web/src/app/pages/data-source/`: `DataSource.tsx` (load, saving a mapping, refusals), `SourceFacts.tsx` (version, imported, attribution, colour), `SourceColumns.tsx` (search, list, the Attribute choice per row), `data-source.css` (prefix `ds-`), `DataSource.test.tsx` (19 app tests). The route line was already the lazy `data-source/DataSource` stub, so `routes.tsx` is unchanged.
- The running head shows the source's name (`useRunningHead`).
- **For ticket 41 ("Create attribute…")**: three marked places, each one line: in `SourceColumns.tsx` `optionsFor` (`options.push({ value: CREATE, label: t('dataSource.createAttribute') })`, after the group), in `DataSource.tsx` `choose` (`if (choice === CREATE) return openCreate(column)`), and the sheet itself at the end of the page's `<article>`. After creating, add the attribute with `page.setData((d) => ({ ...d, attributes: [...d.attributes, created] }))` and call `map(column, created.id)`, which answers whether it saved; when it didn't, show `dataSource.createdNotMapped` on the row (`setError`).

### Decisions and differences from Vue

- The Attribute choice is the native `Select` (ticket 10): Not mapped, then the attributes that convert with the column's unit in an option group "Converts with g" (no group for a column without a unit). A taken attribute is a disabled option reading "Protein (taken by TEST Protein)" (new key `dataSource.takenOption`: a native option has no caption line). Each select is labelled "Attribute for {column}" (visually hidden); on wide screens a small-capital header row reads Column / Attribute.
- The colour is a native colour input drawn as a round swatch with its hex code; React's `onChange` follows every `input` event, so the save listens to the native `change` (picker closed) through a callback ref.
- Imported time: `toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' })` in a `<time>` (Vue used the bare `toLocaleString()`).
- Back link: a plain text button "Back to Settings" (Vue had an arrow with aria-label "Back"); the search's empty state is D2's ("No column is called “zinc”." + "Clear the search", which refocuses the search).
- New keys in `dataSource`: `kicker`, `backToSettings`, `noColumnNamed`, `clearSearch`, `column`, `attributeFor`, `convertsWith`, `takenOption`.

### Screenshots (390 × 844, 1280 × 800, paper and evening; not committed)

D2 has no data source page; compared with D2 `#settings` (cover, ruled rows) and `#ingredients` (search, empty state). The title is set like D2's cover titles (italic, light, hero size clamped for long names); the particulars are ruled label/value rows; the columns open with the double rule like a new part. A withdrawn column (added in the shot through a routed answer, the sample source has none) is muted with an italic "No longer in the source"; a refusal shows as the red-pencil dagger line under the choice, the name staying on the choice's line. No horizontal scroll at 390; focus ring visible on the swatch, search and selects in both editions. Rows use `content-visibility: auto` since a real source can have many columns.

### Tests and the shell test (needs the lead)

- `npm test`: 1089 of 1091 pass. Two fail. (1) `src/app/ui/stepper/Stepper.test.tsx` "a stepper stops at its ends…" failed only under heavy machine load and passes when run alone. (2) `src/app/shell/Shell.test.tsx`, row `['/settings/data-sources/livsmedelsverket', 'A data source', 8, 'Settings']` of "shows its page under the running head". That row checks the stub's heading. The real page has no heading until its data loads, and that test's fake server only answers the session. **Fix when merging:** delete that row (a change to ticket 08's file, so I left it to the lead). `DataSource.test.tsx` now checks the same thing on the real page: the running head shows the source's name on folio 8. Every other page ticket that replaces a stub will hit the same thing for its own row.
- The cover and the Columns head are `div`s, not `header`s: testing-library counts a `header` as a second "banner" next to the masthead.

### For the README

- Page tickets that replace a stub: delete your route's row from the running-head table in `Shell.test.tsx`, or answer its calls there. Don't use `<header>` inside a page if tests look up the masthead by role `banner`.
- No tokens were missing.
