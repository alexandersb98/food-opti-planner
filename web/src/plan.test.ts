import { afterEach, expect, test, vi } from 'vitest'
import { planFields, useSavePlan } from './plan'
import { fakeServer } from './test-app'
import { goal, plan } from './test-data'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('the setup goes back as loaded, without the fields only answered', () => {
  const energy = goal({ id: 7, name: 'Energy per day', attribute_id: 1, zero_reference: '5' })
  const loaded = plan({ skips: [{ day: 1, meal: 2 }], minimums: [{ day: 0, at_least: 2 }], goals: [energy] })
  expect(planFields(loaded)).toEqual({
    start_date: '2026-09-21',
    days: 7,
    meals: [
      { id: 1, name: 'Breakfast' },
      { id: 2, name: 'Lunch' },
      { id: 3, name: 'Dinner' },
    ],
    skips: [{ day: 1, meal: 2 }],
    minimums: [{ day: 0, at_least: 2 }],
    // The generated name is the server's; sending it would make it the goal's own.
    goals: [
      {
        id: 7,
        attribute_id: 1,
        min: '100',
        max: null,
        applies_to: 'day',
        must: false,
        importance: 3,
        zero_reference: '5',
        custom_name: null,
        importance_below: null,
        importance_above: null,
        day_guard_rail: true,
        guard_rail_importance: null,
      },
    ],
    solve_time_limit: 30,
  })
})

test('a saved setup is answered back', async () => {
  const saved = plan({ solve_time_limit: 60 })
  fakeServer({ 'PUT /api/plan': { body: saved } })
  const { saving, savePlan } = useSavePlan()
  const sending = savePlan(planFields(saved))
  expect(saving.value).toBe(true)
  expect(await sending).toEqual({ plan: saved, errors: {} })
  expect(saving.value).toBe(false)
})

test('a refused setup gives the server\'s errors by field', async () => {
  fakeServer({
    'PUT /api/plan': {
      status: 422,
      body: { detail: [{ loc: ['body', 'goals', 0, 'min'], type: 'no_bound', msg: 'no' }] },
    },
  })
  const { savePlan } = useSavePlan()
  expect(await savePlan(planFields(plan()))).toEqual({ plan: null, errors: { 'goals.0.min': 'no_bound' } })
})

test('a failed save gives no errors by field', async () => {
  fakeServer({ 'PUT /api/plan': 500 })
  const { savePlan } = useSavePlan()
  expect(await savePlan(planFields(plan()))).toEqual({ plan: null, errors: {} })
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('offline')
  })
  expect(await savePlan(planFields(plan()))).toEqual({ plan: null, errors: {} })
})
