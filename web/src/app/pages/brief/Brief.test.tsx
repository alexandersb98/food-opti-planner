import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { PlanFields } from '../../../api/types'
import { localDate } from '../../../dates'
import { goal, plan, planSummary, resultMeal } from '../../../test-data'
import { BASE_PATH } from '../../base'
import { fakeServer, mountApp, type FakeReply, type FakeServer } from '../../test-app'
import { stepTime } from './TimeSection'
import { portionAmount, portionFigure } from './TodayMeals'

afterEach(() => {
  vi.unstubAllGlobals()
})

function brief(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/plan': { body: plan() },
    'GET /api/attributes': { body: [] },
    'GET /api/tags': { body: [] },
    'GET /api/plan-results': { body: { unsaved: null, saved: [] } },
    'GET /api/plan-results/today': { body: null },
    'POST /api/plan/recipe-count': { body: { usable: 6, total: 8 } },
    ...server,
  })
  return calls
}

async function mountBrief(server: FakeServer = {}) {
  const calls = brief(server)
  const app = await mountApp('/')
  await screen.findByRole('navigation', { name: 'In this brief' })
  return { ...app, calls }
}

/** Where the router is, within the app (without the base path). */
function where(router: Awaited<ReturnType<typeof mountApp>>['router']) {
  const { pathname, search } = router.state.location
  return (pathname.slice(BASE_PATH.length) || '/') + search
}

function standfirst() {
  return document.querySelector('.brief-standfirst')!.textContent
}

/** A reply that waits until the test lets it go. */
function held() {
  let release!: (reply: FakeReply) => void
  const reply = new Promise<FakeReply>((resolve) => (release = resolve))
  return { reply: () => reply, release: (answer: FakeReply) => release(answer) }
}

test('the cover gives the week, the title and the setup in words', async () => {
  await mountBrief({
    'GET /api/plan': {
      body: plan({
        start_date: '2026-09-21',
        days: 5,
        skips: [{ day: 0, meal: 0 }],
        goals: [
          goal({ id: 1, attribute_id: 1, must: true }),
          goal({ id: 2, attribute_id: 1, must: true }),
          goal({ id: 3, attribute_id: 1 }),
          goal({ id: 4, attribute_id: 1 }),
        ],
      }),
    },
  })
  expect(screen.getByRole('heading', { level: 1, name: 'This week’s brief' })).toBeDefined()
  expect(screen.getByText('Week 39, 21–25 September')).toBeDefined()
  await waitFor(() => expect(standfirst()).toContain('recipes'))
  expect(standfirst()).toBe('Five days, three meals a day: 14 to plan. Four goals, two of them Must. Six recipes in play.')
})

test('the standfirst says one, none and figures in the singular and the zero cases', async () => {
  await mountBrief({
    'GET /api/plan': { body: plan({ start_date: '2026-10-30', days: 1, meals: [{ id: 1, name: 'Dinner' }], goals: [goal({ id: 1, attribute_id: 1, must: true })] }) },
    'POST /api/plan/recipe-count': { body: { usable: 1, total: 8 } },
  })
  expect(screen.getByText('Week 44, 30 October')).toBeDefined()
  await waitFor(() => expect(standfirst()).toContain('recipe'))
  expect(standfirst()).toBe('One day, one meal a day: 1 to plan. One goal, a Must. One recipe in play.')
})

test('the standfirst with nothing to plan, no goals, no usable recipe, and a week across two months', async () => {
  await mountBrief({
    'GET /api/plan': {
      body: plan({
        start_date: '2026-09-28',
        days: 14,
        meals: [{ id: 1, name: 'Dinner' }],
        skips: Array.from({ length: 14 }, (_, day) => ({ day, meal: 0 })),
      }),
    },
    'POST /api/plan/recipe-count': { body: { usable: 0, total: 8 } },
  })
  expect(screen.getByText('Week 40, 28 Sep – 11 Oct')).toBeDefined()
  await waitFor(() => expect(standfirst()).toContain('recipe'))
  expect(standfirst()).toBe('14 days, one meal a day: nothing to plan. No goals yet. No recipe can be used.')
  expect(screen.getByText('Every meal is skipped: there is nothing to fill.')).toBeDefined()
})

test('the usable count is asked for with the setup’s filters', async () => {
  const asked: unknown[] = []
  await mountBrief({
    'GET /api/plan': { body: plan({ tag_filters: [{ tag_id: 2, mode: 'never' }] }) },
    'POST /api/plan/recipe-count': (body) => {
      asked.push(body)
      return { body: { usable: 3, total: 8 } }
    },
  })
  await waitFor(() => expect(standfirst()).toContain('Three recipes in play.'))
  expect(asked).toEqual([{ tag_filters: [{ tag_id: 2, mode: 'never' }] }])
})

test('"In this brief" lists the four sections and moves focus to the one chosen', async () => {
  const { user } = await mountBrief()
  const index = screen.getByRole('navigation', { name: 'In this brief' })
  const links = within(index).getAllByRole('link')
  expect(links.map((link) => link.textContent)).toEqual(['1The schedule', '2The goals', '3Recipe filters', '4Time allowed'])
  expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
    'The schedule',
    'The goals',
    'Recipe filters',
    'Time allowed',
  ])

  await user.click(within(index).getByRole('link', { name: 'Recipe filters' }))
  expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Recipe filters' }))
  await user.click(within(index).getByRole('link', { name: 'Time allowed' }))
  expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Time allowed' }))
  expect(screen.getByRole('region', { name: 'Time allowed' })).toBeDefined()
})

test('a brief that fails to load says so, and Try again loads it', async () => {
  const calls = brief({ 'GET /api/plan': 500 })
  const { user } = await mountApp('/')
  expect((await screen.findByRole('alert')).textContent).toContain('Could not load the brief.')
  expect(screen.queryByRole('navigation', { name: 'In this brief' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Compose the week' })).toHaveProperty('disabled', true)

  fakeServer({
    'GET /api/plan': { body: plan() },
    'GET /api/attributes': { body: [] },
    'GET /api/tags': { body: [] },
    'GET /api/plan-results': { body: { unsaved: null, saved: [] } },
    'GET /api/plan-results/today': { body: null },
    'POST /api/plan/recipe-count': { body: { usable: 6, total: 8 } },
  })
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('navigation', { name: 'In this brief' })).toBeDefined()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('button', { name: 'Compose the week' })).toHaveProperty('disabled', false)
  expect(calls).toContain('GET /api/plan')
})

test('today’s meals come from the plan used for today, asked for by the browser’s date, and open it', async () => {
  const today = {
    id: 3,
    day: 1,
    date: '2026-09-22',
    meals: [
      resultMeal({ name: 'Breakfast', planned: true, recipe: 'Oat porridge', portion: '1' }),
      resultMeal({ name: 'Lunch', planned: true, recipe: 'Chili', portion: '1.5' }),
      resultMeal({ name: 'Dinner' }),
    ],
  }
  const { user, router, calls } = await mountBrief({
    'GET /api/plan-results/today': { body: today },
    'GET /api/plan-results/3': { body: {} },
  })
  expect(calls).toContain(`GET /api/plan-results/today?date=${localDate()}`)
  const section = screen.getByRole('region', { name: 'Today' })
  expect(section.textContent).toContain('Tuesday 22 September')
  const meals = within(section).getAllByRole('link')
  expect(meals.map((meal) => meal.getAttribute('href'))).toEqual([
    `${BASE_PATH}/plans/3?day=1&meal=0`,
    `${BASE_PATH}/plans/3?day=1&meal=1`,
    `${BASE_PATH}/plans/3?day=1`,
  ])
  // jsdom joins the name's parts without the space a browser puts between grid items
  expect(within(section).getByRole('link', { name: /^Lunch: ?Chili, 1\.5 portions$/ })).toBe(meals[1])
  expect(meals[2]!.textContent).toBe('Dinner: Skipped')

  await user.click(meals[1]!)
  expect(where(router)).toBe('/plans/3?day=1&meal=1')
})

test('portions read as a cook reads them: to a tenth, halves and quarters as fractions', () => {
  expect(['0.657', '1.939', '1.5', '0.75', '2', '0.26', '1.000'].map((p) => portionFigure(portionAmount(p)))).toEqual([
    '0.7',
    '1.9',
    '1½',
    '¾',
    '2',
    '¼',
    '1',
  ])
})

test('without a plan for today or an unsaved plan, neither shows', async () => {
  await mountBrief()
  expect(screen.queryByRole('region', { name: 'Today' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Open The Menu' })).toBeNull()
})

test('an unsaved plan gets a line with its dates and how it ended, linking to The Menu', async () => {
  const { user, router } = await mountBrief({
    'GET /api/plan-results': {
      body: { unsaved: planSummary({ id: 5, saved: false, saved_at: null, status: 'time_ran_out' }), saved: [] },
    },
    'GET /api/plan-results/5': { body: {} },
  })
  expect(document.querySelector('.brief-newplan')!.textContent).toContain(
    'New plan, not saved: Mon 21 – Sun 27 Sep, time ran out, so it may not be the best.',
  )
  await user.click(screen.getByRole('link', { name: 'Open The Menu' }))
  expect(where(router)).toBe('/plans/new')
})

test('the time allowed steps by 5 s up to a minute and by 30 s above, saving the whole setup each time', async () => {
  const stored = plan({ solve_time_limit: 55, skips: [{ day: 2, meal: 1 }] })
  const sent: PlanFields[] = []
  const { user } = await mountBrief({
    'GET /api/plan': { body: stored },
    'PUT /api/plan': (body) => {
      sent.push(body as PlanFields)
      return { body: { ...stored, ...(body as object) } }
    },
  })
  const time = screen.getByRole('group', { name: 'Time allowed' })
  const more = within(time).getByRole('button', { name: 'More time' })
  expect(within(time).getByRole('status').textContent).toBe('55 s')
  await user.click(more)
  expect(within(time).getByRole('status').textContent).toBe('60 s')
  await user.click(more)
  expect(within(time).getByRole('status').textContent).toBe('90 s')
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Seconds allowed' }).value).toBe('90')
  await waitFor(() => expect(sent.map((body) => body.solve_time_limit)).toEqual([60, 90]))
  expect(sent[1]!.skips).toEqual([{ day: 2, meal: 1 }])
  expect(sent[1]!.days).toBe(7)

  await user.click(within(time).getByRole('button', { name: 'Less time' }))
  expect(within(time).getByRole('status').textContent).toBe('60 s')
})

test('the steps from any value, within 1 to 300 s', () => {
  expect([55, 60, 61, 47, 75, 1, 299].map((s) => stepTime(s, 1))).toEqual([60, 90, 90, 50, 90, 5, 300])
  expect([55, 60, 61, 47, 75, 90, 5].map((s) => stepTime(s, -1))).toEqual([50, 55, 60, 45, 60, 60, 0])
})

test('any whole number of seconds can be typed; one out of range is explained and not sent', async () => {
  const sent: PlanFields[] = []
  const { user, calls } = await mountBrief({
    'PUT /api/plan': (body) => {
      sent.push(body as PlanFields)
      return { body: { ...plan(), ...(body as object) } }
    },
  })
  const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Seconds allowed' })
  expect(field.value).toBe('30')

  for (const text of ['0', '301', '2.5', 'soon']) {
    await user.clear(field)
    await user.type(field, `${text}{Enter}`)
    expect(screen.getByRole('alert').textContent).toBe('A whole number of seconds from 1 to 300.')
    expect(field.getAttribute('aria-invalid')).toBe('true')
  }
  expect(calls).not.toContain('PUT /api/plan')

  await user.clear(field)
  await user.type(field, ' 137 ')
  await user.tab()
  await waitFor(() => expect(sent.map((body) => body.solve_time_limit)).toEqual([137]))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(field.value).toBe('137')
  expect(within(screen.getByRole('group', { name: 'Time allowed' })).getByRole('status').textContent).toBe('137 s')
})

test('a failed save puts the time back and says so; a refused time is explained', async () => {
  const { user } = await mountBrief({ 'PUT /api/plan': 500 })
  const time = screen.getByRole('group', { name: 'Time allowed' })
  await user.click(within(time).getByRole('button', { name: 'More time' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Could not save. Try again.')
  expect(within(time).getByRole('status').textContent).toBe('30 s')

  fakeServer({
    'PUT /api/plan': { status: 422, body: { detail: [{ loc: ['body', 'solve_time_limit'], type: 'less_than_equal', msg: 'big' }] } },
  })
  const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Seconds allowed' })
  await user.clear(field)
  await user.type(field, '200{Enter}')
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('A whole number of seconds from 1 to 300.'))
  expect(field.value).toBe('30')
})

test('Compose the week tells how many meals it fills, and is disabled while the brief loads', async () => {
  const setup = held()
  brief({ 'GET /api/plan': setup.reply })
  await mountApp('/')
  const compose = await screen.findByRole('button', { name: 'Compose the week' })
  expect(compose).toHaveProperty('disabled', true)

  setup.release({ body: plan({ skips: [{ day: 0, meal: 1 }] }) })
  await waitFor(() => expect(compose).toHaveProperty('disabled', false))
  expect(compose.getAttribute('aria-describedby')).toBeTruthy()
  expect(document.getElementById(compose.getAttribute('aria-describedby')!)!.textContent).toBe(
    'Picks a recipe and a portion size for each of the 20 meals.',
  )
})

test('Compose the week starts the solve, and is disabled while it runs', async () => {
  const solving = held()
  const { user, calls } = await mountBrief({ 'POST /api/plan/solve': solving.reply })
  const compose = screen.getByRole('button', { name: 'Compose the week' })
  await user.click(compose)
  await waitFor(() => expect(calls).toContain('POST /api/plan/solve'))
  expect(compose).toHaveProperty('disabled', true)
  await user.click(compose)
  expect(calls.filter((call) => call === 'POST /api/plan/solve')).toHaveLength(1)

  solving.release({ body: { plan: null, failure: 'no_recipes' } })
  await waitFor(() => expect(compose).toHaveProperty('disabled', false))
})

test('Compose the week waits for a time still being saved, so the solve uses it', async () => {
  const saving = held()
  const order: string[] = []
  const { user } = await mountBrief({
    'PUT /api/plan': (body) => {
      order.push(`save ${(body as PlanFields).solve_time_limit}`)
      return saving.reply()
    },
    'POST /api/plan/solve': () => {
      order.push('solve')
      return { body: { plan: null, failure: 'no_recipes' } }
    },
  })
  await user.click(screen.getByRole('button', { name: 'More time' }))
  await user.click(screen.getByRole('button', { name: 'Compose the week' }))
  expect(order).toEqual(['save 35'])
  saving.release({ body: plan({ solve_time_limit: 35 }) })
  await waitFor(() => expect(order).toEqual(['save 35', 'solve']))
})
