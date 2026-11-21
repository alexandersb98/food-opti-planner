# 34: Import a recipe: link or text

**What to build:** An Import page where the owner gives a link or pastes the recipe text (the text kept when switching between the two and after an error), sees "Reading the recipe…" while the AI works, and gets each refusal in words with what to do (no text, too long, no recipe, no recipe on the page, page unreadable, no link, bad link, AI failed, daily limit, no AI key, other). A finished import hands the draft over (imported-draft store, ticket 07) and opens a new spread in edit mode.

Spec: "Implementation Decisions › Routes" (`/recipes/import`, lazy route); stories 141, 142, 143 (hand-over).

- Replaces the lazy `/recipes/import` stub. Segmented control for link/text.
- Until ticket 35 lands, the spread just opens in edit mode with the draft's fields; this ticket's tests check the hand-over and navigation only.
- Parity checklist: the Vue `ImportPage` tests.

Blocked by: 07, 08, 10

Status: done

- [x] App tests ported from `ImportPage` (text kept across modes and errors, reading state, every refusal message, success puts the draft in the store and goes to `/recipes/new`)
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 has no import screen: use D2's brief form styling (`#plan` sheets) and kickers; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- **Where.** `web/src/app/pages/import/` (`Import.tsx`, `import.css` with the `import-` prefix, `Import.test.tsx`). The route line was already the lazy `/recipes/import` line pointing at `pages/import/Import`, so `routes.tsx` is unchanged.
- **Hand-over.** A finished import calls `importDraftStore.put(draft)` and navigates to `/recipes/new`; the page never takes the draft (the spread does, through `useImportedDraft`, ticket 07). Opening the page clears an old draft in an effect (`put(null)`), as the Vue page did. Until tickets 26/27/35 the `/recipes/new` stub shows; the tests check the store and the navigation only.
- **Cover is a `div`, not a `header`.** A `<header>` inside the page's `<article>` is still counted as a second `banner` by Testing Library, which breaks the shell test's `getByRole('banner')` (ticket 08's running-head test for `/recipes/import`). Other page tickets with a cover will hit the same.
- **Test timeout.** `Import.test.tsx` sets a 15 s test timeout: the first mount waits up to 5 s for the lazy route on a cold transform, which under heavy load (many agents at once) took longer than the default 5 s test timeout.
- **AI key.** `/api/health` through `useLoad` (never blocks the page): unknown until it answers, so the no-key note does not flash; an unreadable answer counts as no key.
- **Refusals.** `errorType` from `api/errors`; a fixed set of types has its own sentence (`import.error.*`), anything else is `import.error.other`; `no_recipe` in link mode says `no_recipe_page`. The refusal stays when switching modes (its advice is often "paste the text instead"). Both inputs keep their text across modes and refusals (the state lives in the page; the inactive input is not rendered). `noValidate` on the form, so a malformed link reaches the server and gets its `url_invalid` sentence instead of the browser's bubble.
- **Ported tests** (32): every Vue `ImportPage` scenario (disabled for blank or spaces in both modes, no key, key note not before health, unreadable health, reading state with a read-only input and a second click ignored, success hand-over and navigation, every refusal in text and link mode, network errors, trimmed link, Enter submits, text kept across modes, old draft cleared) plus an unknown refusal type and Cancel. The draft-clearing test was checked to fail with the clearing removed.
- **Messages.** New keys in the `import` namespace: `import.cover.{kicker,title,titleEm,standfirst}`, `import.from`, `import.fromLink`, `import.fromText`, `import.linkPlaceholder`, `import.textHint`, `import.noKey`, `import.writeByHand`. Reused: `import.link`, `import.linkHint`, `import.text`, `import.run`, `import.reading`, `import.error.*`, `common.cancel`. Vue-only now (for ticket 42 to remove): `import.title`, `import.intro`, `import.pasteText`, `import.needsKey`. The existing error sentences use straight apostrophes ("won't", "Couldn't"); left alone while Vue tests assert on them, ticket 42 may curl them.

### Screenshots and decisions

Shot at 390 × 844 and 1280 × 800, paper and evening, against the real backend with the fake AI: the page on opening (link), pasted text, a refusal (`[fake:none]` gives "No recipe found in this text."), reading (the import call held open), no AI key (health stubbed) and a real success landing on `/recipes/new`. Compared with D2 `#plan` and its goal sheet.

- D2 has no import screen. The page opens with a cover like D2's other pages (accent kicker "For the recipe index", display title with the italic word, standfirst), then a hairline and the brief sheets' form: a `Fieldset` legend, the `Segmented` control ("A link" / "Pasted text", replacing Vue's Paste text switch, as the ticket asks), fields on ruled lines with italic hints, and D2's actions row (primary Import, Cancel as a plain text button back to the index).
- The link is set in the serif at 20 px like D2's `.input.serif`; the pasted text is a ruled writing block in the serif at 17/26 (like the method steps), 8 rows, resizable.
- A refusal is a red-pencil line with D2's dagger (as `Field`'s error), `role="alert"`, under the field.
- Reading: the button says "Reading the recipe…" with a small red-pencil stroke that draws itself (transform and opacity only; still under reduced motion), and keeps its full ink (first shots showed it greyed like a disabled button, which read as "unavailable", so `data-reading` overrides the disabled opacity). A visually hidden `role="status"` line says it once to screen readers. Inputs are read-only meanwhile, and the form has `aria-busy`.
- No AI key: an italic note with a "Write a new recipe" link to `/recipes/new`, so the page is not a dead end; Import stays disabled.
- No horizontal scroll at 390; focus ring from base.css on every control in both editions. No new tokens.
