# 32: Add from data source

**What to build:** From the Ingredients page, "Add from data source" opens a full-screen sheet: pick a source (the last one remembered), search its foods twenty at a time with "Show more", preview the ingredient (unit, basis, values copied, columns not copied, source tags), change its name and tags, be warned about an existing ingredient from the same food, and add it. Late search answers are dropped and a withdrawn food is explained.

Spec: "Implementation Decisions › Performance and React practice" (lazy: Add from data source is a separately loaded chunk); stories 154 (entry), 165, 166.

- Full-screen Sheet variant (ticket 09); loaded lazily.
- Adds one line to the Ingredients page's add menu (ticket 28).
- Parity checklist: the Vue `AddFromSourceDialog` tests.

Blocked by: 09, 28

Status: done

- [x] App tests ported from `AddFromSourceDialog` (remembered source, paging with Show more, late answer dropped, preview content, name and tag edits, same-food warning, withdrawn food, add sends and lands on the new ingredient or list as today)
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no such screen: use D2's full-screen Contents and sheet styling; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- **Where it lives.** `web/src/app/pages/add-from-source/`: `AddFromSourceEntry.tsx` (the menu entry, in the main bundle), `AddFromSource.tsx` (the sheet, its own lazy chunk, fetched on pointer-enter/focus of the entry and loaded by `React.lazy` on click), `add-from-source.css` (prefix `afs-`), `AddFromSource.test.tsx` (28 app tests through `mountApp('/ingredients')`, porting every `AddFromSourceDialog` scenario). `AddMenu.tsx` gained the one `<li>` (`<AddFromSourceEntry returnFocus={toggle} />`).
- **Portal.** The sheet is rendered on `document.body` with `createPortal`: the menu's list is `hidden` once an entry is chosen, and a modal `dialog` inside a `display: none` ancestor would not show. Closing gives focus back to the menu's toggle (`finalFocus`), since the entry itself is hidden by then.
- **Fresh each opening.** The entry keys the sheet by an opening counter, so reopening starts with no chosen food and an empty search (Vue's "reopening starts afresh").
- **Behaviour as in Vue**, with these choices: the source select sits above the search and is hidden while a food is shown (the food's "From <source>" line, with the source's colour dot, carries it); changing the source keeps the typed search and clears the results; the results stay mounted (hidden) while a food is shown, so Back to results finds the search, the list and its scroll as left, and focus returns to the food's row; choosing a food moves focus to its name (an `h3`). Adding navigates to `/ingredients/:id` (as today); a name in use or an empty name focuses the Name field. The second Add press is ignored (`aria-busy` on the button, not `disabled`).
- **New messages** (in `addFromSource`): `foods` ("3 foods", the polite count under the search), `showing` ("20 of 21 foods" while Show more is offered) and `from` ("From {source}").
- **Fake server.** Its handlers only get the body, so tests that answer by query read the latest call's query from the returned `calls` (`calls.at(-1)`); `test-server.ts` is unchanged.
- **Screenshots** (390 × 844 and 1280 × 800, paper and evening): the list and a food with values, tags and the same-food note. D2 has no such screen: it borrows D2's search line (`.search`), picker list (dotted rules, serif names, sans groups) and the sheet parts (`.sheet-preview` for "Measured in…", `.sheet-actions`); the food's name sits on the double rule of D2's full-screen Contents. Difference from D2's Contents: the sheet head (ticket 09) has no rule under it; left as is. Both editions read well; on a desktop the sheet fills the page column.
- **web-design-guidelines review:** applied: labels on every control, `autocomplete="off"`/`name` on inputs, errors inline and focused, polite count, `tabular-nums` on the values, `text-wrap: balance` on the food's name, `content-visibility` on long result lists, `overscroll-behavior` (from Sheet). Not applied: the placeholder "Search foods" has no ellipsis (it doubles as the label, as on the Ingredients page); no unsaved-changes guard on closing (Vue had none).
