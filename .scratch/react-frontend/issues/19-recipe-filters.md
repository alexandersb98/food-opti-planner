# 19: Recipe filters: rule tags, usable count and the filters sheet

**What to build:** Section 3 of the brief ("Recipe filters") shows each filter as a rule tag ("Never: pork", "Only: weeknight") and how many recipes can be used as the server counts it (warning colour when none), with "See them" to the recipe index. "Change" or a rule tag opens a sheet with every tag and Any / Only / Never, updating the usable count as modes change (late answers ignored), pointing to the Tags page when there are no tags; Done saves the filters with the rest of the setup unchanged. `/plan/recipes` (and so `/?sheet=filters`) opens it.

Spec: "Implementation Decisions › Modules" (Recipe count), "› Routes" (`/plan/recipes`), "› Specific interactions" (Copy: "Recipe filters", not "Pantry rules"); stories 20 (filters link), 60–66.

- Usable count with the recipe-count rule from ticket 07 (latest question wins); `aria-live` on the count.
- Saves through the plan-setup store (ticket 06); a failed save says so.
- Opens when the brief's URL has `sheet=filters`, then removes the parameter.
- Edits only section 3's own file; the sheet in its own file (README Conventions).
- Parity checklist: the Vue `RecipeFiltersPage` and `RecipesCard` tests.

Blocked by: 07, 09, 14

Status: done

- [x] App tests: rule tags text; count and its warning state; See them goes to the index; modes change the count and a late answer is dropped; empty tags state links to Tags; Done sends filters with everything else unchanged; failed save message; `/plan/recipes` opens the sheet
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#plan` section 3 and its sheet; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

**What landed**
- `web/src/app/pages/brief/FiltersSection.tsx`: section 3. Rule tags (the `RuleTag` primitive, as buttons with `aria-haspopup="dialog"`) in the setup's filter order; "No filters: every recipe may be used." when there are none; the usable count ("7 of 8 recipes can be used.") in an `aria-live` span, in the accent (warning) colour when none can be used or the count fails; "See them" to `/recipes`; "Change" (accessible name "Change the recipe filters"). `?sheet=filters` opens the sheet (state adjusted during render) and an effect removes the parameter with a replace, so ticket 15 can do the same for `schedule` without clashing.
- `web/src/app/pages/brief/FiltersSheet.tsx`: every tag in tag order with a compact `Segmented` (Any / Only / Never, group named "Filter for <tag>"), the `.sheet-preview` live count, Done. Each opening starts a fresh form from the saved filters. The preview shows the brief's count until a mode changes, then the sheet's own `useRecipeCount()` (latest question wins). Done with no change only closes; otherwise `planSetup.change(…, { optimistic: false })` sends the whole setup with the new `tag_filters` (tag order), closes on success, and on failure stays open with "Could not save. Try again." (`role="alert"`, or the server's `tag_filters` error). With no tags: "No tags yet. Add them on the Tags page, then come back to filter by them." with a link to `/tags`, and no Done.
- Focus on close goes back to the rule tag that opened the sheet, or to "Change" when it opened from "Change" or the address, or the rule tag is gone.
- `web/src/app/pages/brief/filters.css` (prefix `filters-`): D2's `.rules`, `.usable`, `.filter-list`/`.filter-row`, plus the warning state and the error line (the time section's dagger style).
- `Brief.tsx`: only the `<FiltersSection … />` line, now `plan={plan} tags={page.data.tags} count={recipes}` (the brief already asks the count for its standfirst; the section reuses it, so no second request).
- Messages: new keys in `recipeFilters` (`change`, `changeLabel`, `noRules`, `usable`, `seeThem`, `preview`, `previewCount`, `previewNone`, `none`, `noTagsYet`, `tagsPage`, `saving`); existing values untouched.
- Tests: `web/src/app/pages/brief/Filters.test.tsx` (16 app tests) port the Vue `RecipeFiltersPage` and `RecipesCard` scenarios plus the sheet's: rule tags, empty state, count and warning, failed count, See them, the sheet's rows, rule tag opens and gets focus back, modes re-ask, a late answer dropped, zero preview, no tags links to Tags, Done payload (all else unchanged) and focus to Change, Done without change saves nothing, close discards, failed save, `/plan/recipes`.

**Screenshots** (390 × 844 and 1280 × 800, paper and evening; section scrolled into view, the sheet, the sheet with a zero count, against `d2:plan` section 3 and its sheet). Section and sheet match D2 in rule, type, rule-tag look, usable line, rows and Segmented widths, preview block and Done, in both editions. Differences, all deliberate:
- Title "Recipe filters" (spec decision on copy), not "Pantry rules".
- "Change" and "See them" have no underline at rest (the `Button` primitive from ticket 10 underlines text buttons on hover only); D2 underlines them always.
- The zero preview ("No recipe fits these filters. Loosen one, or there will be no plan.") is in the accent colour with an accent bar, like the section's warning; D2 keeps the preview in ink.
- Closing the sheet without Done discards the changes without asking (D2 and the Vue page's Back do the same); no `beforeClose` confirm.

**For the README / ticket 42**
- `Button` does not take a `ref` (its props type omits it); I used a plain `<button className={buttonClass({ variant: 'text' })}>` for "Change". Ticket 42 could add `ref` to `Button`'s props.
- Opening a brief sheet from the address: pattern in `FiltersSection.tsx` (`if (asked && !open) setOpen(true)` during render, an effect deletes only `sheet` with `{ replace: true }`).
- The sheet renders inside the section, so `within(section)` queries also see the sheet's list items while it is open; query the rule tags by `.filters-rules > li` or by role name.
- Full suite with `--maxWorkers=2` while other agents ran: 1349 of 1350 passed; the one failure was ticket 14's first Brief test timing out on `findByRole('navigation')` (the lazy route's first load under heavy load, lesson (f)); it passes on its own and in the brief folder. That test could take `{ timeout: 5000 }` like `Filters.test.tsx` does.
