import type { components } from './schema'

// The API's types by name, as the pages use them.
type Schemas = components['schemas']

export type Attribute = Schemas['Attribute']
export type AttributeFields = Schemas['AttributeFields']
export type Tag = Schemas['Tag']
export type TagFields = Schemas['TagFields']
export type Ingredient = Schemas['Ingredient']
export type IngredientFields = Schemas['IngredientFields']
export type Recipe = Schemas['Recipe']
export type RecipeFields = Schemas['RecipeFields']
export type Plan = Schemas['Plan']
export type PlanFields = Schemas['PlanFields']
