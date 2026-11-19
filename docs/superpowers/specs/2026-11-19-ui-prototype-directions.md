# UI prototype directions

* **Author:** Alexander Simola Bergsten
* **Date:** 2026-11-19
* **Prototypes:** [`prototypes/`](../../../prototypes/README.md)

## Overview

The web app works but looks basic, and the side-panel navigation feels wrong on a
phone. This note records the ideas weighed for a new look and the three that were
built as throwaway prototypes.

The target is one person (the owner) on a phone, on the couch, planning the coming
week. The prototypes cover the three most-used screens: the Plan page (schedule,
goals, recipe filters, Make plan), the Results page and the recipe editor. Other
pages may be added or merged if a direction needs it.

## Constraints

* Phone first. A web app, not a native app. Any framework is allowed for the final
  build; the prototypes are plain HTML, CSS and a little JavaScript with no build
  step, so they open straight from disk.
* English text only in the prototypes. Language switching must still be possible
  in the final app, so layouts leave room for longer Swedish labels.
* Offline use matters in the final app where it makes sense (reading the week and
  recipes). The prototypes do not try to show it.
* Made-up data from `prototypes/shared/data.js`. The focus is UI and UX, not the
  numbers.
* No side panel. No direction uses a bottom tab bar either: a tab bar in all three
  would make them differ only in colour.

## Directions considered

### A. The week is the app (built)

The home screen is the week: a horizontal strip of seven days, each holding its meals
as small cards. Tap a day to open it. Goals sit as rings at the top. Make plan is one
large button, and results fill the week in place instead of opening a separate page.
There is no menu: the catalogue is reached from a search sheet pulled down from the
top.

* Draws on calendar apps and stacked-card drill-down navigation.
* Risk: recipe editing and settings move out of sight. That may feel hidden if
  recipes are edited often.
* Uses the visual style of B (tiles of different sizes) for its summary.

### B. Bento dashboard (folded into A)

A home screen of tiles of different sizes (goal hit rate, today's meals, the next
step, saved plans), the biggest for the most important number.

* Rejected as its own prototype: sources warn the style dates fast, and a
  dashboard shows things more than it helps do them. On its own it is a look, not
  a structure, so it became A's visual language.

### C. Planning as a conversation (built)

Make plan becomes a thread stepped through: "Which days?", "Any goals to change?"
with tappable chips and sliders, "Which recipes this week?", then "Here's your
week" as a card that can be adjusted and saved. Built from a fixed set of cards,
not free-text chat.

* Draws on generative-UI patterns where a planning flow is a closed catalogue of
  cards in a thread.
* Fits the existing AI recipe import.
* Risk: slow for changing one number, and a chat layout is wrong for the recipe
  editor. It needs a plain "edit directly" way in beside the thread.
* Includes E as the recipe step.

### D. Editorial / cookbook (built)

A magazine look: large type, generous spacing, recipes as the main feature. The
results read as a restaurant menu for the week, with nutrient numbers as small
notes in the margin.

* Answers "boring" most directly.
* Risk: there are no food photos, so it must work with type and colour only. Dense
  goal editing may sit badly inside a menu look.

### E. Swipe deck (folded into C)

Swipe through recipes: right for "yes this week", left for "not this week", to set
which recipes the planner may use.

* Rejected as its own prototype: it covers recipe filters only, not goals or the
  schedule, and is tedious with a large library. It became the recipe step in C.

## Decision

Build A, C and D. They differ in structure, not just colour: A arranges the week in
space, C walks through steps, D is a menu to read. B is A's visual style, E is a
step in C.

## What to compare when trying them

* How fast can the week be set up and a plan made from a cold start?
* Can a single goal be changed in under three taps?
* Is it clear what the plan missed and why?
* Is the recipe editor comfortable on a phone (adding a line, changing a unit)?
* Which one still feels pleasant after the novelty wears off?

## Sources

* [NN/g, mobile navigation patterns](https://www.nngroup.com/articles/mobile-navigation-patterns/)
* [O'Reilly, mobile navigation](https://www.oreilly.com/content/how-to-enhance-the-navigation-experience-on-mobile-devices/)
* [Bento grid layouts (studiomeyer)](https://studiomeyer.io/en/blog/bento-grid-layouts.md)
* [daisyUI, editorial UI trends](https://trends.daisyui.com/editorial-art-inspired-ui/)
* [CopilotKit, generative UI patterns](https://copilotkit.ai/generative-ui)
* [VGV, generative UI wizard](https://verygood.ventures/blog/generative-ui-flutter-wizard-gcn/)
* [Screensdesign, recipe app examples](https://screensdesign.com/articles/recipe-app-design-examples/)
