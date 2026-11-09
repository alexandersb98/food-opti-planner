# Recipe import test data

Input to `scripts/compare_models.py` and to the data tests.

- `catalog.json`: the user's ingredient catalogue shown to the model
  (`name`, `unit`, `conversion_units`).
- `factors.json`: unit-factor cases (`ingredient`, `unit`, `food`, `expected`);
  a model's answer counts as right within 25 % of `expected`.
- `recipes/<id>.txt`: the source text a user would paste or a page would give.
- `recipes/<id>.expected.json`: the hand-written draft the model should
  produce, in the wire shape of `server/ai/schema.py` (`DRAFT_SCHEMA`).

Add a recipe: write `<id>.txt` and `<id>.expected.json` (prefix `sv-` or `en-`
for the language), copy every line's `original_text` verbatim from the text,
use only catalog names or `null` for `match`, and update the list of ids in
`tests/server/test_ai_testdata.py`.

All texts are original, written for this repository. Do not paste recipes from
cookbooks or websites here.
