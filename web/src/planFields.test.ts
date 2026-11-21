import { expect, test } from 'vitest'
import { planFields } from './planFields'
import { goal, plan } from './test-data'

test('the setup goes back as loaded, without the fields only answered', () => {
  const energy = goal({ id: 7, name: 'Energy per day', attribute_id: 1, zero_reference: '5' })
  const loaded = plan({
    skips: [{ day: 1, meal: 2 }],
    minimums: [{ day: 0, at_least: 2 }],
    goals: [energy],
    tag_filters: [
      { tag_id: 1, mode: 'only' },
      { tag_id: 4, mode: 'never' },
    ],
  })
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
    tag_filters: [
      { tag_id: 1, mode: 'only' },
      { tag_id: 4, mode: 'never' },
    ],
    solve_time_limit: 30,
  })
})
