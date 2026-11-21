# 41: Create an attribute from a data source column

**What to build:** "Create attribute…" in a column's Attribute choice opens a small sheet with a name, a unit of the column's kind starting at the preferred unit, and decimals; saving creates the attribute and maps the column to it, saying so if only the creation worked.

Spec: story 187.

- Sheet (ticket 09), unit field restricted to the column's kind (ticket 11), preferences (ticket 07).
- Adds the option to the column choice on the data source page (ticket 40) with one line; the sheet in its own file.
- Parity checklist: the Vue `NewAttributeDialog` tests.

Blocked by: 09, 11, 40

Status: done

- [x] App tests ported from `NewAttributeDialog` (unit kind and default, name and decimals errors, create then map, the partial-success message)
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 bottom sheet styling (`#plan` sheets); differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- **Files.** `pages/data-source/CreateAttribute.tsx` (the sheet), `create-attribute.css` (prefix `ds-create-`), `CreateAttribute.test.tsx` (11 app tests). Host edits are the marked lines: `CREATE` and its `options.push` in `SourceColumns.tsx`; in `DataSource.tsx` the `choose` line, a `creating` state (column, open, key per opening), `created()` and the sheet at the end. The existing data source tests now expect "Create attribute…" last in every choice (as Vue does), and `entries()` waits for more than two options.
- **Behaviour.** Parity with Vue: the unit starts at the preferred unit of the column's kind (the column's own unit for free text such as `dose` or `st`) and follows the catalogue and preferences arriving late until the reader types one (derived in render: `typedUnit ?? preferred ?? column.unit`); the unit list offers only that kind (none for free text). Add checks name, unit (`convertible`) and decimals, focuses the first marked field, posts, then the page closes the sheet, lists the attribute for every row and maps the column; a refused mapping puts "The attribute was created but could not be mapped." on the row. A name in use stays on the name field; any other failure shows `common.saveFailed` as an alert in the sheet. Focus returns to the row's choice.
- **Deviation.** Like Vue, Create is offered on a column with no unit too, where Add can only answer "Must convert with ." (`convertible('', x)` is false). Left as Vue has it; worth hiding Create for such columns later.
- **New messages:** `dataSource.createLead` ("Add creates the attribute and maps {column} to it.", in the sheet's preview strip) and `dataSource.createUnitHint`.
- **Screenshots** (390 × 844, 1280 × 800, paper and evening, reduced motion) against D2's `#plan` Add goal sheet: same sheet, preview strip, ruled fields in a two-column row and ghost/primary actions. Fixed: the unit and decimals lines did not line up when one hint wrapped (grid stretch; `align-content: start`), and the row now pairs from 360 px. The unit's error gets Field's dagger in this sheet via `.ds-create .unit-field-error` (UnitField draws its error without it; for ticket 42 to fold into `unit-field.css`). The unit list opened low in the sheet is cut by the panel's edge and needs a scroll, as in any sheet with a unit field.
