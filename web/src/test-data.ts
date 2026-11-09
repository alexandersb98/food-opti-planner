import type { Attribute, DataSource, DataSourceSummary, FoodPreview, FoodSummary, IngredientSource, SourceColumn, Goal, Ingredient, Plan, PlanResult, PlanResultSummary, Preferences, Recipe, ResultGoal, ResultMeal, ResultMiss, Tag, UnitCatalogue, UnitChange, UnitChangeRefusal } from './api/types'
import unitFixture from './test-units.json'

// Rows as the server answers them, for tests: give what the test is about,
// the rest gets a plain default. Typed, so a change to the API shows up
// here instead of leaving tests with stale rows.

type Given<T, Required extends keyof T> = Pick<T, Required> & Partial<T>

export function attribute(fields: Given<Attribute, 'id' | 'name'>): Attribute {
  return { unit: '', decimals: 0, ingredient_count: 0, goal_count: 0, mapping_count: 0, ...fields }
}

export function tag(fields: Given<Tag, 'id' | 'name'>): Tag {
  return { derive: 'all', source: null, ingredient_count: 0, recipe_count: 0, filter_count: 0, ...fields }
}

export function ingredient(fields: Given<Ingredient, 'id' | 'name'>): Ingredient {
  return { unit: 'g', basis: '100', values: [], tag_ids: [], recipe_count: 0, source: null, ...fields }
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

/** A goal, by default Prefer at importance 3, each day, with a minimum and
 * no advanced settings. */
export function goal(fields: Given<Goal, 'id' | 'attribute_id'>): Goal {
  return {
    name: 'Goal',
    min: '100',
    max: null,
    applies_to: 'day',
    must: false,
    importance: 3,
    zero_reference: null,
    custom_name: null,
    importance_below: null,
    importance_above: null,
    day_guard_rail: true,
    guard_rail_importance: null,
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
    goals: [],
    tag_filters: [],
    solve_time_limit: 30,
    ...fields,
  }
}

/** A made plan without its days, by default saved, best possible, for the
 * same week as `plan()` and saved the evening before it starts. */
export function planSummary(fields: Given<PlanResultSummary, 'id'>): PlanResultSummary {
  return {
    saved: true,
    status: 'optimal',
    start_date: '2026-09-21',
    days: 7,
    created_at: '2026-09-20T16:04:00Z',
    saved_at: '2026-09-20T16:04:00Z',
    ...fields,
  }
}

/** A meal of a made plan, by default not planned. */
export function resultMeal(fields: Given<ResultMeal, 'name'>): ResultMeal {
  return { planned: false, recipe: null, portion: null, totals: [], items: [], ...fields }
}

/** A goal of a made plan, by default on the first attribute, each day, Prefer,
 * with a minimum. */
export function resultGoal(fields: Given<ResultGoal, 'name'>): ResultGoal {
  return { attribute: 0, applies_to: 'day', must: false, min: '100', max: null, ...fields }
}

/** A miss of a made plan, by default of the first goal, below its bound on
 * the first day, by 20 of 100 (20%). */
export function resultMiss(fields: Partial<ResultMiss> = {}): ResultMiss {
  return { goal: 0, day: 0, side: 'below', bound: '100', actual: '80', amount: '20', percent: '20', ...fields }
}

/** A made plan in full, by default with no attributes and no meals. */
export function planResult(fields: Given<PlanResult, 'id'>): PlanResult {
  const days = fields.days ?? 7
  return {
    ...planSummary(fields),
    attributes: [],
    totals: [],
    averages: [],
    day_totals: Array.from({ length: days }, () => []),
    meals: Array.from({ length: days }, () => []),
    goals: [],
    misses: [],
    ...fields,
  }
}

/** A data source as the list answers it, by default the fake TEST source. */
export function dataSourceSummary(fields: Partial<DataSourceSummary> = {}): DataSourceSummary {
  return {
    key: 'testsource',
    name: 'TEST Source',
    colour: '#1976d2',
    version: '2026-01-01',
    imported_at: '2026-01-01T12:00:00Z',
    food_count: 3,
    column_count: 3,
    mapped_count: 0,
    ...fields,
  }
}

/** A column of a data source, by default active, in grams. */
export function sourceColumn(fields: Given<SourceColumn, 'id' | 'name'>): SourceColumn {
  return { key: `C${fields.id}`, unit: 'g', withdrawn: false, attribute_id: null, ...fields }
}

/** A data source in full, by default with an attribution and no columns. */
export function dataSource(fields: Partial<DataSource> = {}): DataSource {
  return {
    ...dataSourceSummary(fields),
    attribution: 'TEST data, not real: for tests only.',
    columns: [],
    ...fields,
  }
}

/** A food of a data source as the search lists it. */
export function foodSummary(fields: Given<FoodSummary, 'id' | 'name'>): FoodSummary {
  return { groups: [], ...fields }
}

/** The ingredient a food would become, as the preview answers: TEST Oats in g, no values. */
export function foodPreview(fields: Partial<FoodPreview> = {}): FoodPreview {
  return {
    id: 1,
    name: 'TEST Oats',
    withdrawn: false,
    source: { key: 'testsource', name: 'TEST Source', colour: '#1976d2' },
    suggested_name: 'TEST Oats',
    unit: 'g',
    basis: '100',
    values: [],
    skipped: [],
    groups: [],
    existing: [],
    ...fields,
  }
}

/** The link of an ingredient made from TEST Oats. */
export function ingredientSource(fields: Partial<IngredientSource> = {}): IngredientSource {
  return { key: 'testsource', name: 'TEST Source', colour: '#1976d2', food_id: 1, food_name: 'TEST Oats', withdrawn: false, ...fields }
}

/** The unit catalogue as the server sends it: the committed fixture, which a
 * server test keeps equal to the real answer. */
export function unitCatalogue(): UnitCatalogue {
  return structuredClone(unitFixture) as UnitCatalogue
}

/** The preferences as a fresh database answers them. */
export function preferences(fields: Partial<Preferences> = {}): Preferences {
  return { 'unit.mass': 'g', 'unit.volume': 'dl', 'unit.energy': 'kcal', last_data_source: null, ...fields }
}

/** A unit-change preview as the server answers: converting, 12 values and 2 goals. */
export function unitChange(fields: Partial<UnitChange> = {}): UnitChange {
  return {
    kind: 'convert',
    factor: '1000',
    counts: { ingredient_values: 12, goals: 2 },
    rounded: 0,
    refusal: null,
    ...fields,
  }
}

/** A refusal inside a preview, as the server answers. */
export function unitChangeRefusal(fields: Given<UnitChangeRefusal, 'type'>): UnitChangeRefusal {
  return { msg: 'refused', kind: null, name: null, field: null, number: null, converted: null, decimals_needed: null, ...fields }
}
