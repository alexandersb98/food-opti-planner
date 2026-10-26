# GUI — Results Screen, Saved Plans and Stopping a Solve

**Status:** Agreed with the user section by section; awaiting spec
review.

**Path:** Architectural (new screen, new tables, a library change).

**Context:** The GUI spec
([`2026-10-21-gui-wireframes-design.md`](2026-10-21-gui-wireframes-design.md))
left the results screen undesigned, and the slices plan
([`../plans/2026-10-22-gui-slices.md`](../plans/2026-10-22-gui-slices.md))
requires it before slice 7. This spec designs it, and adds three things
the user asked for along the way: saving plans, a Today card on the
Plan page, and stopping a running solve. It changes the stack spec
([`2026-10-22-gui-tech-stack-design.md`](2026-10-22-gui-tech-stack-design.md)),
which said plan results are not stored.

Screen ids follow the GUI spec; the results page is **R1**.

## Decisions

1. **Plans can be saved.** A new plan is shown with **Save** and
   **Discard**. Saved plans are listed on the Plan page and can be
   deleted.
2. **A saved plan is a frozen copy.** It keeps its own copy of what
   was planned: meal names, recipe names, portions, the scaled
   ingredients, the attributes and every total (and, from slice 8, its
   goals and misses). Later edits or deletes in the catalog never change
   it, and a saved plan never blocks a delete.
3. **One unsaved plan is kept on the server** until the user saves or
   discards it, or makes another plan (which replaces it). Leaving the
   page or reloading loses nothing, so there is no "are you sure?" when
   leaving. A solve that finishes after the user left the page still
   becomes the unsaved plan.
4. **Today's meals come from one saved plan:** among the saved plans
   whose dates cover today, the one with the latest *chosen at* time.
   *Chosen at* is set when a plan is saved and again when the user taps
   **Use for today** on it. So the newest saved plan wins by default,
   and the user can switch back to an older one. "Today" is the
   browser's local date.
5. **Saved plans and Today live on the Plan page (A1).** The menu keeps
   its five entries.
6. **A meal shows recipe and portion; tapping it shows the scaled
   ingredients** and the meal's totals.
7. **Totals:** a Summary card on top with each attribute's plan total
   and daily average; each day shows a short line with the attributes
   that have goals.
8. **Missed Prefer goals** (from slice 8) are listed in the Summary,
   one row per goal, and marked on the days they were missed.
9. **Days are a carousel:** one day at a time, swipe right-to-left for
   the next day, with a **Today** button to jump back.
10. **A running solve can be stopped.** **Cancel** ends the search and
    keeps the best plan found so far, like when time runs out. This
    needs a library change (see "Stopping a solve") and gets its own
    slice, 7a.
11. **Solving shows a progress card**, not a full-screen wait: the rest
    of the Plan page stays usable.

## A1 · Plan page, additions

From top to bottom. The existing cards (Schedule, Goals, Recipes, Max
solving time) and the fixed **Make plan** button are unchanged.

```
┌──────────────────────────────────┐
│ ≡  Plan                          │
├──────────────────────────────────┤
│ Making plan…                     │  only while solving
│ ███████░░░░░░░░░  12 of 30 s     │
│                       [ Cancel ] │  from slice 7a
├──────────────────────────────────┤
│ New plan, not saved              │  only if one exists
│ Mon 21 – Sun 27 Oct · Best plan  │
│                         [ Open ] │
├──────────────────────────────────┤
│ Today · Tue 22                   │  only if a saved plan
│ Breakfast  Oat porridge · 1 ×    │  covers today
│ Lunch      Chili · 1.5 ×         │
│ Dinner     skipped               │
├──────────────────────────────────┤
│ Schedule …                       │
│ Goals …                          │  existing cards
│ Recipes …                        │
│ Max solving time …               │
├──────────────────────────────────┤
│ Saved plans                      │
│ Mon 21 – Sun 27 Oct      [Today] │
│   saved Sun 20, 18:04            │
│ Mon 14 – Sun 20 Oct              │
│   saved Sat 12, 09:30            │
├──────────────────────────────────┤
│          [ Make plan ]           │  fixed
└──────────────────────────────────┘
```

- **Making plan…** appears while a solve runs: a bar filling towards
  Max solving time, the elapsed seconds and, from slice 7a, **Cancel**.
  **Make plan** is disabled meanwhile. The bar is driven by the
  browser's clock; the server reports nothing while solving.
- **Couldn't make a plan** takes the same place after a solve that
  produced no plan, and can be dismissed:
  - time ran out with no plan: "No plan found within 30 s. Try a
    longer Max solving time.";
  - cancelled with no plan (slice 7a): "Stopped before any plan was
    found.";
  - infeasible: in slices 7–10, "No plan possible with these
    settings."; slice 11 replaces this with the A5 card.

  A failed solve is not stored and leaves an existing unsaved plan
  alone.
- **New plan, not saved:** its dates and status; **Open** goes to R1.
- **Today:** the date and today's meals from the plan used for today
  (decision 4). Tapping a meal opens that plan on R1 at today, with the
  meal open. Hidden when no saved plan covers today.
- **Saved plans:** newest saved first. A row shows the dates and when it
  was saved; the plan used for today has a **Today** chip. Plans have
  no name. Tapping a row opens R1. The card is hidden while there are
  none.

## R1 · Results page

Routes: `/plans/new` for the unsaved plan, `/plans/:id` for a saved
one. Both show the same page; only the actions differ.

```
┌──────────────────────────────────┐
│ ←  Mon 21 – Sun 27 Oct           │
│    Best possible plan            │
├──────────────────────────────────┤
│ Summary                          │
│ Energy    13 650 kcal · 1 950/day│
│ Protein      798 g  ·  114 g/day │
│ Fat          462 g  ·   66 g/day │
│ Carbs      1 610 g  ·  230 g/day │
│ Cost         714 kr ·  102 kr/day│
│ Show all 12                      │
│ Missed goals                     │  from slice 8
│ Protein per day · below on 2 days│
│   worst Tue 22: 98 of 120 g −18% │
├──────────────────────────────────┤
│  ‹   Tue 22 · 2 of 7   ›  [Today]│
│ ┌──────────────────────────────┐ │
│ │ 1 900 kcal · 98 / 120 g prot │ │  tap: all attributes
│ │ Breakfast  Oat porridge · 1 ×│ │
│ │ Lunch      Chili · 1.5 ×   ▾ │ │
│ │   Beans          270 g       │ │  opened meal
│ │   Tomatoes       300 g       │ │
│ │   640 kcal · 38 g protein …  │ │
│ │ Dinner     skipped           │ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│   [ Discard ]       [ Save ]     │  unsaved plan
└──────────────────────────────────┘
```

### Header

The dates and a status line:

| Library | Shown |
|---|---|
| `OPTIMAL` | "Best possible plan" |
| `FEASIBLE`, time ran out | "Time ran out: may not be the best plan" |
| `FEASIBLE`, cancelled (slice 7a) | "Stopped early: may not be the best plan" |

`INFEASIBLE` and `TIMEOUT_NO_SOLUTION` have no plan, so they never reach
R1 (see "Couldn't make a plan" above).

### Summary card

- One row per attribute, in the attributes' order: the plan total and
  the daily average, with the attribute's unit and decimals.
- More than 5 attributes: the card starts collapsed, showing the first
  5 rows and **Show all N**; **Show fewer** collapses it again.
- **Missed goals** (from slice 8): always shown, also when collapsed.
  One row per goal that was missed: the goal's name, the side and how
  many days ("below on 2 days"; "above, whole plan" for a plan-scope
  goal), and the worst miss with bound, actual and percentage. With
  goals and no misses: "All goals met". Without goals: not shown.

### Days

A carousel (Quasar `QCarousel`, swipeable), one day per card.

- Swiping right-to-left shows the next day, left-to-right the previous
  one. **‹ ›** arrows do the same for those who don't swipe.
- Above the card: the day label and its position ("Tue 22 · 2 of 7").
- R1 opens on today when the plan covers today, otherwise on its first
  day. A **Today** button shows next to the arrows when the plan covers
  today and another day is shown; it jumps back to today.
- **The day's line:** the totals of the attributes that have a goal.
  Until slice 8 there are no goals, so it shows the first three
  attributes. A missed value is shown in a warning colour with its bound
  ("98 / 120 g"). Tapping the line shows every attribute for the day.
- **Meals**, in the schedule's order, by meal name:
  - planned: "Chili · 1.5 ×". Tapping it opens the ingredients scaled
    to the portion, in each ingredient's unit ("Beans 270 g"), and the
    meal's totals;
  - skipped: "skipped", both for a meal skipped in the schedule and for
    one the planner left out because the day's "At least" allowed it.

### Actions

- **Unsaved plan:** **Save** (the plan joins Saved plans, decision 4,
  and the app returns to the Plan page) and **Discard** (asks first,
  then deletes it and returns).
- **Saved plan:** **Use for today**, only when the plan covers today and
  is not already the plan used for today, and **Delete** (asks first).

## Storage

New tables in slice 7, all cascading from `plan_results`. Nothing in
them refers to the catalog tables, so no catalog delete is ever blocked
and nothing cascades into a saved plan.

| Table | Columns |
|---|---|
| `plan_results` | id, saved (yes/no), created at, chosen at (saved plans only), start date, number of days, status (`optimal` / `time_ran_out` / `stopped`) |
| `plan_result_attributes` | plan result, position, name, unit, decimals |
| `plan_result_meals` | plan result, day (0-based), position, meal name, planned (yes/no), recipe name, portion |
| `plan_result_meal_items` | meal, position, ingredient name, unit, amount (scaled to the portion) |
| `plan_result_totals` | plan result, attribute, value, and either a meal, a day, or neither (whole plan) |

Slice 8 adds `plan_result_goals` (name, attribute, scope, Must/Prefer,
min, max) and `plan_result_misses` (goal, day or whole plan, side,
bound, actual, amount, percent).

- There is at most one row with saved = no.
- Numbers are `NUMERIC`, like the catalog.
- The library gives each meal's, each day's and the whole plan's
  totals; they are stored as returned, not added up again. The scaled
  ingredient amounts are the recipe's amounts × the portion, worked out
  by the server from the recipes it solved with.
- Day labels ("Tue 22") are worked out from the start date, as in A2.

## API

| Endpoint | For |
|---|---|
| `POST /api/plan/solve` | Solve. A plan is stored as the unsaved plan (replacing the old one) and returned in full. No plan: the reason is returned and nothing is stored. |
| `GET /api/plan-results` | The unsaved plan (if any) and the saved plans, without their days, for A1. |
| `GET /api/plan-results/today?date=YYYY-MM-DD` | The plan used for that date, with that day's meals (decision 4); empty if none. |
| `GET /api/plan-results/{id}` | One plan in full, for R1. |
| `POST /api/plan-results/{id}/save` | Save the unsaved plan; sets chosen at. |
| `POST /api/plan-results/{id}/use-for-today` | Set chosen at to now. |
| `DELETE /api/plan-results/{id}` | Delete a saved plan or discard the unsaved one. |
| `POST /api/plan/solve/cancel` | Slice 7a: stop the solve named by `solve_id`. |

## Stopping a solve (slice 7a)

- **Library:** a way to stop a running solve from another thread, for
  example a stop handle passed to `plan()` whose `stop()` calls CP-SAT's
  `stop_search()`. A stopped search returns what it has: the best plan
  found (`FEASIBLE`) or none (`TIMEOUT_NO_SOLUTION`), exactly as when
  time runs out, so the result types do not change. The stop must also
  end the extra solves that look for a minimal clash after an
  infeasible result. The exact interface is for slice 7a's plan.
- **Server:** the solve request keeps the running solve's stop handle;
  `POST /api/plan/solve/cancel` stops it. One solve at a time: a second
  `POST /api/plan/solve` while one runs is a 409. This works because
  Cloud Run is limited to one instance. The solve request then stores
  and returns the result as usual, with status `stopped`. Both requests
  carry a `solve_id` the app makes, so a Cancel names the solve it
  means: the server may not have that solve yet (and then stops it as it
  starts), and a Cancel that crosses the answer must not stop the next
  solve.
- **App:** **Cancel** on the Making plan… card. The plan found opens as
  usual; with none, the Couldn't make a plan card says so.

## Changes to other documents

- **Slices plan:** slice 7 adds saved plans, the Today card and R1;
  new slice 7a "Stop solving" between 7 and 8, with an exception to the
  rule that `meal_planner/` is not changed; slice 8 adds goals and
  misses to the frozen copy and the Missed goals display; the "Before
  slice 7" section points here.
- **Stack spec:** "Plan results are not stored" and "Not in this spec:
  the results screen, several saved plans" point here.

## Not in this spec

- Naming, editing or re-solving a saved plan.
- Swapping one meal in a plan.
- A shopping list from a plan (`future-features.md`).
- Progress reported by the solver while it runs (the bar is time only).

## Defaults chosen without a user decision

Proposed in the sections the user accepted, not discussed further:

- The Summary collapses at more than 5 attributes and Missed goals stay
  visible when it is collapsed.
- Until slice 8, the day line shows the first three attributes.
- Plans opened without today start on their first day, with no button
  back to it.
- Saved plans have no name; dates and saved time tell them apart.
- A failed solve is not stored and leaves the unsaved plan alone.
- One solve at a time; a second one is refused.
