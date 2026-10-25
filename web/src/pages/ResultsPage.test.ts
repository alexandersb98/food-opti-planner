import { flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import type { PlanResult } from '../api/types'
import { button, click, dialog, fakeServer, mountApp, texts, type FakeServer } from '../test-app'
import { planResult, planSummary, resultMeal } from '../test-data'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const energy = { name: 'Energy', unit: 'kcal', decimals: 0 }
const protein = { name: 'Protein', unit: 'g', decimals: 1 }
const fat = { name: 'Fat', unit: 'g', decimals: 0 }
const carbs = { name: 'Carbs', unit: 'g', decimals: 0 }
const cost = { name: 'Cost', unit: 'kr', decimals: 0 }
const fibre = { name: 'Fibre', unit: 'g', decimals: 0 }

/** A week from Mon 21 Sep: Porridge for breakfast, Chili for lunch and
 * dinner skipped every day; day n has 1900 + n kcal. */
function week(fields: Partial<PlanResult> = {}): PlanResult {
  const attributes = fields.attributes ?? [energy, protein, fat, carbs, cost]
  const values = (first: string) => [first, ...attributes.slice(1).map((_, i) => String(10 + i))]
  return planResult({
    id: 7,
    attributes,
    totals: values('13650'),
    averages: values('1950'),
    day_totals: Array.from({ length: 7 }, (_, day) => values(String(1900 + day))),
    meals: Array.from({ length: 7 }, () => [
      resultMeal({
        name: 'Breakfast',
        planned: true,
        recipe: 'Porridge',
        portion: '1',
        totals: values('400'),
        items: [{ ingredient: 'Oats', unit: 'g', amount: '80' }],
      }),
      resultMeal({
        name: 'Lunch',
        planned: true,
        recipe: 'Chili',
        portion: '1.5',
        totals: values('640'),
        items: [
          { ingredient: 'Beans', unit: 'g', amount: '270.004' },
          { ingredient: 'Salt', unit: 'g', amount: '2.555' },
        ],
      }),
      resultMeal({ name: 'Dinner' }),
    ]),
    ...fields,
  })
}

/** The browser's clock on `date` ("2026-09-23"), at noon. */
function today(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(year!, month! - 1, day!, 12))
}

async function mountSaved(shown: PlanResult, server: FakeServer = {}, path = `/plans/${shown.id}`) {
  const calls = fakeServer({
    'GET /api/session': 204,
    [`GET /api/plan-results/${shown.id}`]: { body: shown },
    'GET /api/plan-results/today': { body: null },
    'GET /api/plan': 500, // the Plan page, when returning to it
    ...server,
  })
  const { wrapper, router } = await mountApp(path)
  return { wrapper, router, calls }
}

async function mountUnsaved(shown: PlanResult, server: FakeServer = {}) {
  return mountSaved(
    shown,
    { 'GET /api/plan-results': { body: { unsaved: planSummary(shown), saved: [] } }, ...server },
    '/plans/new',
  )
}

type Wrapper = Awaited<ReturnType<typeof mountSaved>>['wrapper']
type AppRouter = Awaited<ReturnType<typeof mountSaved>>['router']

/** On the Plan page, and Back does not return to the plan left behind. */
async function expectHomeInPlace(router: AppRouter) {
  expect(router.currentRoute.value.fullPath).toBe('/')
  router.back()
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/')
}

function position(wrapper: Wrapper) {
  return wrapper.get('.day-position').text()
}

function arrow(wrapper: Wrapper, label: 'Previous day' | 'Next day') {
  return wrapper.get(`button[aria-label="${label}"]`)
}

function todayButton(wrapper: Wrapper) {
  return wrapper.findAll('button').find((b) => b.text() === 'Today')
}

test('the header shows the dates and whether the plan is the best possible', async () => {
  const { wrapper } = await mountSaved(week())
  expect(wrapper.get('h1').text()).toBe('Mon 21 – Sun 27 Sep')
  expect(wrapper.get('.plan-status').text()).toBe('Best possible plan')
  wrapper.unmount()

  const { wrapper: ranOut } = await mountSaved(week({ status: 'time_ran_out' }))
  expect(ranOut.get('.plan-status').text()).toBe('Time ran out: may not be the best plan')
  ranOut.unmount()
})

test('the Summary shows every attribute’s total and daily average at 5 attributes', async () => {
  const { wrapper } = await mountSaved(week())
  expect(wrapper.get('.summary-card').text()).toContain('Summary')
  expect(texts(wrapper, '.summary-row')).toEqual([
    expect.stringMatching(/^Energy\s*13650 kcal · 1950 kcal\/day$/),
    expect.stringMatching(/^Protein\s*10 g · 10 g\/day$/),
    expect.stringMatching(/^Fat\s*11 g · 11 g\/day$/),
    expect.stringMatching(/^Carbs\s*12 g · 12 g\/day$/),
    expect.stringMatching(/^Cost\s*13 kr · 13 kr\/day$/),
  ])
  expect(wrapper.get('.summary-card').text()).not.toContain('Show all')
  wrapper.unmount()
})

test('the Summary starts collapsed at 6 attributes, with Show all and Show fewer', async () => {
  const { wrapper } = await mountSaved(week({ attributes: [energy, protein, fat, carbs, cost, fibre] }))
  expect(texts(wrapper, '.summary-row')).toHaveLength(5)
  await click(button(wrapper, 'Show all 6'))
  expect(texts(wrapper, '.summary-row')).toHaveLength(6)
  expect(texts(wrapper, '.summary-row').at(-1)).toMatch(/^Fibre\s*14 g · 14 g\/day$/)
  await click(button(wrapper, 'Show fewer'))
  expect(texts(wrapper, '.summary-row')).toHaveLength(5)
  wrapper.unmount()
})

test('the days open on today, the arrows move between them, and Today jumps back', async () => {
  today('2026-09-23')
  const { wrapper } = await mountSaved(week())
  expect(position(wrapper)).toBe('Wed 23 · 3 of 7')
  expect(todayButton(wrapper)).toBeUndefined()
  await click(arrow(wrapper, 'Next day'))
  expect(position(wrapper)).toBe('Thu 24 · 4 of 7')
  expect(wrapper.get('.day-line').text()).toContain('Energy 1903 kcal')
  await click(todayButton(wrapper)!)
  expect(position(wrapper)).toBe('Wed 23 · 3 of 7')
  await click(arrow(wrapper, 'Previous day'))
  await click(arrow(wrapper, 'Previous day'))
  expect(position(wrapper)).toBe('Mon 21 · 1 of 7')
  expect(arrow(wrapper, 'Previous day').attributes('disabled')).toBeDefined()
  wrapper.unmount()
})

test('a plan not covering today opens on its first day, with no Today button', async () => {
  today('2026-10-10')
  const { wrapper } = await mountSaved(week())
  expect(position(wrapper)).toBe('Mon 21 · 1 of 7')
  for (let day = 1; day < 7; day++) await click(arrow(wrapper, 'Next day'))
  expect(position(wrapper)).toBe('Sun 27 · 7 of 7')
  expect(arrow(wrapper, 'Next day').attributes('disabled')).toBeDefined()
  expect(todayButton(wrapper)).toBeUndefined()
  wrapper.unmount()
})

test('the day’s line shows the first three attributes, and every one on tap', async () => {
  today('2026-10-10')
  const { wrapper } = await mountSaved(week())
  expect(wrapper.get('.day-line').text()).toBe('Energy 1900 kcal · Protein 10 g · Fat 11 g')
  expect(wrapper.find('.day-total').exists()).toBe(false)
  await click(wrapper.get('.day-line'))
  expect(texts(wrapper, '.day-total')).toEqual([
    'Energy 1900 kcal',
    'Protein 10 g',
    'Fat 11 g',
    'Carbs 12 g',
    'Cost 13 kr',
  ])
  await click(wrapper.get('.day-line'))
  expect(wrapper.find('.day-total').exists()).toBe(false)
  wrapper.unmount()
})

test('meals show their recipe and portion or skipped, and a tap opens the ingredients and totals', async () => {
  today('2026-10-10')
  const { wrapper } = await mountSaved(week())
  expect(texts(wrapper, '.meal-row')).toEqual([
    expect.stringMatching(/^Breakfast\s*Porridge · 1 ×$/),
    expect.stringMatching(/^Lunch\s*Chili · 1.5 ×$/),
    expect.stringMatching(/^Dinner\s*skipped$/),
  ])
  expect(wrapper.find('.meal-detail').exists()).toBe(false)
  await click(wrapper.findAll('.meal-row')[1]!)
  expect(texts(wrapper, '.meal-item')).toEqual([
    expect.stringMatching(/^Beans\s*270 g$/),
    expect.stringMatching(/^Salt\s*2.56 g$/),
  ])
  expect(wrapper.get('.meal-totals').text()).toBe(
    'Energy 640 kcal · Protein 10 g · Fat 11 g · Carbs 12 g · Cost 13 kr',
  )
  await click(wrapper.findAll('.meal-row')[2]!)
  expect(texts(wrapper, '.meal-item')).toHaveLength(2) // a skipped meal has nothing to open
  await click(wrapper.findAll('.meal-row')[1]!)
  expect(wrapper.find('.meal-detail').exists()).toBe(false)
  wrapper.unmount()
})

test('from the Today card, the plan opens at that day with the meal open', async () => {
  today('2026-09-23')
  const { wrapper } = await mountSaved(week(), {}, '/plans/7?day=4&meal=1')
  expect(position(wrapper)).toBe('Fri 25 · 5 of 7')
  expect(texts(wrapper, '.meal-item')).toHaveLength(2)
  expect(todayButton(wrapper)).toBeDefined()
  wrapper.unmount()
})

test('a skipped meal in the link opens nothing', async () => {
  const { wrapper } = await mountSaved(week(), {}, '/plans/7?day=4&meal=2')
  expect(position(wrapper)).toBe('Fri 25 · 5 of 7')
  expect(wrapper.find('.meal-detail').exists()).toBe(false)
  wrapper.unmount()
})

test('the unsaved plan is saved, which returns to the Plan page', async () => {
  const shown = week({ saved: false, saved_at: null })
  const { wrapper, router, calls } = await mountUnsaved(shown, {
    'POST /api/plan-results/7/save': { body: planSummary({ id: 7 }) },
  })
  expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Use for today')
  expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Delete')
  await click(button(wrapper, 'Save'))
  expect(calls).toContain('POST /api/plan-results/7/save')
  await expectHomeInPlace(router)
  wrapper.unmount()
})

test('a save that fails says so and stays', async () => {
  const { wrapper, router } = await mountUnsaved(week({ saved: false, saved_at: null }), {
    'POST /api/plan-results/7/save': 500,
  })
  await click(button(wrapper, 'Save'))
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not save. Try again.')
  expect(router.currentRoute.value.fullPath).toBe('/plans/new')
  wrapper.unmount()
})

test('Discard asks first, and Cancel keeps the plan', async () => {
  const { wrapper, router, calls } = await mountUnsaved(week({ saved: false, saved_at: null }))
  await click(button(wrapper, 'Discard'))
  expect(dialog().text).toContain('Discard this plan?')
  await dialog().click('Cancel')
  expect(calls).not.toContain('DELETE /api/plan-results/7')
  expect(router.currentRoute.value.fullPath).toBe('/plans/new')
  wrapper.unmount()
})

test('Discard deletes the unsaved plan and returns to the Plan page', async () => {
  const { wrapper, router, calls } = await mountUnsaved(week({ saved: false, saved_at: null }), {
    'DELETE /api/plan-results/7': 204,
  })
  await click(button(wrapper, 'Discard'))
  await dialog().click('Discard')
  expect(calls).toContain('DELETE /api/plan-results/7')
  await expectHomeInPlace(router)
  wrapper.unmount()
})

test('Use for today shows for a saved plan covering today that is not the one used, and uses it', async () => {
  today('2026-09-23')
  const { wrapper, calls } = await mountSaved(week(), {
    'GET /api/plan-results/today': { body: { id: 3, day: 0, date: '2026-09-23', meals: [] } },
    'POST /api/plan-results/7/use-for-today': { body: planSummary({ id: 7 }) },
  })
  expect(calls).toContain('GET /api/plan-results/today?date=2026-09-23')
  expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Save')
  await click(button(wrapper, 'Use for today'))
  expect(calls).toContain('POST /api/plan-results/7/use-for-today')
  expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Use for today')
  wrapper.unmount()
})

test('Use for today is not offered for the plan used today, nor for one not covering today', async () => {
  today('2026-09-23')
  const { wrapper } = await mountSaved(week(), {
    'GET /api/plan-results/today': { body: { id: 7, day: 2, date: '2026-09-23', meals: [] } },
  })
  expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Use for today')
  wrapper.unmount()

  today('2026-10-10')
  const { wrapper: later } = await mountSaved(week())
  expect(later.findAll('button').map((b) => b.text())).not.toContain('Use for today')
  later.unmount()
})

test('Delete asks first, then deletes the saved plan and returns to the Plan page', async () => {
  const { wrapper, router, calls } = await mountSaved(week(), { 'DELETE /api/plan-results/7': 204 })
  await click(button(wrapper, 'Delete'))
  expect(dialog().text).toContain('Delete Mon 21 – Sun 27 Sep?')
  await dialog().click('Delete')
  expect(calls).toContain('DELETE /api/plan-results/7')
  await expectHomeInPlace(router)
  wrapper.unmount()
})

test('an unknown plan, or no unsaved plan, fails to load', async () => {
  const { wrapper } = await mountSaved(week(), { 'GET /api/plan-results/7': 404 })
  expect(wrapper.text()).toContain('Could not load the plan.')
  wrapper.unmount()

  const { wrapper: none } = await mountSaved(
    week(),
    { 'GET /api/plan-results': { body: { unsaved: null, saved: [] } } },
    '/plans/new',
  )
  expect(none.text()).toContain('Could not load the plan.')
  none.unmount()
})
