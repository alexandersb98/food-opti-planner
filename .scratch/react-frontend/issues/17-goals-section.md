# 17: The goals section of the brief

**What to build:** Section 2 of the brief writes each goal as a sentence ("Between 1 500 and 2 000 kcal energy, as a daily average"), marked Must or Prefer with Prefer's importance as dots (or its importance below and above the range when they differ), showing a goal's name when it has one, and marking goals in the last clash in the warning colour with "In the clash" for screen readers. It explains Must and Prefer, says what happens with no goals, and disables "Add goal" with "Add an attribute first" when there are no attributes.

Spec: "Implementation Decisions › Specific interactions" (Clash: the brief's goals are marked from the same clash); stories 44–49, 59.

- Sentences from the pure goals module through the translator; the clash from the solve store (ticket 06).
- Each goal is a button and "Add goal" a button; both call an `onOpenGoal(goal | null)` the goal sheet (ticket 18) will use; until then they do nothing visible.
- Edits only section 2's own file (README Conventions).
- Parity checklist: the Vue `GoalsCard` tests and the goal-sentence cases of the goals module tests.

Blocked by: 14

Status: done

- [x] App tests: sentences for min-only, max-only, range, each scope; Must vs Prefer with dots and split importance; goal name shown; clash marking (visible and "In the clash" text); empty state; Add goal disabled without attributes
- [x] Applied the frontend-design, react-best-practices and web-design-guidelines skills (`.claude/skills/frontend-design/`, `.claude/skills/react-best-practices/`, `.claude/skills/web-design-guidelines/`, read each SKILL.md) and fixed what they flag
- [x] Playwright screenshots (ticket 03's kit) at 390 × 844 and 1280 × 800, paper and evening editions, compared by eye with D2 `#plan` section 2; differences and decisions noted under `## Comments` (screenshots not committed)
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`

## Comments

- **Files.** `web/src/app/pages/brief/GoalsSection.tsx` (section 2), `goals-section.css` (prefix `goals-`), `GoalsSection.test.tsx` (app tests, own file so 15/19/20 don't conflict on `Brief.test.tsx`). One line in `Brief.tsx`: `<GoalsSection plan={plan} attributes={page.data.attributes} />`.
- **Pure sentence.** `goalSentence(goal, attribute, t)` and `figureText(value)` added to `web/src/goals.ts` (tests in `goals.test.ts`). It returns `{ key, named: { lead, amount, attribute, scope } }` so a page can set the amount in bold and the attribute in small caps with `richText`, and `t(key, named)` reads it whole. Bounds may be `null` or '' (a draft): without bounds it says "No limit yet on energy, each day". Ticket 18 should use it for the sheet's live preview.
- **Figures.** Shown as stored (decimals kept, as the Vue card), the whole part grouped from four digits with a narrow no-break space (U+202F): "1 500", as the spec's story 44. D2 uses en-GB commas ("1,500").
- **Messages.** New keys `goals.sentence.*` and `goals.section.*` (add, edit, inClash, empty, intro); "Must" and "Prefer" and the importance readings reuse `goals.must`, `goals.prefer`, `goals.importanceOf`, `goals.importanceSplit`, and `goals.addAttributeFirst`. D2 says "Preferred"; the spec's stories say Prefer, so Prefer.
- **For ticket 18.** `GoalsSection` holds `const [, openGoal] = useState<GoalToOpen>(null)`; each goal calls `openGoal({ goal })`, "Add goal" calls `openGoal({ goal: null })`. Name the first element and render the sheet from it (close with `openGoal(null)`). The plan comes as a prop from the store-backed brief, so a saved goal shows at once.
- **Clash.** From the solve store's `clash` through `clashRows`/`clashingGoalIds` (Must goals still in the setup), so it clears with `solve.dismiss()` and a new solve. Marked goal: rule and Must tag in `--accent`, the sentence in `--accent` with a dagger (the Menu's miss mark), and a visually hidden "In the clash:" starting the button's name.
- **Accessible names.** Spaces (`{' '}`) between the tag's parts so the button reads "Prefer Importance 4 of 5 Protein floor At least 120 g protein, each day." instead of run-together words; "Edit" is `aria-hidden` as in D2. A split importance is one `role="img"` ("Importance 2 of 5 below the range, 5 of 5 above") holding two dot groups and a slash.
- **Name.** A goal's typed name sits in the tag line after the dots, in serif ink-2, cut with an ellipsis when long; the sentence still says what it tracks (D2 has no names).
- **Empty / no attributes.** Empty: D2's "No goals yet. Add one, or the planner only fills the schedule." between rules. No attributes: "Add goal" disabled (the text button primitive's .55 opacity) and "Add an attribute first" in italic under it, right-aligned, linked by `aria-describedby`.
- **Screenshots** (phone and desktop, paper and evening; normal, clash, named + split, empty) compared with `d2:plan` section 2: rule bars, Must block tag, Preferred dots, sentence type, small-caps attribute and Edit match. Differences: "Add goal" has no underline at rest (ticket 10's text button underlines on hover only, D2 always); grouping by narrow space instead of commas.
