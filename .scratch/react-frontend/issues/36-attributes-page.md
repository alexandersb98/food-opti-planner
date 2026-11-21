# 36: The Attributes page

**What to build:** Attributes are listed in the D2 look with unit and decimals. An attribute opens in place (one open at a time, styled as an annotated entry) to edit its name, unit (unit field) and decimals, saved when it closes or another opens and staying open if the save fails; "+ New attribute" adds one in place; errors (name missing or in use, decimals out of range) show on their fields; delete says it also removes the values from n ingredients and n goals and clears its source mapping.

Spec: "Implementation Decisions › Specific interactions" (Attributes and Tags keep "one open row at a time, saved when it closes"); stories 167–170, 172 (the unit-change question is ticket 37).

- Replaces the `/attributes` stub; unit field (ticket 11), Confirm (ticket 09).
- Leave a clear place, one line, for the unit-change question call (ticket 37).
- Parity checklist: the Vue `AttributesPage` tests other than unit changes.

Blocked by: 08, 09, 10, 11

Status: done

- [x] App tests: list text; open, edit and save on close and on opening another; stays open on failure; new attribute; each error on its field; delete confirmation counts and call
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no Attributes page: use D2's `#ingredients` list and the annotated (red pencil) editing style; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

**What landed** (all in `web/src/app/pages/attributes/`; the route line already pointed at `Attributes.tsx`, so `routes.tsx` is unchanged)
- `Attributes.tsx`: the page. Cover like D2's `#ingredients` (kicker "5 tracked", italic display title, the existing `attributes.intro` as standfirst), then the list. Each entry is a button laid out like a recipe-index entry: name (serif), unit in the right margin (italic serif), "1 decimal · 1 goal" under it. One entry open at a time; it closes (and saves if changed) on Done, Enter, or opening another entry or "+ New attribute"; a failed save, a field error, or a refused unit keeps it open with what was typed. "+ New attribute" opens a new entry at the end (decimals 3, empty unit), with Cancel instead of Delete. Delete asks with `useConfirm` (title "Delete Protein?", the ingredients/goals/source-columns counts or "Nothing else uses it.") and only then calls DELETE.
- `AttributeForm.tsx`: the open entry, annotated in red pencil (D2's `.annot`: dashed red underline and faint wash, solid when focused or invalid; 2px red rule in the margin). Name (Field), unit (`UnitField`, kinds mass/volume/energy, as Vue), decimals (Field, `inputMode="numeric"`, hint "How precisely the planner counts it: 1 → 0.1 g." from `decimalsExample`). Errors on their fields: name missing / in use, decimals outside 0–6, a unit the server refuses (its sentence, under the unit); anything else as a row-level alert ("Could not save. Try again." / "Could not delete. Try again."). A field's message goes when that field is edited (so a unit refusal stays until the unit is edited). Focus: the name on opening, the first field with a message after a refused close, the entry after Done, "+ New attribute" after Cancel or delete. Done reads "Saving…" while saving.
- **Place for ticket 37** (one line in `Attributes.tsx`, marked with a comment): `const [checkUnitChange, unitChangeSheet] = useUnitChangeGoesStraightOn()`. The page calls `checkUnitChange(attribute, fields)` before saving a changed unit of a saved attribute and renders `unitChangeSheet`. The contract is in `unitChangeCheck.ts`: resolve `{ go: true }` to save, `{ go: false, unitError }` for a refusal under the unit, `{ go: false, failed: true }` for a failed preview ("Could not save"), `{ go: false }` for Cancel (entry stays open). Ticket 37 replaces that line with its own hook returning the same pair (preview call, `refusalText`, the question store and its sheet). Until then a changed unit goes straight to the PUT.
- `attributes.css` (prefix `attributes-`); it styles `.unit-field-input` inside `.attributes-form` with the annotation look (scoped override, ticket 11's stylesheet untouched).
- Messages (in `attributes`, after `intro`): `tracked`, `editing` ("Editing {name}", the open form's accessible name), `newEntry`, `saving`, `precisionHint`, `precisionHintPlain`. Reused: `attributes.*`, `common.*`, `count.*`.

**Tests**: `Attributes.test.tsx`, 18 app tests ported from the Vue `AttributesPage` tests except the unit-change ones: list text; open, edit, Done saves and closes (focus back on the entry); Enter saves; Done without changes sends nothing; opening another saves the open one first; a failed save keeps it open and the other closed; name in use, empty name and decimals out of range on their fields (`aria-invalid`, described by the message, focus on the first); a server unit refusal under the unit until the unit is edited; new attribute added at the end, without a unit, and cancelled; delete confirmation text (counts, mapping, nothing else) and the call only after confirming; failed delete; unit list groups Mass/Volume/Energy and a chosen unit sent as its symbol; empty list; failed load and Try again.

**Screenshots** (not committed; 390×844 and 1280×800, paper and evening; list, open entry, errors, new entry with the unit list open), compared with D2 `#ingredients` (cover, rules, entry type) and D2's annotated recipe editing (`.annot`). D2 has no Attributes page; decisions:
- One column of entries (not `#ingredients`' two columns), because each entry carries a unit and a second line; the entry type follows the recipe index (`.idx-entry`).
- The open entry hangs a 2px red rule into the gutter and has a 4% red wash, so it reads as "annotated" without D2's sticky editing bar (there is nothing to save as a whole).
- Unit and decimals sit side by side from 560px, stacked on phones (the hints are too long for a narrow column).
- The Button primitive's text variant (Delete, + New attribute) has no underline where D2's `.text-btn` has one; left as the primitive draws it.
- A very long typed unit is cut with an ellipsis in the list (full in the open entry).

**For the README / later tickets**
- Ticket 37: see "Place for ticket 37" above; the unit-change sheet is rendered where `unitChangeSheet` is.
- Ticket 38 (Tags) keeps the same "one open entry" model; it may copy the open/close/focus logic from `Attributes.tsx`.
- Not done (Vue doesn't either): warning before leaving the page with unsaved changes in the open entry.
