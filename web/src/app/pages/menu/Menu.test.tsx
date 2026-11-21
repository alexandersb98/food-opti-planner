import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { PlanResult } from '../../../api/types'
import { planResult, planSummary, recipe, resultGoal, resultMeal, resultMiss } from '../../../test-data'
import * as solve from '../../stores/solve'
import { fakeServer, mountApp, type FakeServer } from '../../test-app'
import { composedState } from './composed'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const energy = { name: 'Energy', unit: 'kcal', decimals: 0 }
const protein = { name: 'Protein', unit: 'g', decimals: 1 }
const fat = { name: 'Fat', unit: 'g', decimals: 0 }
const carbs = { name: 'Carbs', unit: 'g', decimals: 0 }
const cost = { name: 'Cost', unit: 'kr', decimals: 0 }

/** A week from Mon 21 Sep 2026: Porridge for breakfast, Chili (1.5
 * portions) for lunch and dinner skipped every day; day n has 1900 + n kcal. */
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
    'GET /api/recipes': { body: [recipe({ id: 12, name: 'Chili' })] },
    ...server,
  })
  const mounted = await mountApp(path)
  await screen.findByRole('heading', { level: 1, name: 'The Menu' })
  await screen.findAllByRole('heading', { level: 2 })
  return { ...mounted, calls }
}

function unsaved(shown: PlanResult): FakeServer {
  return { 'GET /api/plan-results': { body: { unsaved: planSummary({ ...shown, saved: false }), saved: [] } } }
}

const day = (name: RegExp | string) => screen.getByRole('region', { name })
const courses = (region: HTMLElement) => within(within(region).getAllByRole('list')[0]!).getAllByRole('listitem')
const dayTotals = (region: HTMLElement) => within(region).getByRole('list', { name: 'Day totals' })
const text = (element: Element) => element.textContent?.replace(/\s+/g, ' ').trim()

test('the card shows the dates, the days and dishes, saved or not, and the stamp in words', async () => {
  await mountSaved(week())
  expect(screen.getByText('Week 39, 21–27 September')).toBeDefined()
  const card = screen.getByRole('article', { name: 'The Menu' })
  expect(within(card).getByText('for 21–27 September')).toBeDefined()
  expect(within(card).getByText('7 days, 14 dishes')).toBeDefined()
  expect(within(card).getByText('Filed in the archive')).toBeDefined()
  const stamp = card.querySelector('.menu-stamp')!
  expect(within(stamp as HTMLElement).getByText('Best plan').getAttribute('aria-hidden')).toBe('true')
  expect(within(stamp as HTMLElement).getByText('Status: Best possible plan').className).toBe('visually-hidden')
})

test.each([
  ['time_ran_out', 'Time ran out', 'Status: Time ran out: may not be the best plan'],
  ['stopped', 'Stopped early', 'Status: Stopped early: may not be the best plan'],
] as const)('a %s plan is stamped %s', async (status, stamp, words) => {
  await mountSaved(week({ status }))
  expect(screen.getByText(stamp)).toBeDefined()
  expect(screen.getByText(words)).toBeDefined()
})

test('an unsaved plan on /plans/new says it is not saved yet', async () => {
  const shown = week({ saved: false, saved_at: null })
  const { calls } = await mountSaved(shown, unsaved(shown), '/plans/new')
  expect(screen.getByText('New, not saved yet')).toBeDefined()
  expect(calls).toContain('GET /api/plan-results')
  expect(calls).toContain('GET /api/plan-results/7')
})

test('every day is a section with its weekday and date, in order', async () => {
  today('2026-10-10')
  await mountSaved(week())
  expect(within(screen.getByRole('article', { name: 'The Menu' })).getAllByRole('heading', { level: 2 }).map(text)).toEqual([
    'Monday 21 Sep',
    'Tuesday 22 Sep',
    'Wednesday 23 Sep',
    'Thursday 24 Sep',
    'Friday 25 Sep',
    'Saturday 26 Sep',
    'Sunday 27 Sep',
  ])
})

test('meals are courses with the recipe and its portion, or skipped, and margin figures', async () => {
  today('2026-10-10')
  await mountSaved(week())
  const [breakfast, lunch, dinner] = courses(day('Monday 21 Sep'))
  expect(within(breakfast!).getByRole('button', { name: 'Breakfast, ingredients' })).toBeDefined()
  expect(text(breakfast!.querySelector('.menu-dish')!)).toBe('Porridge') // a whole portion has no multiplier
  expect(text(breakfast!.querySelector('.menu-margin')!)).toBe('Energy 400 kcal, Protein 10 g')
  expect(text(lunch!.querySelector('.menu-dish')!)).toBe('Chili × 1½, 1.5 portions')
  expect(within(lunch!).getByText('× 1½').getAttribute('aria-hidden')).toBe('true')
  expect(text(lunch!.querySelector('.menu-margin')!)).toBe('Energy 640 kcal, Protein 10 g')
  expect(within(dinner!).getByText('Dinner')).toBeDefined()
  expect(within(dinner!).getByText('skipped')).toBeDefined()
  expect(within(dinner!).queryByRole('button')).toBeNull()
})

test('the dish links to its recipe only when a recipe has that exact name', async () => {
  today('2026-10-10')
  const { user, router } = await mountSaved(week())
  const [breakfast, lunch] = courses(day('Monday 21 Sep'))
  expect(within(breakfast!).queryByRole('link')).toBeNull() // no recipe "Porridge"
  const chili = within(lunch!).getByRole('link', { name: 'Chili' })
  expect(chili.getAttribute('href')).toBe('/recipes/12')
  await user.click(chili)
  expect(router.state.location.pathname).toBe('/recipes/12')
})

test('the menu reads without the recipe list', async () => {
  today('2026-10-10')
  await mountSaved(week(), { 'GET /api/recipes': 500 })
  expect(within(day('Monday 21 Sep')).queryByRole('link')).toBeNull()
  expect(within(day('Monday 21 Sep')).getAllByText('Chili')).toHaveLength(1)
})

test('a planned meal opens its ingredients scaled to the portion, and its totals', async () => {
  today('2026-10-10')
  const { user } = await mountSaved(week())
  const monday = day('Monday 21 Sep')
  const open = within(monday).getByRole('button', { name: 'Lunch, ingredients' })
  expect(open.getAttribute('aria-expanded')).toBe('false')
  await user.click(open)
  expect(open.getAttribute('aria-expanded')).toBe('true')
  const detail = document.getElementById(open.getAttribute('aria-controls')!)!
  expect(within(detail).getByText('Ingredients for 1½ portions')).toBeDefined()
  expect(within(within(detail).getAllByRole('list')[0]!).getAllByRole('listitem').map(text)).toEqual([
    'Beans 270 g',
    'Salt 2.56 g',
  ])
  expect(within(within(detail).getByRole('list', { name: 'This meal’s totals' })).getAllByRole('listitem').map(text)).toEqual([
    'Energy 640 kcal',
    'Protein 10 g',
    'Fat 11 g',
    'Carbs 12 g',
    'Cost 13 kr',
  ])
  await user.click(open)
  expect(open.getAttribute('aria-expanded')).toBe('false')
  expect(detail.hidden).toBe(true)
})

test('the day totals show the first three attributes, and all on request', async () => {
  today('2026-10-10')
  const { user } = await mountSaved(week())
  const monday = day('Monday 21 Sep')
  expect(within(dayTotals(monday)).getAllByRole('listitem').map(text)).toEqual(['Energy 1900 kcal', 'Protein 10 g', 'Fat 11 g'])
  const more = within(monday).getByRole('button', { name: 'Show all 5' })
  expect(more.getAttribute('aria-expanded')).toBe('false')
  await user.click(more)
  expect(within(dayTotals(monday)).getAllByRole('listitem').map(text)).toEqual([
    'Energy 1900 kcal',
    'Protein 10 g',
    'Fat 11 g',
    'Carbs 12 g',
    'Cost 13 kr',
  ])
  await user.click(within(monday).getByRole('button', { name: 'Show fewer' }))
  expect(within(dayTotals(monday)).getAllByRole('listitem')).toHaveLength(3)
})

const proteinGoal = resultGoal({ name: 'Protein per day', attribute: 1, min: '12' })
const proteinMiss = resultMiss({ goal: 0, day: 2, bound: '12', actual: '10', amount: '2', percent: '16.7' })

test('the day totals show the goal attributes, a miss that day marked for everyone', async () => {
  today('2026-10-10')
  await mountSaved(week({ goals: [proteinGoal], misses: [proteinMiss] }))
  const wednesday = within(dayTotals(day('Wednesday 23 Sep'))).getAllByRole('listitem')
  expect(wednesday.map(text)).toEqual(['Protein 10 / 12 g (goal missed)'])
  expect(wednesday[0]!.className).toBe('menu-miss')
  const tuesday = within(dayTotals(day('Tuesday 22 Sep'))).getAllByRole('listitem')
  expect(tuesday.map(text)).toEqual(['Protein 10 g'])
  expect(tuesday[0]!.className).toBe('')
  expect(screen.getByText('a day goal missed.')).toBeDefined()
})

test('without a link, the plan opens at today, with no Today jump while today is in sight', async () => {
  today('2026-09-23')
  const scrolled: string[] = []
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this.id)
  }
  await mountSaved(week())
  await waitFor(() => expect(scrolled).toEqual(['day-2']))
  expect(within(day('Wednesday today 23 Sep')).getByText('today')).toBeDefined()
  expect(screen.queryByRole('button', { name: 'Today' })).toBeNull()
  // @ts-expect-error put back as jsdom has it
  delete Element.prototype.scrollIntoView
})

test('?day= focuses that day and ?meal= opens that meal; Today jumps back', async () => {
  today('2026-09-23')
  const { user } = await mountSaved(week(), {}, '/plans/7?day=4&meal=1')
  const friday = day('Friday 25 Sep')
  await waitFor(() => expect(document.activeElement).toBe(friday))
  expect(within(friday).getByRole('button', { name: 'Lunch, ingredients' }).getAttribute('aria-expanded')).toBe('true')
  expect(within(day('Monday 21 Sep')).getByRole('button', { name: 'Lunch, ingredients' }).getAttribute('aria-expanded')).toBe('false')
  await user.click(screen.getByRole('button', { name: 'Today' }))
  expect(document.activeElement).toBe(day('Wednesday today 23 Sep'))
  expect(screen.queryByRole('button', { name: 'Today' })).toBeNull()
})

test('a skipped meal or a day out of range in the link opens nothing', async () => {
  today('2026-10-10')
  await mountSaved(week(), {}, '/plans/7?day=4&meal=2')
  await waitFor(() => expect(document.activeElement).toBe(day('Friday 25 Sep')))
  expect(screen.getAllByRole('button', { name: /ingredients/ }).every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true)
})

test('a plan not covering today has no Today jump, and ?day= past its end is ignored', async () => {
  today('2026-10-10')
  await mountSaved(week(), {}, '/plans/7?day=9')
  expect(document.activeElement?.tagName).not.toBe('SECTION')
  expect(screen.queryByRole('button', { name: 'Today' })).toBeNull()
  expect(screen.queryByText('today')).toBeNull()
})

test('no unsaved plan and no clash: a blank card that leads to the brief', async () => {
  const calls = fakeServer({ 'GET /api/session': 204, 'GET /api/plan-results': { body: { unsaved: null, saved: [] } } })
  const { user, router } = await mountApp('/plans/new')
  const card = await screen.findByRole('article', { name: 'The Menu' })
  expect(within(card).getByText('Nothing is on the menu yet. Compose the week from the brief.')).toBeDefined()
  await user.click(within(card).getByRole('link', { name: 'Compose the week' }))
  expect(router.state.location.pathname).toBe('/')
  expect(calls).not.toContain('GET /api/plan-results/null')
})

test('a menu that fails to load says so, and Try again loads it', async () => {
  let fail = true
  const shown = week()
  const { user } = await (async () => {
    fakeServer({
      'GET /api/session': 204,
      'GET /api/plan-results/7': () => (fail ? 500 : { body: shown }),
    })
    return mountApp('/plans/7')
  })()
  expect((await screen.findByRole('alert')).textContent).toContain('Could not load the plan.')
  expect(screen.getByRole('heading', { level: 1, name: 'The Menu' })).toBeDefined()
  fail = false
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('article', { name: 'The Menu' })).toBeDefined()
})

test('an unknown plan fails to load', async () => {
  fakeServer({ 'GET /api/session': 204 })
  await mountApp('/plans/99')
  expect((await screen.findByRole('alert')).textContent).toContain('Could not load the plan.')
})

test('a just-composed plan is revealed once, and not with reduced motion', async () => {
  const shown = week({ id: 41, saved: false })
  fakeServer({ 'GET /api/session': 204, ...unsaved(shown), 'GET /api/plan-results/41': { body: shown } })
  const first = await mountApp('/plans')
  await act(() => first.router.navigate('/plans/new', { state: composedState }))
  const card = await screen.findByRole('article', { name: 'The Menu' })
  expect(card.className).toContain('is-reveal')
  first.unmount()

  const again = await mountApp('/plans')
  await act(() => again.router.navigate('/plans/new', { state: composedState }))
  expect((await screen.findByRole('article', { name: 'The Menu' })).className).not.toContain('is-reveal')
  again.unmount()

  const other = week({ id: 42, saved: false })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }))
  fakeServer({ 'GET /api/session': 204, ...unsaved(other), 'GET /api/plan-results/42': { body: other } })
  const reduced = await mountApp('/plans')
  await act(() => reduced.router.navigate('/plans/new', { state: composedState }))
  expect((await screen.findByRole('article', { name: 'The Menu' })).className).not.toContain('is-reveal')
})

test('opened without having just composed, the plan is not revealed', async () => {
  await mountSaved(week({ id: 43 }))
  expect(screen.getByRole('article', { name: 'The Menu' }).className).not.toContain('is-reveal')
})

test('after a clash, /plans/new leaves the menu to the Editor’s note', async () => {
  fakeServer({
    'GET /api/session': 204,
    'POST /api/plan/solve': { body: { plan: null, failure: 'infeasible', clash: [], clash_minimal: true } },
    'GET /api/plan-results': { body: { unsaved: null, saved: [] } },
  })
  const { router } = await mountApp('/plans')
  await screen.findByRole('heading', { level: 1, name: 'The archive' })
  await act(() => solve.start(10))
  await act(() => router.navigate('/plans/new'))
  expect(screen.queryByRole('article', { name: 'The Menu' })).toBeNull() // no blank card
  act(() => solve.dismiss())
  expect(await screen.findByRole('article', { name: 'The Menu' })).toBeDefined()
})
