import { api } from '../../api/client'
import type { paths } from '../../api/schema'
import type { Attribute, Ingredient, Tag } from '../../api/types'
import { createServerList } from './serverList'

// The lists many pages show, held for the visit (see `serverList` for when
// they are asked for again): the attributes, the tags and the ingredients.
// A page loads one with its `loadCall` inside `loadAll`.

export const attributesList = createServerList<Attribute>(async () => (await api.GET('/api/attributes')).data)
export const tagsList = createServerList<Tag>(async () => (await api.GET('/api/tags')).data)
export const ingredientsList = createServerList<Ingredient>(async () => (await api.GET('/api/ingredients')).data)

/** What a write does to a list. */
interface Invalidates {
  invalidate: () => void
  reset: () => void
}

const ALL: readonly Invalidates[] = [attributesList, tagsList, ingredientsList]

type Write = `${'POST' | 'PUT' | 'PATCH' | 'DELETE'} ${keyof paths}`

// What each call that writes can change in the lists. The server derives
// more than the names: an attribute counts the ingredients, goals and
// source columns that use it, a tag the ingredients, recipes and plan
// filters that have it, an ingredient the recipes that use it, its
// conversions, its link and its source's new values. So a write invalidates
// every list whose answer it can change, not just its own. A call that
// writes and is not listed here invalidates all three: a new endpoint is
// safe until someone narrows it.
const CHANGES: Partial<Record<Write, readonly Invalidates[]>> = {
  // Its own list only: a new attribute is used by nothing yet.
  'POST /api/attributes': [attributesList],
  // A unit change rescales the ingredients' values; a delete removes them.
  'PUT /api/attributes/{attribute_id}': [attributesList, ingredientsList],
  'DELETE /api/attributes/{attribute_id}': [attributesList, ingredientsList],
  // A tag's name, rule and group live in the tag list only (its group
  // changes other tags in it too); a delete also takes it off ingredients.
  'POST /api/tags': [tagsList],
  'PUT /api/tags/{tag_id}': [tagsList],
  'DELETE /api/tags/{tag_id}': [tagsList, ingredientsList],
  // An ingredient's values and tags count in the attribute and tag lists;
  // one from a source may also bring the source's tags.
  'POST /api/ingredients': ALL,
  'PUT /api/ingredients/{ingredient_id}': ALL,
  'DELETE /api/ingredients/{ingredient_id}': ALL,
  'POST /api/ingredients/from-source': ALL,
  // Accepting a source's values can add values (attribute counts).
  'POST /api/ingredients/{ingredient_id}/source-values': [ingredientsList, attributesList],
  'POST /api/ingredients/{ingredient_id}/unlink': [ingredientsList],
  'POST /api/ingredients/{ingredient_id}/conversions': [ingredientsList],
  'PUT /api/ingredients/{ingredient_id}/conversions/{conversion_id}': [ingredientsList],
  'DELETE /api/ingredients/{ingredient_id}/conversions/{conversion_id}': [ingredientsList],
  // A recipe counts in its ingredients (and their conversions' use) and in
  // the tags added to it by hand.
  'POST /api/recipes': [ingredientsList, tagsList],
  'PUT /api/recipes/{recipe_id}': [ingredientsList, tagsList],
  'DELETE /api/recipes/{recipe_id}': [ingredientsList, tagsList],
  // The plan's goals count in the attributes, its recipe filters in the tags.
  'PUT /api/plan': [attributesList, tagsList],
  // A source's colour shows on its tags and linked ingredients; a column's
  // mapping counts in the attribute and decides the ingredients' new values.
  'PATCH /api/data-sources/{key}': [tagsList, ingredientsList],
  'PUT /api/data-sources/{key}/columns/{column_id}': [attributesList, ingredientsList],
  // Writes that change none of the lists: previews and questions that
  // store nothing, the solve and its results, the preferences.
  'POST /api/attributes/{attribute_id}/unit-change': [],
  'POST /api/ingredients/{ingredient_id}/unit-change': [],
  'POST /api/recipes/derived-tags': [],
  'POST /api/recipe-imports': [],
  'POST /api/recipe-imports/factor': [],
  'POST /api/plan/recipe-count': [],
  'POST /api/plan/solve': [],
  'POST /api/plan/solve/cancel': [],
  'POST /api/plan-results/{plan_id}/save': [],
  'POST /api/plan-results/{plan_id}/use-for-today': [],
  'DELETE /api/plan-results/{plan_id}': [],
  'PUT /api/preferences': [],
}

/** Invalidate the lists a call can change. Whatever the answer (even a
 * refusal or a lost connection, as the server may still have stored the
 * change), and before the caller sees it, so a page the caller opens next
 * already waits for the server. */
function invalidateAfter({ request, schemaPath }: { request: Request; schemaPath: string }) {
  if (request.method === 'GET' || request.method === 'HEAD') return
  const changed = CHANGES[`${request.method} ${schemaPath}` as Write] ?? ALL
  for (const list of changed) list.invalidate()
}

api.use({ onResponse: invalidateAfter, onError: invalidateAfter })

/** Forget every list, for tests. */
export function resetSharedLists() {
  for (const list of ALL) list.reset()
}
