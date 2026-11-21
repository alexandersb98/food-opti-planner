# 31: Ingredient source link and updated values

**What to build:** A linked ingredient shows where it comes from in the source's colour, "No longer in the source" when withdrawn, and "Unlink from source" with a confirmation. When the source has new values a banner lists old and new per attribute with Accept and Keep mine.

Spec: stories 163, 164.

- Source colour text contrast from the pure colours module.
- Fills the source place on the ingredient page (ticket 29) with one line.
- Parity checklist: the Vue `SourceChip` and `UpdatedValuesBanner` tests and the `IngredientPage` source tests.

Blocked by: 29

Status: done

- [x] App tests: source name in colour with readable text; withdrawn note; unlink confirms and sends; banner lists old and new; Accept and Keep mine send the right calls and the banner goes
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no source chip: use D2's rule tags and banner styling, in both editions with a light and a dark source colour; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- **Files.** `web/src/app/pages/ingredient/IngredientSource.tsx` (+ `ingredient-source.css`), `UpdatedValues.tsx` (+ `updated-values.css`), app tests in `IngredientSource.test.tsx` (17 tests: every scenario of the Vue `SourceChip`, `UpdatedValuesBanner` and `IngredientPage` source/banner tests, by role and text). In `IngredientForm.tsx` only the two "Ticket 31" comment lines were replaced (one line each) plus two import lines after `import './ingredient.css'`. The header comment's "Places left" sentence still names ticket 31; left alone so as not to touch lines tickets 30 and 37 may edit; ticket 42 can trim it.
- **Host contract.** `<IngredientSource ingredient={stored} onChange={setStored} />` and `<UpdatedValues ingredient={stored} attributes={attributes} onAnswered={(answered, fill) => …} />`; both render nothing without a source. `fill` (from the pure `answeredValues`) updates the typed values: Accept takes the new numbers, Keep mine puts "0" where there was no value and nothing typed (as in Vue), other edits stay.
- **Failures shown in place.** Vue put "Could not unlink" and "Could not save your answer" into the form's save error; here each shows under its own control (`role="alert"`), so the host needs no new state.
- **Look.** D2 has no source chip. The source is a square tag in the source colour (D2 `.rule-tag` shape, serif 17px) with `contrastText` from `web/src/colours.ts` as text colour, passed as `--source`/`--source-ink` custom properties; an ink hairline keeps pale or paper-like colours visible. "No longer in the source" is an outlined red-pencil tag (D2's never rule). Unlink is a text button. The banner follows D2's editor's note card: 4px accent rule on the left, italic serif title (h2, `role="status"`, labelled by it), lines ruled like `.clash-item` with the old value muted, a red arrow and the new value bold; Keep mine (outline) then Accept (primary), both small.
- **Screenshots** (390x844 and 1280x800, paper and evening, with a dark #1976d2 + withdrawn and a light #f4d35e source colour, updated values faked by a Playwright route): both colours read in both editions. Fixed after looking: Unlink was pushed to the right edge and wrapped alone on phones; now it follows the tags. web-design-guidelines: added `text-wrap: balance` on the title, `nowrap` on number+unit, `translate="no"` on values.
- **For the README** (lead): ingredient page places for 31 are filled; nothing new left for later tickets.
