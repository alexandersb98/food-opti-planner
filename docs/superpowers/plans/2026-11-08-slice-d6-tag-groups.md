# Slice D6 — Tag Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** On the Tags page (C6) a tag's editor gets **Equivalent tags**: the
other members of its tag group as removable chips and a picker to add a tag.
Tags in one group are filtered as one: "Only Fish" also keeps recipes whose
ingredients carry only Seafood or only Fisk och skaldjur. A tag is in at most
one group, all tags of a group share one derive rule, a group left with one tag
disappears, and deleting a tag takes it out of its group first. Three questions
guard the changes that touch other tags (move a tag from another group, switch
an added tag's rule, change the rule of a tag already in a group); the server
answers 409 with the facts and the app asks. When the server builds the
`PlanRequest` every group becomes one library tag with the group's rule, for
ingredients, recipes' extra tags and the Only and Never filters, and the
recipe-count endpoint uses the same translation. The screens keep showing the
members themselves.

**Architecture:** Three small pieces. A `tag_groups` table and `tags.group_id`
(migration `0014`). A translation change that stays inside `server/translate.py`:
one new function, `library_tags`, answers "which library name does each stored
tag go by, and which library tags exist"; `plan_request` and `usable_recipes`
use it, so `solve.py` and `plan.py`'s `recipe_count` keep calling the same
functions with member names and need no change beyond tests. The group editing
rules (what a change to a tag's equivalents means, which questions it raises,
applying it, dissolving small groups) are one new module `server/tag_groups.py`
that `server/api/tags.py` calls from `update_tag` and `delete_tag`. The app
mirrors this on `TagsPage.vue`: a draft list of equivalent ids, chips and a
picker, and one new component, `TagGroupQuestions.vue`, that asks the questions
of a 409 one by one.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic; Vue 3, Quasar, vue-i18n,
Vitest, Playwright.

**Specs:** the data source spec
[`2026-11-03-ingredient-data-sources-design.md`](../specs/2026-11-03-ingredient-data-sources-design.md)
(decisions 12-14; "Tags and tag groups"; "API", the `PUT /api/tags/{id}` row
and "Tag responses gain `source` and `group`"; "Errors", the 409 row;
"Testing", tag groups and translation); slice D6 and the rules of
[`2026-11-08-units-sources-import-slices.md`](2026-11-08-units-sources-import-slices.md);
screen C6 in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md).
Interfaces of the slice this one needs:
[`2026-11-08-slice-d2-reference-copy.md`](2026-11-08-slice-d2-reference-copy.md)
(source tags, `Tag.source_id`, the `source` field of tag responses, the
`source_tag` refusals, TagsPage's source tag rows).

**Status:** Built and reviewed task by task on branch
claude/implement-remaining-slices-qwrp83.

## Global Constraints

- `meal_planner/` is not changed.
- Ships Alembic migration `0014` (revision `0014`). D2 took `0010`, D3 `0011`,
  D4 `0012`; D5 may have taken `0013`. **Before writing it, read
  `server/migrations/versions/` and set `down_revision` to the real head**;
  if D5 did not use `0013`, `0013` is still free and this migration may
  take the next free number instead (keep the file name and revision equal). The
  migration test (`tests/server/test_migrations.py`) stays green.
- API tests run on SQLite and, in CI, on Postgres: no SQLite-only SQL.
- All GUI text goes through vue-i18n, English file only
  (`web/src/i18n/en.json`).
- After each task that changes the API (Task 3): `npm run gen:api` in `web/`
  (regenerates `web/openapi.json` and `web/src/api/schema.ts`;
  `web/src/test-units.json` should come out unchanged), then fix the factories
  in `web/src/test-data.ts` so `npm run typecheck` stays green.
- The Playwright flow gets a step (Task 5).
- No test calls the internet or a real AI service. Tests that need source tags
  use D2's fixture source (`testsource`; source tags `TEST Grains` and `TEST
  Dairy`, both rule "any") through D2's `data_client` fixture.
- **D2 to D5 are planned but not yet built when this plan was written.** This
  plan names their code by the planned names (`Tag.source_id`, `Tag.source`,
  the `source` field and `TagSource` model in `server/api/tags.py`,
  `data_client`, `TagsPage.vue`'s source tag rows with their
  `tags.sourceTagNote`). **Before starting each task, re-read the built code that task
  touches** (`server/models.py`'s `Tag`, `server/api/tags.py`,
  `server/translate.py`, `tests/server/conftest.py`, `web/src/pages/TagsPage.vue` and its test, `web/src/test-data.ts`,
  `web/e2e/catalog.e2e.ts`'s last steps and the state they leave) and adapt;
  where this plan and the built code disagree on a name, the code wins; on a
  behaviour the plan wins.
- Checks before each commit: `python3 -m pytest -q` at the root; `npm run lint`,
  `npm run typecheck`, `npm test` in `web/`.

## Interpretations made in this plan

1. **Schema.** `tag_groups`: only `id` (a group has no name and no rule of its
   own, decision 13). `tags.group_id`: nullable FK `tag_groups.id`, `ON DELETE
   SET NULL`, indexed; the FK is named (`fk_tags_group_id_tag_groups`) so SQLite's
   batch migration can create it. Model: `TagGroup` (before `Tag`), `Tag.group_id:
   Mapped[int | None]`. No relationship is needed: members are found by
   `group_id`. A comment on `group_id` quotes decisions 13 and 14.
2. **The rule lives on the tags, not the group.** Decision 14 says all tags of a
   group share one rule. Storing it on each tag (the column that exists) and
   keeping the members equal, in `tag_groups.py` only, avoids a second source of
   truth for the 20 places that read `tag.derive`. The translation takes the
   first member's rule; a test checks the invariant after every kind of change.
3. **`group` on the tag response** is the ids of every member of the tag's group,
   itself included, in id order; `[]` for a tag in no group. (The editor shows
   `group` minus the tag itself as chips.)
4. **Request.** `PUT /api/tags/{id}`'s body is `TagUpdate`: `TagFields` plus
   `equivalent_tag_ids: list[int] | None = None` and `confirm: bool = False`.
   `equivalent_tag_ids` is the **complete** list of the tag's other group
   members as the user wants them; `None` (an old client, or a change of name
   only) leaves the group alone. `POST /api/tags` is unchanged: a new tag has no
   group; the editor shows **Equivalent tags** only for an existing tag, so
   a new tag is saved first and made equivalent by opening it again.
5. **What a change means.** Let *C* be the tag's current other members and *D* the
   wanted ones (`D = C` if `None`). `C - D` leave the group. Each tag in
   `D - C` joins: free tags join at once; a tag in **another** group moves from it
   (question 1); the group is created if the tag had none. Final rule = the
   body's `derive`. An added tag whose rule differs from it is switched
   (question 2). If `derive` differs from the tag's stored rule and `C & D` is
   not empty, every member stays and all change (question 3); if no old member
   stays, the tag simply takes the rule and there is no question. Afterwards
   every group with fewer than two tags is deleted. A tag moved out of another
   group leaves its old group with the rest, deleted if one is left. Source
   tags are members like any other (their rule may change, decision 12).
6. **409 body and `confirm`.** A request that needs answers and has no `confirm`
   changes nothing and answers `409` with body `{"questions": [...]}` listing
   **every** question the request raises (not only the first), so a single
   `confirm: true` can never approve a question the user was not shown. A
   question is facts, not text, the app words it:
   - `{"type": "move_tag", "tag_id": X, "from_tag_ids": [...]}`: the other members
     of X's old group, in id order (X excluded);
   - `{"type": "switch_rule", "tag_id": X, "tag_rule": "any", "group_rule": "all"}`;
   - `{"type": "change_rule", "tag_ids": [...], "rule": "all"}`: the tag and every
     member that stays, in id order.

   With `confirm: true` the server applies the whole request. The app only sends
   `confirm: true` for the exact body that got the 409 and only when the user
   said yes to every question; on a no it changes the draft (below) and sends it
   again without `confirm`. The existing 409 `name_in_use` keeps its own body
   (`{"detail": [...]}`), so a client tells them apart by the `questions` key;
   the route's OpenAPI 409 lists both bodies.
7. **Errors in the list.** An id that names no tag: 422 `unknown_tag` on
   `["body", "equivalent_tag_ids", i]`; an id given twice: 422 `duplicate`; the
   tag's own id: 422 `own_tag` (its group always includes it). These use the
   existing `References` helper in `server/api/catalog.py`.
8. **Deleting** a tag (`DELETE`) calls the same "leave the group" step first,
   then deletes it; a group left with one tag is deleted. No question: deleting
   was already confirmed, and the others stay equivalent (decision 13).
   The delete warning's counts are unchanged.
9. **Translation (`server/translate.py`).** `library_tags(tags) -> LibraryTags`, a
   frozen dataclass: `names: dict[str, str]` (a stored tag's name to its
   library name; a tag in no group maps to itself), `defs: tuple[TagDef, ...]`
   (one per ungrouped tag in tag order, then one per group in group-id order),
   and `def of(self, names)`/`map(self, names) -> frozenset[str]` for a set of
   stored names. A group's library name is `f"group {group_id}"` and, while some
   stored tag has that name, `*` is appended, so it can never clash (spec). Its
   rule is its members' rule (interpretation 2).
   - `ingredient(row, names=None)` and `recipe(row, names=None)` map tag names
     through `names` (identity when `None`: `recipes.py`'s `derived_tag_ids` and
     the existing tests keep using the stored names, which is right: the
     screens show members).
   - `plan_request` builds `library_tags(tags)` once and gives its `defs`,
     mapped ingredient and extra tag names, and mapped `require_tags` /
     `exclude_tags` (from `filter_names`, still the members' names) to the library.
   - `usable_recipes(recipes, tags, only, never)` keeps its signature and maps
     recipes' tags and the two sets the same way, so `solve.py` (`_read`) and
     `plan.py` (`recipe_count`) need no code change; Task 2 only adds tests there.
   - Only X and Never Y with X and Y in one group become one tag in both sets: no
     recipe passes, which is what the user asked for ("no_usable_recipes",
     "0 of N").
10. **A recipe's derived tags** (`derived_tag_ids`, shown on C2) stay per member,
    as the spec says ("the screens keep showing the members"); unchanged.
11. **Tag lists elsewhere** (ingredient and recipe tag pickers, recipe filters)
    are unchanged and list every tag; a group is only visible on C6 (chips and
    the row caption "equivalent to ...").
12. **The app's answers to a no.** Question 1 or 2 answered no: that tag is
    taken out of the draft's chips ("No means it isn't added"). Question 3 answered
    no: the draft's rule goes back to the tag's stored rule. Then the draft is
    saved again (it may raise the remaining questions). Each no removes a chip or
    reverts the rule, so this ends.

13. **Interpretations made while building.** (a) The migration is `0013`
    (`0013_tag_groups.py`, `down_revision = "0012"`), as D5 used no number; the
    text above says `0014` where it was written before. (b) `Catalog.group(tag,
    *others)` is a method of the `Catalog` helper (it has the client), not a
    function taking the client. (c) `TagGroupQuestions` emits `answer` with a
    plain `boolean[]` (yes per question, in order) instead of `{yes}` objects,
    and its dialog is `persistent` so a question can't be dismissed unanswered.
    (d) `LibraryTags` has `names`, `defs` and `map`; the plan's `of` was a typo
    for `map`. (e) After a save in a group (or a delete of a grouped tag) the page
    reads `GET /api/tags` again without the list's loading state (`refresh`), so
    the list does not flash. (f) A rule change of a grouped tag sent with
    `equivalent_tag_ids` null still raises the `change_rule` question, as every
    member stays. (g) The generated TypeScript types make `confirm` required, so
    the app sends `confirm: false` when it saves a tag. (h) The 409 `switch_rule` text
    uses the existing `tags.derive.*` phrases ("any ingredient has it") for the
    tag's rule and `tags.group.ruleWord.*` for the group's.

## File structure

Server: `server/models.py` (`TagGroup`, `Tag.group_id`),
`server/migrations/versions/0014_tag_groups.py`, `server/translate.py`,
`server/tag_groups.py` (new), `server/api/tags.py`. Tests:
`tests/server/test_translate.py`, `test_tags.py`, `test_tag_groups.py` (new),
`test_plan.py` (recipe count), `test_solve.py`, `test_delete_cascades.py`,
`test_openapi.py` if it lists responses. Web: `web/src/pages/TagsPage.vue`
(and test), `web/src/components/TagGroupQuestions.vue` (new, and test),
`web/src/api/types.ts`, `web/src/test-data.ts`, `web/src/i18n/en.json`,
`web/e2e/catalog.e2e.ts`. Docs as Task 6.

## Task 1: Server: the table, the column, the migration

**Files:** modify `server/models.py`; create
`server/migrations/versions/0014_tag_groups.py`; modify
`tests/server/test_delete_cascades.py` (or the nearest model test).

- `class TagGroup(Base)`: `__tablename__ = "tag_groups"`, `id` primary key,
  docstring "A set of equivalent tags (decision 13 of the data source spec);
  it has no name and no rule of its own".
- `Tag.group_id: Mapped[int | None] = mapped_column(ForeignKey("tag_groups.id",
  ondelete="SET NULL"), index=True)` with the comment of interpretation 1. Keep
  D2's `source_id` as built.
- Migration: `op.create_table("tag_groups", ...)`; `with
  op.batch_alter_table("tags")`: `add_column("group_id", Integer, nullable=True)`,
  `create_foreign_key("fk_tags_group_id_tag_groups", "tag_groups", ["group_id"],
  ["id"], ondelete="SET NULL")`, `create_index("ix_tags_group_id", ["group_id"])`.
  `downgrade` reverses in the opposite order. Index and constraint names must
  equal what the models' naming convention produces, or the migration test's
  `compare_metadata` reports a difference: read `server/models.py`'s `Base` for the
  convention and how `0003`-`0012` name theirs, and copy it.

**Tests (first):** the migration test (existing) fails before the migration
exists and passes after. Add one test: deleting a `TagGroup` row (through a
session) sets its tags' `group_id` to null and keeps the tags. (SQLite needs
`PRAGMA foreign_keys=ON`; read how `test_delete_cascades.py` and `server/db.py`
enable it and follow suit.)

**Verify:** `python3 -m pytest tests/server/test_migrations.py
tests/server/test_delete_cascades.py -q`, then the whole root suite. Commit:
"server: tag groups table and tags.group_id".

**Built.** Migration `0013`; the migration test and the new cascade test pass, as
does the whole root suite.

## Task 2: Server: translating tag groups for the planner

**Files:** modify `server/translate.py`, `tests/server/test_translate.py`,
`tests/server/test_plan.py`, `tests/server/test_solve.py`.

Build interpretation 9. `LibraryTags` and `library_tags` live in `translate.py`
(pure: model objects in, library objects out, no database).

**Tests (first), `test_translate.py`** (the file builds `models.Tag(...)` rows
without a database; set `group_id` on them directly):
- No group: `library_tags` maps every name to itself and `defs` equals the
  per-tag `TagDef`s in tag order (the existing behaviour, so the existing
  `plan_request` test still passes unchanged).
- A group of three (Fish, Seafood, Fisk och skaldjur, rule "any"): `names` maps
  each to `group 1`; `defs` holds one `TagDef("group 1", "any")` and no member;
  an ungrouped tag keeps its own def; the group rule is "all" when the members'
  is "all".
- Two groups get two names, by group id.
- The name is checked against stored names: a tag called `group 1` exists, so the
  group is `group 1*`; with `group 1*` also stored, `group 1**`.
- `ingredient(row, names)`: an ingredient carrying Seafood only has the tags
  `{group 1}`; carrying Fish and Seafood has the same single tag; an ungrouped tag
  stays. Without `names` it keeps its own names.
- `recipe(row, names)`: `extra_tags` mapped the same way.
- `plan_request`: its `tags` are the library tags (no member of a group), its
  `require_tags` and `exclude_tags` are the group's name for a filter on any
  member, an ingredient's tags are mapped, and `PlanRequest` builds without
  error (the library validates unknown tags).
- `usable_recipes` with a group: a recipe whose only ingredient carries Seafood
  passes "only Fish" and fails "never Fish"; a recipe with no member fails
  "only Fish"; "only Fish" with "never Seafood" leaves nothing.
- The group rule decides: with "all" a recipe with one ingredient that carries
  Seafood and one that carries none does **not** get the group tag, with "any" it
  does.

The API-level translation tests (recipe count, a real solve) need the `PUT` that
makes tags equivalent, so they are written in Task 3 with `Catalog.group`; no test
helper writes group rows around the API.

Because a library tag name is the stored name when no group applies, nothing
else in `server/` changes in this task: confirm with `grep -n "translate\."
server` that `solve.py` and `plan.py` still pass member names to
`usable_recipes`/`plan_request`, and say so in the commit body.

**Verify:** `python3 -m pytest tests/server/test_translate.py -q`, then the whole
root suite. Commit: "server: tag groups become one library tag".

**Built.** As written; `solve.py` and `plan.py` needed no change (checked with
grep). New translation tests.

## Task 3: Server: group editing in the tag API

**Files:** create `server/tag_groups.py`, `tests/server/test_tag_groups.py`;
modify `server/api/tags.py`, `tests/server/test_tags.py`,
`tests/server/test_plan.py`, `tests/server/test_solve.py`,
`tests/server/conftest.py` (`Catalog.group`, below), and the openapi test if it
checks the tag schemas.

**`server/tag_groups.py`** (no FastAPI; takes a `Session`): functions that
implement interpretations 2, 5 and 8:
- `plan_change(db, tag, derive, equivalent_ids) -> Change`: reads the groups,
  returns `Change` (leaving, joining, moving-from, rule changes: whatever
  `apply` needs) and `questions` (interpretation 6's three kinds, each a small
  frozen dataclass).
- `apply_change(db, tag, change)`: leaves, joins (creating a `TagGroup` when
  the tag has none), sets every affected tag's rule, flushes, then
  `dissolve_small_groups(db)`.
- `leave_group(db, tag)`: for delete; then `dissolve_small_groups`.
- `dissolve_small_groups(db)`: deletes every group with fewer than two members
  (clearing the lone member's `group_id` first).
- `members(db) -> dict[int, list[int]]`: group id to member ids in id order,
  for the response.

**`server/api/tags.py`:**
- `TagUpdate(TagFields)` with `equivalent_tag_ids` and `confirm` (interpretation
  4); `update_tag` takes it. `Tag` (response) gains `group: list[int]`
  (interpretation 3), filled from one `members` query per request (the list
  endpoint already loads every tag; make `_response` take the map, as it takes the
  counts).
- Order inside `update_tag`: 404; D2's source-tag rename refusal (unchanged);
  `References` checks (interpretation 7); `plan_change`; if `questions` and not
  `confirm`: answer 409 `{"questions": [...]}` (a `JSONResponse` or
  `HTTPException` with the dict as `detail` is not right, the body has no
  `detail`: use `JSONResponse`) and change nothing; else name/rule fields, then
  `apply_change`, then `commit_named` (a name clash still answers
  `name_in_use` and, as one transaction, changes no group either: roll back
  on the error, read `commit_named`). The answer is the updated tag.
- Pydantic models for the questions (`MoveTag`, `SwitchRule`, `ChangeRule`, a
  `Literal` `type` each) and `GroupQuestions(questions: list[...])`, a
  discriminated union on `type`, so the generated TypeScript types are exact.
  The route's `responses` lists 409 for both `FieldErrors` and `GroupQuestions`
  (`{409: {"model": FieldErrors | GroupQuestions, ...}}`; if FastAPI's
  OpenAPI rejects the union in `responses`, use a description plus `GroupQuestions`
  and keep `FieldErrors` in the shared description: check what `gen:api` then types).
- `delete_tag`: `leave_group` before deleting.

**`Catalog.group(client, tag, *others)`** in `conftest.py`: a helper that makes
tags equivalent through the API (`PUT` with the tag's name, rule and
`equivalent_tag_ids`, `confirm: true`), answers the 200 body. Using the API means
all later tests also exercise the endpoint.

**Tests (first), `test_tags.py`:** a tag answers `group: []`; the response and
list fields; `equivalent_tag_ids: null` and a name-only `PUT` leave a group alone;
unknown id, duplicate and own id are 422 with the types of interpretation 7
(and nothing changes); the rule can still change for a tag in no group without
a question.

**`test_tag_groups.py`** (through the API, with `catalog.tag`; each case reads
`GET /api/tags` after to check `group` and `derive` of every tag, and checks the
invariant "tags of one group have one rule, every group has two or more tags"):
- adding a free tag to a tag with no group makes a group of the two (both
  tags' `group` lists both ids);
- adding a second free tag to a group of two makes three;
- adding a tag in another group with no `confirm`: 409, `questions ==
  [{"type": "move_tag", "tag_id": X, "from_tag_ids": [the old group's others]}]`
  and nothing changed; the same body with `confirm: true`: only X moved, the old
  group keeps the others;
- moving a tag out of a group of two dissolves the old group (the other tag's
  `group` is `[]`); out of a group of three leaves two;
- adding a tag with a different rule: 409 `switch_rule` with both rules; with
  `confirm` the added tag's rule is the group's; a body that sends the tag's
  rule different as well as the added tag's: the final rule is the body's;
- changing the rule of a tag in a group of three: 409 `change_rule` with the three
  ids and the new rule; with `confirm` all three change; changing the rule of a tag
  whose only group members all leave in the same request: no question;
- a request with two questions (a moved tag of the other rule) lists both in
  one 409, in the order move, switch, change;
- removing a chip (`equivalent_tag_ids` without a member) takes only that tag out;
  removing the last other member dissolves the group; removing all dissolves it;
- the tag's own rule change and an added tag at once: the added tag is compared
  with the new rule;
- a source tag (D2's `data_client`) can be put in a group and its rule changes
  through a confirmed `change_rule`; renaming it is still 422 `source_tag`;
- a name clash on the same request changes no group;
- deleting a tag takes it out first: the others stay equivalent in a group of
  three, the group is gone in a group of two, no 409.

**API translation tests** (here, through the API):
- `test_plan.py`: with Seafood in a group with Fish, an ingredient that carries
  Seafood only and a recipe of it, the recipe count for "only Fish" is `1 of N`;
  "never Seafood" leaves the others; "only Fish" together with "never Seafood" is
  `0 of N`; with the group removed again (a `PUT` without the chip) "only Fish"
  is `0 of N`. A filter on a tag of a group is still 422 `duplicate` only for the
  same tag twice.
- `test_solve.py`: **a real solve with "Only Fish"** (fixture style of
  `tagged_light_and_heavy`): Fish and Seafood equivalent, "Light" a recipe whose
  ingredient carries Seafood only, "Heavy" a recipe with no tag and a goal that
  prefers Heavy; with the filter `only Fish`, `chosen(client) == "Light"`; and a
  recipe given Fisk och skaldjur as an extra tag by hand is usable too. Never on
  the equivalent tag excludes them.

**Verify:** `python3 -m pytest tests/server -q`, then the root suite; then
`cd web && npm run gen:api` and fix `web/src/test-data.ts` (`tag()` default `group:
[]`), `npm run typecheck`, `npm test`, lint. Commit: "server: tag groups, group
editing and its questions in the tag API".

**Built.** As written, plus the differences of interpretation 13 (b), (f), (g).
`TagsPage.vue` only got the `confirm: false` the new types need in this commit;
the editor is Task 4. Checked: root suite, `gen:api` (`test-units.json`
unchanged), web lint, typecheck and tests.

## Task 4: Web: Equivalent tags on C6

**Files:** modify `web/src/pages/TagsPage.vue`, `web/src/pages/TagsPage.test.ts`,
`web/src/i18n/en.json`, `web/src/api/types.ts` (aliases `TagUpdate`,
`GroupQuestion`); create `web/src/components/TagGroupQuestions.vue` and
`TagGroupQuestions.test.ts`.

**TagsPage:**
- Draft: `equivalentIds: number[]` next to `name` and `derive`, set in `openRow`
  from `tag.group` minus the tag itself. The new-tag row has none and no section.
- In the open form of an existing tag, below the rule: a labelled **Equivalent
  tags** section with the hint "Filtering on one of them includes recipes whose
  ingredients have any of them.", a removable `q-chip` per id (the tag's name;
  `data-test`/class `equivalent-chip`), "None" caption when empty, and a picker, a
  `q-select` (label **Add equivalent tag**, searchable, options: every other tag
  not already a chip, label the name, caption "now equivalent to Seafood,
  Fisk och skaldjur" when it is in another group). Choosing an option adds the
  chip (the picker stays empty).
- The picker is not an extra save: `done()` sends `equivalent_tag_ids` with the
  rest. The "no changes, just close" check also compares `equivalentIds` as a
  set with the stored group.
- The row caption (`info`) gains " · equivalent to Seafood, Fisk och skaldjur"
  when `tag.group` has others (names of the other members).
- `done()`: send `{ name, derive, equivalent_tag_ids, confirm: false }`. On a 409
  with a `questions` array open `TagGroupQuestions`. The existing 409
  `name_in_use` handling (`fieldErrors`) stays; tell them apart by `questions`.
  Resolution (interpretation 12): all yes → send the same body with
  `confirm: true`; any no → amend the draft and run `done()` again.
- After a save that touched a group (the draft's equivalents differ from the
  stored, or the tag was or is in a group, or a confirmed question was answered)
  reload the list (`load()`): other tags' `group` and `derive` changed. Otherwise
  keep the current in-place update.
- The delete dialog is unchanged; after a delete reload the list when the tag
  was in a group (the others' `group` changed).
- A source tag's form (D2: no Name field) has the same section.

**TagGroupQuestions.vue:** props `questions`, `tags` (to show names), v-model for
open; emits `answer` with `{yes: boolean}[]` or the list of the questions
answered no. A `q-dialog` that shows one question at a time with **Yes** style
buttons named for the question and **No**:
- `move_tag`: "Seafood is equivalent to Fisk och skaldjur. Move Seafood here?"
  (buttons **Move** / **Don't move**; the others joined with commas, "and"
  not needed);
- `switch_rule`: "Seafood gets a recipe tag when any ingredient has it; the
  group uses all. Switch Seafood to all?" (**Switch** / **Don't add**);
- `change_rule`: "This changes the rule of all 3 tags in the group: Fish, Seafood,
  Fisk och skaldjur." (**Change** / **Cancel**).
After the last question it emits once. All text through i18n keys under
`tags.group.*` (`equivalent`, `equivalentHint`, `none`, `add`, `nowEquivalent`,
`equivalentTo`, the three question texts with `{tag}`, `{others}`, `{tagRule}`,
`{groupRule}`, `{count}`, `{names}`, the six button labels, and `ruleWord.all`
= "all", `ruleWord.any` = "any").

**Tests (first):** `TagGroupQuestions.test.ts`: each of the three texts exactly as
above for given facts and tag names; yes/no buttons per question; one emit
after the last, with the answers in order. `TagsPage.test.ts` (use the existing
`mountPage`, `tag()` factory with `group`):
- the open form lists the other members as chips, not the tag itself; a tag
  with no group says None;
- picking a tag adds a chip and removes it from the picker's options; removing a
  chip removes it; Done sends `equivalent_tag_ids` with the ids and
  `confirm: false`;
- closing a tag with an unchanged group sends no `PUT`;
- a 409 `move_tag` shows the question text; **Move** sends the same body with
  `confirm: true`; **Don't move** sends the body again without that chip and
  without `confirm`;
- a 409 `switch_rule`: Switch confirms; Don't add drops the chip;
- a 409 `change_rule`: Cancel restores the draft's rule and saves the rest;
- two questions in one 409 are asked in turn and answered with one `confirm`;
- after a save in a group the list is read again (`calls` shows a second
  `GET /api/tags`);
- the row caption shows "equivalent to ..." for a grouped tag; a 409
  `name_in_use` still shows "A tag with this name already exists.".

**Verify:** `npm run lint`, `npm run typecheck`, `npm test` in `web/`. Commit:
"web: equivalent tags on the Tags page, with the three questions".

**Built.** As written, with interpretation 13 (c), (e), (h). The picker is a
`q-select` with `use-input`; its options are filtered by what is typed.

## Task 5: End-to-end step

**Files:** modify `web/e2e/catalog.e2e.ts` (and its header comment).

The step goes at the end of the flow, before the final phone-width check (which
then also covers the Tags and filters pages), so earlier locators are unaffected.
It uses what the flow has by then: the tag `vegan` (rule "all", on the recipe's
ingredient) and D2's source tag **TEST Grains** (rule "any"; the run already
has `DATA_SOURCES_DIR` set, D2's README paragraph). Before building it re-read the
flow's last steps for the real names and the filter state they leave (the plan
filter "Only vegan" is saved at that point, and the recipe's ingredient carries
only `vegan`).
- Tags: open **vegan**; in **Equivalent tags** choose **TEST Grains** in the
  picker (a chip appears); **Done**. The dialog asks "TEST Grains gets a recipe
  tag when any ingredient has it; the group uses all. Switch TEST Grains to
  all?"; **Switch**. The rows read "vegan ... equivalent to TEST Grains" and
  "TEST Grains ... equivalent to vegan", both "all ingredients" rules.
- Plan, Recipes card, Edit: set **vegan** to neither and **TEST Grains** to
  **Only**: the count line reads "1 of 1 recipe can be used" (no ingredient has TEST
  Grains itself). Switch it to **Never**: "0 of 1 recipe can be used". Back to
  **Only**, Save: the Recipes card shows the chip "Only: TEST Grains" and "1 of 1
  recipe can be used". (If the page offers no way to clear vegan's Only filter
  other than choosing it again, press its active button to clear it; adapt.)
- Tags: open **TEST Grains**, remove the **vegan** chip, Done; open **vegan**, the
  chips say None; the Recipes card, reloaded, reads "0 of 1 recipe can be
  used" (the filter now has no equivalent). This proves removal.

**Verify (the run is the test):** `cd web && npx vite build`; start the server
on a temp SQLite file in the scratchpad with `DATABASE_URL`, `PASSWORD_HASH`,
`SESSION_KEY` and `DATA_SOURCES_DIR=$PWD/tests/data/data_sources`;
`E2E_PASSWORD=... E2E_BASE_URL=http://localhost:8000 npm run e2e -- --trace
off`; kill the server. Commit: "e2e: equivalent tags step".

**Built.** Tightened to keep the flow short: with Only vegan already saved, the
count with **Never TEST Grains** is "0 of 1 recipe can be used" while the two
are equivalent and "1 of 1" after the chip is removed (no filter is saved or
cleared; the filter page is left unsaved). The flow takes about 34 s on SQLite.

## Task 6: Docs

**Files:** `README.md`, the master plan, the data source spec, the wireframes
spec, this plan.

- `README.md` status paragraph: tags can be made equivalent (tag groups):
  filtering on one includes recipes whose ingredients have any, members share a
  rule, three questions guard changes.
- Master plan: after the last done line add "D6 done: see
  `2026-11-08-slice-d6-tag-groups.md`."
- Data source spec: remove "(proposed)" from "Tags and tag groups", "API" and
  "Errors" where D6 built them and record: the `group` field (every member
  including the tag, `[]` for none); `PUT /api/tags/{id}`'s `equivalent_tag_ids`
  (the complete list of others; omitted keeps the group) and `confirm`; the 409
  body `{"questions": [...]}` with the three question types and their facts, listing
  every question of the request; the 422 types `unknown_tag`, `duplicate`,
  `own_tag`; the library tag name `group {id}` with `*` appended on a clash; that
  a new tag is made equivalent after it is saved; "Testing" matches the tests.
- Wireframes spec, C6: the **Equivalent tags** chips and picker, the row caption
  "equivalent to ...", the three questions with their buttons.
- This plan: Status "Built"; under each task add how it was checked and the
  differences from the text, as earlier slice plans do.

**Verify:** the full checks (both suites, lint, typecheck) and the e2e run once
more. Commit: "Docs: slice D6 built, README, data source and wireframes specs".

**Built.** Checked: root suite on SQLite and on Postgres, web lint, typecheck and
tests, and the e2e run on SQLite and on Postgres (see `d6-report.md`).

## Done when

On the Tags page a tag can be made equivalent to others with chips and a
picker; the three questions are asked, and a no leaves the other tags as they
were; a group of one disappears and a deleted tag leaves its group; a plan filtered
Only (or Never) on any member keeps (or drops) recipes whose ingredients or extra
tags carry any member, for the solver and for the recipe count alike, and the
screens still show the members. Both test suites, lint, typecheck, the migration
test and the end-to-end flow are green; no real data file and no network were
needed.
