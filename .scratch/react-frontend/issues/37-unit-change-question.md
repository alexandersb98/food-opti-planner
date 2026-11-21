# 37: The unit-change question

**What to build:** Changing the unit of an ingredient or an attribute first asks, in a sheet, what will be converted or kept and what would be rounded; a refused change is explained under the unit (decimals needed, too large, rounds to zero, mapped from a source column of another unit; for ingredients, the reasons today's editor gives) until the owner edits it. Stored numbers are never changed by surprise.

Spec: "Implementation Decisions › Specific interactions" (unit-change question is a sheet); stories 158, 171.

- The unit-change question store (ticket 07) and the pure refusal text (moved in ticket 02); one sheet component.
- Fills the unit-change places left on the ingredient page (ticket 29) and the Attributes page (ticket 36), one line each.
- Parity checklist: the Vue `UnitChangeDialog` and unit-change composable tests and the unit-change tests of `IngredientPage` and `AttributesPage`.

Blocked by: 29, 36

Status: done

- [x] App tests on both pages: the question lists converted/kept/rounded; convert, keep and cancel send (or don't send) the right calls; each refusal shows under the unit until the unit is edited
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 bottom sheet styling (`#plan` sheets); differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- **Pieces.** `web/src/app/ui/unitChange/`: `askUnitChange.ts` (preview → refusal text under the unit, `same` goes straight on, else `unitChangeQuestion.ask`; a failed preview stops the save) and `UnitChangeSheet.tsx` (+ `unit-change.css`), the one sheet, reading `useUnitChangeQuestion`. Each page has a hook beside it returning `[check, sheet]`: `pages/attributes/unitChangeCheck.ts` (`useAttributeUnitChange`, replacing `useUnitChangeGoesStraightOn`, same contract) and `pages/ingredient/unitChangeCheck.ts` (`useIngredientUnitChange`).
- **IngredientForm.tsx** edits: one import, the hook line under `useConfirm()`, the place in `save` (`await checkUnitChange(stored, fields)`, plus a focus bump on a refusal so the unit field gets focus like other field errors) and `{unitChangeSheet}` after `{confirmSheet}`.
- **Sheet unmount answers no** (a page left with the question open does not save); tested on both pages via the store snapshot.
- **Deviation from Vue:** the Vue dialog was persistent (a click beside it decided nothing). Here Escape, a tap outside and the close button all cancel, as for Confirm and D2's sheets: cancelling changes nothing, so it is safe. Focus starts on Cancel; `role="alertdialog"`.
- **Tests:** `pages/attributes/UnitChange.test.tsx` and `pages/ingredient/UnitChange.test.tsx` (new files, to keep clear of tickets 30/31). The existing page tests got one default route each (a `same` preview) so their unit changes go straight on.
- **Screenshots** (390 × 844, 1280 × 800, paper and evening): the sheet matches D2's `#plan` goal sheet (italic title, close, preview block with the red rule, ghost Cancel + ink primary). The rounded note sits under the preview in italic red pencil. Real sample data gives a refusal for Energy kcal → kJ with 0 decimals (needs 1 decimal), shown under the unit as designed.
- **For later / ticket 42:** on the Attributes page, Done reads "Saving…" behind the open question, since ticket 36's `close()` sets busy before the check; harmless (the sheet is modal) but could set busy after the check. `unit-change.css` uses only existing tokens. The "1 decimals" in the refusal text is the existing message (no plural form).
