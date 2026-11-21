# 38: The Tags page

**What to build:** Tags are listed in the D2 look, hand-made first and source tags after, each with its rule ("when all/any ingredients have it") and where it comes from. A tag opens in place to edit its name and rule, saved on close. Source tags show in their source's colour without a name field or Delete, with a note that they can't be renamed or deleted. Tags are made equivalent by adding them to a group, the picker saying which tags a candidate is already equivalent to; the server's questions about groups (move a tag here, switch its rule, change the whole group's rule) are asked one at a time with their answers. Delete says what else is removed (from ingredients, recipes and plan filters) and that the tag leaves its group. "+ New tag" and name errors (missing or in use).

Spec: "Implementation Decisions › Routes" (lazy route), "› Specific interactions" (one open row, saved when it closes; tag-group questions are sheets); stories 173–179.

- Replaces the lazy `/tags` stub; Sheet and Confirm (ticket 09).
- Parity checklist: the Vue `TagsPage` and `TagGroupQuestions` tests.

Blocked by: 08, 09, 10

Status: done

- [x] App tests ported from those files (order, rule text, edit and save on close, source tag restrictions, group picker equivalence text, each group question and answer in turn, delete consequences, new tag and errors)
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no Tags page: use D2's list, rule tags and the annotated editing style; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

**What landed** (all in `web/src/app/pages/tags/`; the route line already pointed at `pages/tags/Tags` lazily, so `routes.tsx` is unchanged)
- `Tags.tsx`: the page. Cover (kicker "8 tags" from `shell.count.tags`, italic display title, `tags.intro` as standfirst), then a ruled list in D2's archive style named by the title (`aria-labelledby`): each closed entry is a button with the name (serif 21px) and its rule line in small sans (rule, "added by hand", "Source · rule", "equivalent to …"), a chevron, and a source tag's colour as a small swatch before its name. "+ New tag" is a text button under the list. One open row at a time, saved on Done or when another row (or "+ New tag") is opened; it stays open if the save fails. Focus moves to the first field on opening, back to the entry (or "+ New tag" after Cancel/Delete) on closing, and to the name on a name error.
- `TagEditor.tsx`: the open entry, "annotated" with the red pencil: a red margin rule and faint tint on the entry, the name as D2's `.annot` (dashed red underline) at 24px serif, the rule as a sentence with its choice inline ("A recipe gets this tag when [any ingredient has it ▾]", the `Select` primitive's annotation look), equivalent tags as bordered chips with a labelled × ("Remove Seafood") or "None", and "Add equivalent tag". Source tags show the name with the swatch and "From X. It can't be renamed or deleted." instead of the field, and no Delete. Delete (red text button, left) and Done (primary, right); a new tag has Cancel and no equivalent section.
- `EquivalentPicker.tsx`: a sheet (D2's picker-list idiom) with a search line over every other tag not already a chip; one in another group says "now equivalent to …" in italics.
- `GroupQuestions.tsx`: the server's 409 questions in one alertdialog sheet, one at a time ("Question 1 of 2" when several, the text in an `aria-live` region so the next one is announced), with their own answer labels (Move/Don't move, Switch/Don't add, Change/Cancel). Closing the sheet (Escape, tap outside) answers no to the rest. Yes to all resends with `confirm`; any no drops that chip (or restores the rule) and saves again, as Vue did.
- `tagText.ts`: rule line, delete warning and question text, as pure functions of `t`.
- Delete uses `useConfirm` (destructive) with the existing warning messages (removes from n ingredients, recipes and plan filters; leaves its group).

**Messages**: new keys inside `tags.group`: `remove`, `search`, `noChoices`, `questionOf`. Everything else reuses existing `tags.*`, `common.*`, `count.*` and `shell.count.tags`.

**Tests**: `Tags.test.tsx`, 40 app tests through `mountApp('/tags')`: every Vue `TagsPage` and `TagGroupQuestions` scenario, plus focus return and focus on error, failed delete, a failed save keeping the row open when another is opened, empty list, picker search, three questions in turn with a no in the middle, and dismissing the questions.

**Screenshots** (390 × 844 and 1280 × 800, paper and evening, against sample data; compared with `d2:archive`): the list matches the archive's cover, rule weights and entry rhythm; the open entry, the picker, a switch question, a name-in-use error and the delete Confirm read well in both editions; no horizontal scroll at 390.

**Decisions and deviations**
- D2 has no Tags page: the list is D2's archive list, the open entry is D2's "annotating the page" edit style, the picker is D2's picker-list in a sheet. No rule-tag chips (D2's `.rule-tag` is a Never/Only filter, which tags here are not).
- The rule is an inline annotated select instead of Vue's radio pair (one sentence, as D2 writes its rules). Tests choose it as a combobox named "A recipe gets this tag when".
- The group picker is a sheet with a search line instead of Vue's type-ahead select (touch-friendly, and the "now equivalent to" note fits under each name).
- The question sheet's title is "Equivalent tags"; closing it answers no to every remaining question (Vue's dialog could not be dismissed).
- The cover is a `div`, not a `header`: testing-library counts a `header` inside the page as a second `banner`, which broke the shell's running-head test. Cover styles (`.tags-cover`, `.tags-title`, `.tags-standfirst`) copy D2's `.cover`, which base.css does not have yet.
- As in Vue, leaving the page with an open, changed row drops the change silently, and opening a row focuses its name (the keyboard comes up on a phone).

**For the README / ticket 42**
- D2's `.cover` / `.cover-title` / `.standfirst` are not in `base.css`; each page ticket copies them under its own prefix. Ticket 42 could fold them into `base.css` (and add D2's `.annot` as a shared class: this page has it as `.tags-annot`).
- A page's cover should not be a `<header>` (it becomes a second `banner` in tests and to some screen readers).
- Under full-suite load (many agents at once), `specimen/Specimen.test.tsx` and `ui/stepper/Stepper.test.tsx` once hit their 5 s timeouts; they pass alone and the full suite passed on the rerun.
