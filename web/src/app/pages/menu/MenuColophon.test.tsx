import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { PlanResult } from '../../../api/types'
import { planResult, planSummary, resultGoal, resultMeal, resultMiss } from '../../../test-data'
import { BASE_PATH } from '../../base'
import { fakeServer, mountApp, type FakeServer } from '../../test-app'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const energy = { name: 'Energy', unit: 'kcal', decimals: 0 }
const protein = { name: 'Protein', unit: 'g', decimals: 1 }
const fat = { name: 'Fat', unit: 'g', decimals: 0 }
const carbs = { name: 'Carbs', unit: 'g', decimals: 0 }
const cost = { name: 'Cost', unit: 'kr', decimals: 0 }
const fibre = { name: 'Fibre', unit: 'g', decimals: 0 }

/** A saved week from Mon 21 Sep 2026: Porridge for breakfast every day;
 * 13650 kcal in all, 1950 a day. */
function week(fields: Partial<PlanResult> = {}): PlanResult {
  const attributes = fields.attributes ?? [energy, protein, fat, carbs, cost]
  const values = (first: string) => [first, ...attributes.slice(1).map((_, i) => String(10 + i))]
  return planResult({
    id: 7,
    attributes,
    totals: values('13650'),
    averages: values('1950'),
    day_totals: Array.from({ length: 7 }, () => values('1950')),
    meals: Array.from({ length: 7 }, () => [
      resultMeal({ name: 'Breakfast', planned: true, recipe: 'Porridge', portion: '1', totals: values('1950'), items: [] }),
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

async function mount(shown: PlanResult, server: FakeServer = {}) {
  const path = shown.saved ? `/plans/${shown.id}` : '/plans/new'
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/plan-results': { body: { unsaved: shown.saved ? null : planSummary(shown), saved: [] } },
    [`GET /api/plan-results/${shown.id}`]: { body: shown },
    'GET /api/plan-results/today': { body: null },
    'GET /api/recipes': { body: [] },
    ...server,
  })
  const mounted = await mountApp(path)
  const colophon = await screen.findByRole('region', { name: 'How the week turned out' })
  return { ...mounted, calls, colophon }
}

const unsaved = (fields: Partial<PlanResult> = {}) => week({ saved: false, saved_at: null, ...fields })
const text = (element: Element) => element.textContent?.replace(/\s+/g, ' ').trim()
const rows = (colophon: HTMLElement) =>
  within(within(colophon).getByRole('table', { name: 'Plan totals' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => [...row.children].map(text).join(' '))

/** On the page at `path`, which replaced the plan (Back does not return to it). */
async function expectReplacedBy(router: Awaited<ReturnType<typeof mount>>['router'], path: string) {
  await waitFor(() => expect(router.state.location.pathname).toBe(BASE_PATH + path))
  expect(router.state.historyAction).toBe('REPLACE')
}

test('the colophon says how the week turned out, with the first attribute as a pull figure', async () => {
  const { colophon } = await mount(week({ status: 'time_ran_out' }))
  expect(within(colophon).getByText('Colophon')).toBeDefined()
  expect(within(colophon).getByText('Time ran out, so this may not be the best plan.')).toBeDefined()
  expect(text(colophon.querySelector('.colophon-pull')!)).toBe('13650kcalfor the week’s energy, about 1950 kcal a day.')
  // no goals: neither met nor missed
  expect(within(colophon).queryByText('All goals met')).toBeNull()
  expect(within(colophon).queryByRole('list')).toBeNull()
})

const proteinGoal = resultGoal({ name: 'Protein per day', attribute: 1, min: '12' })
const proteinMiss = resultMiss({ goal: 0, day: 2, bound: '12', actual: '10', amount: '2', percent: '16.7' })

test('the missed goals say what was missed and the worst day, also with the table collapsed', async () => {
  const { colophon } = await mount(week({ attributes: [energy, protein, fat, carbs, cost, fibre], goals: [proteinGoal], misses: [proteinMiss] }))
  expect(within(colophon).getByText('The best plan possible. 1 goal was missed; everything else held.')).toBeDefined()
  const missed = within(colophon).getByRole('list', { name: 'Missed goals' })
  const [row] = within(missed).getAllByRole('listitem')
  expect(text(row!.querySelector('p')!)).toBe('Protein per day · below on 1 day worst Wed 23: 10 of 12 g −17%')
  expect(within(row!).getByRole('img', { name: 'Missed' })).toBeDefined()
  expect(rows(colophon)).toHaveLength(5)
})

test('with goals and no misses, All goals met', async () => {
  const { colophon } = await mount(week({ goals: [proteinGoal] }))
  expect(within(colophon).getByText('All goals met')).toBeDefined()
  expect(within(colophon).getByText('The best plan possible. Every goal was met.')).toBeDefined()
  expect(within(colophon).queryByRole('list', { name: 'Missed goals' })).toBeNull()
})

test('the totals table shows each attribute’s total and daily average, five rows with Show all for more', async () => {
  const { colophon: five } = await mount(week())
  expect(rows(five)).toEqual(['Energy 13650 kcal 1950 kcal', 'Protein 10 g 10 g', 'Fat 11 g 11 g', 'Carbs 12 g 12 g', 'Cost 13 kr 13 kr'])
  expect(within(five).queryByRole('button', { name: /Show all/ })).toBeNull()
})

test('six attributes start collapsed, with Show all and Show fewer', async () => {
  const { user, colophon } = await mount(week({ attributes: [energy, protein, fat, carbs, cost, fibre] }))
  expect(rows(colophon)).toHaveLength(5)
  const more = within(colophon).getByRole('button', { name: 'Show all 6' })
  expect(more.getAttribute('aria-expanded')).toBe('false')
  await user.click(more)
  expect(rows(colophon).at(-1)).toBe('Fibre 14 g 14 g')
  expect(more.getAttribute('aria-expanded')).toBe('true')
  await user.click(within(colophon).getByRole('button', { name: 'Show fewer' }))
  expect(rows(colophon)).toHaveLength(5)
})

test('an unsaved plan is saved to the archive, which returns to the brief', async () => {
  const { user, router, calls, colophon } = await mount(unsaved(), { 'POST /api/plan-results/7/save': { body: planSummary({ id: 7 }) } })
  expect(within(colophon).queryByRole('button', { name: 'Use for today' })).toBeNull()
  expect(within(colophon).queryByRole('button', { name: 'Delete' })).toBeNull()
  expect(calls).not.toContain('GET /api/plan-results/today')
  await user.click(within(colophon).getByRole('button', { name: 'Save to the archive' }))
  expect(calls).toContain('POST /api/plan-results/7/save')
  expect(await screen.findByText('Saved to the archive.')).toBeDefined()
  await expectReplacedBy(router, '')
})

test('a save that fails says so and stays', async () => {
  const { user, router, colophon } = await mount(unsaved(), { 'POST /api/plan-results/7/save': 500 })
  await user.click(within(colophon).getByRole('button', { name: 'Save to the archive' }))
  expect((await within(colophon).findByRole('alert')).textContent).toBe('Could not save. Try again.')
  expect(router.state.location.pathname).toBe(`${BASE_PATH}/plans/new`)
})

test('Discard asks first, and Keep it keeps the plan', async () => {
  const { user, router, calls, colophon } = await mount(unsaved())
  await user.click(within(colophon).getByRole('button', { name: 'Discard' }))
  const question = screen.getByRole('alertdialog', { name: 'Discard this plan?' })
  expect(question.textContent).toContain('The Menu for Week 39, 21–27 September will be thrown away. It isn’t saved, so this can’t be undone.')
  await user.click(within(question).getByRole('button', { name: 'Keep it' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(calls).not.toContain('DELETE /api/plan-results/7')
  expect(router.state.location.pathname).toBe(`${BASE_PATH}/plans/new`)
})

test('Discard deletes the unsaved plan and returns to the brief; a failure says so', async () => {
  let fail = true
  const { user, router, calls, colophon } = await mount(unsaved(), { 'DELETE /api/plan-results/7': () => (fail ? 500 : 204) })
  await user.click(within(colophon).getByRole('button', { name: 'Discard' }))
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard' }))
  expect((await within(colophon).findByRole('alert')).textContent).toBe('Could not delete. Try again.')
  expect(router.state.location.pathname).toBe(`${BASE_PATH}/plans/new`)
  fail = false
  await user.click(within(colophon).getByRole('button', { name: 'Discard' }))
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard' }))
  expect(calls.filter((call) => call === 'DELETE /api/plan-results/7')).toHaveLength(2)
  expect(await screen.findByText('Plan discarded.')).toBeDefined()
  await expectReplacedBy(router, '')
})

test('a saved plan is filed in the archive, and Delete asks first naming the plan', async () => {
  let fail = true
  const { user, router, calls, colophon } = await mount(week(), { 'DELETE /api/plan-results/7': () => (fail ? 500 : 204) })
  expect(within(colophon).getByText('Filed in the archive as Week 39.')).toBeDefined()
  expect(within(colophon).queryByRole('button', { name: /Save/ })).toBeNull()
  expect(within(colophon).queryByRole('button', { name: 'Discard' })).toBeNull()

  await user.click(within(colophon).getByRole('button', { name: 'Delete' }))
  const question = screen.getByRole('alertdialog', { name: 'Delete Mon 21 – Sun 27 Sep?' })
  await user.click(within(question).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(calls).not.toContain('DELETE /api/plan-results/7')

  await user.click(within(colophon).getByRole('button', { name: 'Delete' }))
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
  expect((await within(colophon).findByRole('alert')).textContent).toBe('Could not delete. Try again.')
  fail = false
  await user.click(within(colophon).getByRole('button', { name: 'Delete' }))
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
  expect(await screen.findByText('Plan deleted.')).toBeDefined()
  await expectReplacedBy(router, '/plans')
})

test('Use for today shows for a saved plan covering today that is not the one used, uses it and stays', async () => {
  today('2026-09-23')
  let fail = true
  const { user, router, calls, colophon } = await mount(week(), {
    'GET /api/plan-results/today': { body: { id: 3, day: 0, date: '2026-09-23', meals: [] } },
    'POST /api/plan-results/7/use-for-today': () => (fail ? 500 : { body: planSummary({ id: 7 }) }),
  })
  const use = await within(colophon).findByRole('button', { name: 'Use for today' })
  expect(calls).toContain('GET /api/plan-results/today?date=2026-09-23')
  await user.click(use)
  expect((await within(colophon).findByRole('alert')).textContent).toBe('Could not save. Try again.')
  fail = false
  await user.click(use)
  expect(calls.filter((call) => call === 'POST /api/plan-results/7/use-for-today')).toHaveLength(2)
  expect(await within(colophon).findByText('Today’s meals come from this menu.')).toBeDefined()
  expect(within(colophon).queryByRole('button', { name: 'Use for today' })).toBeNull()
  expect(within(colophon).queryByRole('alert')).toBeNull()
  expect(router.state.location.pathname).toBe(`${BASE_PATH}/plans/7`)
})

test('Use for today is not offered for the plan used today, nor for one not covering today', async () => {
  today('2026-09-23')
  const used = await mount(week(), { 'GET /api/plan-results/today': { body: { id: 7, day: 2, date: '2026-09-23', meals: [] } } })
  expect(await within(used.colophon).findByText('Today’s meals come from this menu.')).toBeDefined()
  expect(within(used.colophon).queryByRole('button', { name: 'Use for today' })).toBeNull()
  used.unmount()

  today('2026-10-10')
  const later = await mount(week())
  expect(within(later.colophon).queryByRole('button', { name: 'Use for today' })).toBeNull()
  expect(later.calls.some((call) => call.startsWith('GET /api/plan-results/today'))).toBe(false)
})
