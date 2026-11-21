# 10: Form and display primitives, and the load hook

**What to build:** The small building blocks every page uses, in D2's look: a page's data loaded with loading, failed and Try again states; labelled fields with hints and errors wired for screen readers; steppers, segmented controls, chips, native selects, disclosures; importance dots, rule tags and the drawn colour plate.

Spec: "Implementation Decisions › Modules" (Load hook, UI primitives other than Sheet, Confirm and Combobox), "› Performance and React practice", "› UI quality bar"; stories 25 (pattern), 45 (dots), 60 (rule tag), 115 (plate), 193.

- **Load hook**: a page's data loaded when it opens, several calls in parallel through `loadAll` (moved by ticket 02); loading, failed and retry; answers that arrive after the page left or after a newer load are ignored (safe under strict-mode double effects). Unit-tested.
- **LoadState**: loading and "failed, Try again" display.
- **Field** (label, hint, error; `aria-describedby`, `aria-invalid`; error announced), **Stepper** (min, max, step function, 44 px targets), **Segmented control** (a group of pressed buttons), **Chips** (toggle chips with pressed state), **Select** (native, with option groups), **Disclosure** (for Advanced parts; can start open).
- **Importance dots** (1–5, with text for screen readers), **Rule tag** ("Never: pork"), **Plate** (the drawn SVG colour plate and a small swatch, hue derived deterministically from the recipe id, as in D2).
- Stepper, Segmented and Chips carry `data-no-swipe`.
- One stylesheet per primitive; one specimen section per primitive (README Conventions).

Blocked by: 02, 04, 05

Status: done

- [x] Load hook tests: parallel calls; failure and retry; a stale answer after unmount or after a newer load is ignored; strict mode does not show stale data
- [x] Field wiring tested once (label, hint and error reachable by accessible description; `aria-invalid` set)
- [x] Plate hue is stable for a given id and varies across ids (unit test)
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2's controls on `#plan` (steppers, segmented controls, chips in sheets, rule tags, importance dots) and plates on `#recipes`; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

### API for page tickets (all in `web/src/app/`; each file's top doc comment has an example)

- **`hooks/useLoad.ts`**: `const page = useLoad((signal) => loadAll({ a: api.GET(…), b: api.GET(…) }), key?)` gives `{ data, loading, failed, reload, setData }`. Calls start at once (no waterfall). `key` (string or number, e.g. the route id) loads again when it changes and hides the old key's data meanwhile. Only the latest call's answer counts: after unmount, a newer key or a reload, older answers are ignored and their `AbortSignal` is aborted, so strict mode is safe. `reload()` keeps the data shown while it runs; a failed reload keeps the old data and sets `failed`. `setData(value | fn)` updates the loaded data after a save. An inline arrow is fine (the latest call is read when it runs).
- **`ui/loadState/LoadState.tsx`**: `if (!page.data) return <LoadState of={page} message={t('tags.loadFailed')} />`. Loading: a quiet italic "Loading…" (`role="status"`, fades in after 350 ms so a fast load doesn't flash). Failed: the message and "Try again" (`common.retry`), `role="alert"`; without `message` it says `ui.loadFailed`. Renders nothing otherwise.
- **`ui/button/Button.tsx`**: `<Button variant="primary|accent|ghost|text|text-plain" small block>`; default is D2's outlined `.btn`; `type="button"` by default. `buttonClass(look)` styles a router `<Link>`. (Not in this ticket's list, but the Elements specimen (05) said styled buttons come here, and every page needs them.)
- **`ui/field/Field.tsx`**: `<Field label hint error hideLabel? id?>{(control) => <input {...control} … />}</Field>`. `control` = `{ id, aria-describedby (hint and error), aria-invalid }`; the error is a `role="alert"` line marked with a dagger, and the hint stays. `<Fieldset legend hint error>` is the same for a group (Segmented, Chips, Stepper) with fieldset and legend.
- **`ui/stepper/Stepper.tsx`**: `<Stepper value onChange min max step label|labelledBy decreaseLabel increaseLabel format? disabled?>`. `step` is a number or `(value, direction) => next` for uneven steps; results are clamped, and a button is disabled when it cannot move. The value is an `<output aria-live="polite">`. 44 px buttons, `data-no-swipe`.
- **`ui/segmented/Segmented.tsx`**: `<Segmented value options={[{ value, label, disabled? }]} onChange label|labelledBy compact?>`: buttons with `aria-pressed` in a `role="group"` with `data-no-swipe`. Leave the label out inside a Fieldset. `compact` is D2's filter-row size.
- **`ui/chips/Chips.tsx`**: `<Chips label|labelledBy><Chip pressed onClick note? disabled?>Name</Chip></Chips>`; the group has `data-no-swipe`. A disabled pressed chip with `note="auto"` is D2's derived tag.
- **`ui/select/Select.tsx`**: `<Select value onValueChange options={[{ value, label }, { group, options: [...] }]} annotation? {...control} />`: native select with optgroups and a drawn caret. `annotation` is D2's dashed red `select.annot` for a select inside a line of text (give it an `aria-label`).
- **`ui/disclosure/Disclosure.tsx`**: `<Disclosure summary={t('…advanced')} startOpen={hasError}>`: native details and summary; opens when `startOpen` is or becomes true, never closes by itself.
- **`ui/importanceDots/ImportanceDots.tsx`**: `<ImportanceDots value={3} max? label?>`: `role="img"`, read as `goals.importanceOf` ("Importance 3 of 5") unless `label` is given (e.g. the split text).
- **`ui/ruleTag/RuleTag.tsx`**: `<RuleTag mode="never|only" tag="Pork" note? onClick?>`: a button with `onClick`, else a span. Read as "Never: Pork" (visually hidden colon; words from `recipeFilters.mode`). Other button props (e.g. an `aria-label` ending in "change") pass through.
- **`ui/plate/Plate.tsx`**: `<Plate id={recipe.id} variant="spread|swatch" label? className?>`. The spread fills its box (give the box a size: D2's is full width, 232 px high, `overflow: hidden`); the swatch is 44 px. Decorative unless `label` is given (then `role="img"`). `plateHue(id)` and `plateDish(id)` are in `plateHue.ts`.

### Messages

New namespace `ui` (after `common`): `ui.loading` "Loading…", `ui.loadFailed` "Could not load this page.". Reused: `common.retry`, `goals.importanceOf`, `recipeFilters.mode.*`.

### Tests

`hooks/useLoad.test.tsx` (8 tests: parallel through `loadAll`, failure and retry for no data and a thrown error, ignored after unmount, a newer load wins, a new key, strict mode, `setData`; the stale-answer tests were checked to fail with the guard removed). `ui/field/Field.test.tsx` and `ui/stepper/Stepper.test.tsx` go through `mountApp('/specimen')` (the app seam, not component tests); their first find waits up to 5 s for the lazy route on a cold transform. `ui/plate/plateHue.test.ts` (stable, varied, food colours only, dish).

### Screenshots and decisions

Each specimen section of `/next/specimen` shot at 390 × 844 and 1280 × 800, paper and evening, with keyboard focus on the first control, compared with D2 `#plan` and `#recipes`:

- Stepper, segmented, chips, rule tags, dots and plates port D2's CSS as is (class prefixes `stepper-`, `seg-`, `chip`, `rule-tag-`, `dots-`, `plate`). The red-pencil focus ring shows on every control in both editions; no horizontal scroll at 390.
- **Plate hue.** D2 hand-picks a food colour per recipe. A plain golden-angle hue gave purples and magentas that did not read as food, so `plateHue` spreads ids by the golden ratio over food arcs only (340°–125° and 190°–215°). The dish (plate, platter, bowl, pan) is `id % 4` as in D2.
- D2 has no disclosure, field error or load state; they are drawn in its idiom: a hairline and an ink sans summary with a drawn caret; the error as a red-pencil line with D2's dagger; loading as a muted italic line, and failure between hairlines like D2's empty state.
- Hover styles only under `(hover: hover)`; `prefers-reduced-motion` stops the loading fade and the caret turn.

### For the README

- Primitives live in `web/src/app/ui/<camelCaseName>/`: the component, a kebab-case stylesheet, `Specimen.tsx` and any test. No new tokens were needed.
