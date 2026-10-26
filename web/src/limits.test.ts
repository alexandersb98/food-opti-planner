import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { DECIMALS, MEAL_NAME_LENGTH, MOST_MEALS, PLAN_DAYS, SOLVE_SECONDS } from './limits'

type Property = { minimum?: number; maximum?: number; maxItems?: number; maxLength?: number }
const schemas: Record<string, { properties: Record<string, Property> }> = JSON.parse(
  readFileSync('openapi.json', 'utf8'),
).components.schemas

function property(schema: string, name: string) {
  return schemas[schema]!.properties[name]!
}

test('the limits are the API’s', () => {
  const days = property('PlanFields', 'days')
  expect(PLAN_DAYS).toEqual({ min: days.minimum, max: days.maximum })
  expect(MOST_MEALS).toBe(property('PlanFields', 'meals').maxItems)
  expect(MEAL_NAME_LENGTH).toBe(property('MealFields', 'name').maxLength)
  const seconds = property('PlanFields', 'solve_time_limit')
  expect(SOLVE_SECONDS).toEqual({ min: seconds.minimum, max: seconds.maximum })
  const decimals = property('AttributeFields', 'decimals')
  expect(DECIMALS).toEqual({ min: decimals.minimum, max: decimals.maximum })
})
