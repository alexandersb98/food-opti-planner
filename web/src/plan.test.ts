import { afterEach, expect, test, vi } from 'vitest'
import { useSavePlan } from './plan'
import { planFields } from './planFields'
import { fakeServer } from './test-app'
import { plan } from './test-data'

afterEach(() => {
  vi.unstubAllGlobals()
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
