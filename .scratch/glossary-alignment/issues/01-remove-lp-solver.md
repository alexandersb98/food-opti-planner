# 01: Remove the unused `lp_solver/` sample

**What to do:** Delete the standalone `lp_solver/` sample app. Nothing in the meal planner uses it, and it adds noise when reading the codebase or building the glossary.

Status: ready-for-agent

- [ ] Delete `lp_solver/` and `tests/test_lp_solver.py`
- [ ] Remove the `lp_solver/` section from `README.md` and its line in `.dockerignore`
- [ ] Leave the dated specs and plans in `docs/superpowers/` as they are (they are history)
- [ ] Python tests pass
