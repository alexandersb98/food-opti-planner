import type { Attribute, Ingredient, Plan, Recipe, Tag } from './api/types'

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

export function recipe(fields: Given<Recipe, 'id' | 'name'>): Recipe {
  return {
    items: [],
    extra_tag_ids: [],
    min_multiplier: '0.5',
    max_multiplier: '2',
    step: null,
    hard_max_multiplier: null,
    serving_cap_weight: '1',
    derived_tag_ids: [],
    totals: [],
    ...fields,
  }
}

/** The plan setup, by default the server's first one: 7 days from Mon 21
 * Sep 2026, Breakfast / Lunch / Dinner, every meal planned, 30 s. */
export function plan(fields: Partial<Plan> = {}): Plan {
  return {
    start_date: '2026-09-21',
    days: 7,
    meals: [
      { id: 1, name: 'Breakfast' },
      { id: 2, name: 'Lunch' },
      { id: 3, name: 'Dinner' },
    ],
    skips: [],
    minimums: [],
    solve_time_limit: 30,
    ...fields,
  }
}
