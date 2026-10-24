import type { Attribute, Ingredient, Tag } from './api/types'

// Rows as the server answers them, for tests: give what the test is about,
// the rest gets a plain default. Typed, so a change to the API shows up
// here instead of leaving tests with stale rows.

type Given<T, Required extends keyof T> = Pick<T, Required> & Partial<T>

export function attribute(fields: Given<Attribute, 'id' | 'name'>): Attribute {
  return { unit: '', decimals: 0, ingredient_count: 0, goal_count: 0, ...fields }
}

export function tag(fields: Given<Tag, 'id' | 'name'>): Tag {
  return { derive: 'all', ingredient_count: 0, recipe_count: 0, filter_count: 0, ...fields }
}

export function ingredient(fields: Given<Ingredient, 'id' | 'name'>): Ingredient {
  return { unit: 'g', basis: '100', values: [], tag_ids: [], recipe_count: 0, ...fields }
}
