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
export type Goal = Schemas['Goal']
export type GoalFields = Schemas['GoalFields']
export type PlanFields = Schemas['PlanFields']
export type PlanResult = Schemas['PlanResult']
export type PlanResultSummary = Schemas['PlanResultSummary']
export type PlanResults = Schemas['PlanResults']
export type ResultMeal = Schemas['ResultMeal']
export type ResultGoal = Schemas['ResultGoal']
export type ResultMiss = Schemas['ResultMiss']
export type TodayPlan = Schemas['TodayPlan']
export type SolveOutcome = Schemas['SolveOutcome']
export type SolveFailure = NonNullable<SolveOutcome['failure']>
