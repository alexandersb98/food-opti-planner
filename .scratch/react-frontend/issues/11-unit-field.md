# 11: Unit field (combobox)

**What to build:** The unit field used by the ingredient form, Attributes and "Create attribute…": the owner types a unit or picks one from the catalogue grouped by kind with the preferred unit first; typed text is kept as typed. It follows the ARIA 1.2 combobox pattern and D2's look.

Spec: "Implementation Decisions › Modules" (UI primitives: Combobox); "Assumptions to confirm" 1 (component tests for the combobox); stories 155 (unit part), 168 (unit part), 187 (unit part).

- Options from the unit catalogue store (ticket 07), grouped by kind, the preferred unit (preferences store) first in its group; an optional restriction to one kind.
- Typed text kept as typed (no forced match); arrow keys, Enter, Escape, `aria-activedescendant`, listbox with groups; works with Field's label, hint and error.
- Parity: the Vue `UnitField` component tests.
- Specimen section (README Conventions).

Blocked by: 04, 05, 07

Status: done

- [x] Component tests ported from the Vue `UnitField` tests (grouping, preferred first, typed text kept, keyboard selection, restriction to a kind)
- [x] Screen reader semantics checked: combobox role, expanded state, active option announced
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2's form fields (any sheet on `#plan`); D2 has no combobox, so match its field styling; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- **Where.** `web/src/app/ui/unit-field/`: `UnitField.tsx` (exports `UnitCombobox` and `UnitField`), `options.ts` (the pure grouping and filtering), `unit-field.css` (prefix `unit-field-`), `UnitField.test.tsx` (23 component tests), `Specimen.tsx` (specimen section "Unit field", one line in `specimen/sections.ts`).
- **API.** `<UnitField label value onChange kinds hint? error? id? name? disabled? required? />`. `kinds` is the groups in order (`'mass' | 'volume' | 'energy' | 'piece'`, piece = "Other"); one kind restricts the field (e.g. `['energy']`). `onChange` gets the text at every keystroke and the symbol on a choice, only when it differs from `value` (the Vue field's "not sent again" rule).
- **Adopting ticket 10's Field.** `UnitCombobox` is the box and list alone and takes `id`, `labelId` (also names the listbox), `describedBy` and `invalid`; put it inside Field and pass Field's ids. `UnitField` draws its own label (D2 `.field > label` look), italic serif hint and red error, and can be replaced by Field + `UnitCombobox` later without changing the box.
- **ARIA 1.2 combobox, list autocomplete without automatic selection.** Input `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded` (false while the list has nothing to show, e.g. no match or no catalogue), `aria-controls`, `aria-activedescendant` on the active option; listbox named by the label, one `role="group"` per kind named by its head (head is `role="presentation"`, not an option). Keys: Down/Up open (at first/last) and move with wrap, Alt+Down/Up open/close, Enter takes the active option (with none it closes and keeps the text, and is not prevented, so a form can submit), Escape closes an open list and stops propagation; with the list closed Escape is left to the sheet. Tab and blur close without choosing. Pointer: mousedown on the list is prevented so focus stays in the box.
- **Look.** No D2 combobox, so: D2's ruled input (base.css) with a small red-pencil chevron; the list a paper slip under the box with an ink hairline border and the page shadow, small-capital group heads that stay at the top while scrolling, options at 44px touch height as "symbol *(name)*" (sans symbol, italic serif name), the active option pressed paper with a red rule at the margin, and a red tick on the unit the box names (it also ticks when typed text is an alias, e.g. "litre" ticks l). Error: red text and red underline. Compared with D2's goal sheet (`#plan`, Add goal): label size/colour and the ruled line match.
- **Screenshots** (not committed): specimen `/next/specimen#unit-field`, list open, filtered ("litre"), closed with hint and error, phone and desktop, paper and evening; D2 goal sheet for comparison. Evening edition reads well (paper token background, press tint visible).
- **Deviations / for later tickets.** The list is absolutely positioned under the box (no portal, no flip upwards); inside a scrolling sheet (ticket 09) near the bottom it extends the sheet's scroll rather than overlaying past it. If that looks wrong in tickets 29/36/41, move it to the top layer (`popover`) with JS or anchor positioning. No jest-dom in the repo, so tests assert attributes directly (I did not add a dependency to avoid package.json conflicts with parallel tickets). No new messages; group heads use the existing `units.groups.*`. No new tokens.
- **For the README** (lead to fold in): Conventions could name the unit field: `app/ui/unit-field/UnitField.tsx` (`UnitField`, and `UnitCombobox` for use inside Field).
