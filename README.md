# Meal Plan Optimizer

An optimization-based meal planning tool: give it a set of foods and a
set of constraints (nutrient targets, budget, etc.), and it lays out a
multi-day eating plan that satisfies them as well as possible. When
constraints conflict, it finds a good-enough compromise instead of
failing outright.

**Status:** Early design phase. No implementation yet — the core
optimization logic is being designed before any UI is built.

See [`docs/superpowers/specs/2026-09-15-meal-optimizer-design.md`](docs/superpowers/specs/2026-09-15-meal-optimizer-design.md)
for the design notes and decisions made so far,
[`docs/superpowers/specs/future-features.md`](docs/superpowers/specs/future-features.md)
for deferred features and alternatives considered, and
[`docs/superpowers/specs/open-questions.md`](docs/superpowers/specs/open-questions.md)
for holes/open questions found in review that still need resolving.
