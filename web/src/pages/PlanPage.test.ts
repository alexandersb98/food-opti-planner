import { flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { click, dialog, fakeServer, mountApp, type FakeServer } from '../test-app'
import { plan } from '../test-data'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountPage(server: FakeServer = {}) {
  const calls = fakeServer({ 'GET /api/session': 204, 'GET /api/plan': { body: plan() }, ...server })
  const { wrapper, router } = await mountApp('/')
  return { wrapper, router, calls }
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>['wrapper']

/** The Schedule card's dots, a row of 'planned' and 'skipped' per day. */
function dots(wrapper: Wrapper) {
  return wrapper.findAll('.schedule-day').map((day) =>
    day.findAll('.dot').map((dot) => (dot.classes('skipped') ? 'skipped' : 'planned')),
  )
}

/** The time in the open dialog (one closed just now may linger). */
function maxTimeInput() {
  return [...document.querySelectorAll<HTMLInputElement>('.q-dialog input[aria-label="Max solving time"]')].at(-1)!
}

async function typeMaxTime(text: string) {
  const input = maxTimeInput()
  input.value = text
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

test('the Schedule card shows the dates, the meals a day, the skipped meals and a dot per meal', async () => {
  const { wrapper } = await mountPage({
    'GET /api/plan': {
      body: plan({
        days: 4,
        skips: [
          { day: 1, meal: 2 },
          { day: 3, meal: 0 },
        ],
      }),
    },
  })
  expect(wrapper.get('h1').text()).toBe('Plan')
  const card = wrapper.get('.schedule-card')
  expect(card.text()).toContain('Schedule')
  expect(card.get('.schedule-summary').text()).toBe('Mon 21 – Thu 24 Sep · 3 meals a day · 2 skipped')
  expect(wrapper.findAll('.schedule-day').map((day) => day.get('.weekday').text())).toEqual(['M', 'T', 'W', 'T'])
  expect(dots(wrapper)).toEqual([
    ['planned', 'planned', 'planned'],
    ['planned', 'planned', 'skipped'],
    ['planned', 'planned', 'planned'],
    ['skipped', 'planned', 'planned'],
  ])
  wrapper.unmount()
})

test('a one-meal plan with nothing skipped says so', async () => {
  const { wrapper } = await mountPage({
    'GET /api/plan': { body: plan({ start_date: '2026-10-26', meals: [{ id: 4, name: 'Dinner' }] }) },
  })
  expect(wrapper.get('.schedule-summary').text()).toBe('Mon 26 Oct – Sun 1 Nov · 1 meal a day · nothing skipped')
  expect(dots(wrapper)).toHaveLength(7)
  wrapper.unmount()
})

test('Edit on the Schedule card opens the schedule', async () => {
  const { wrapper, router } = await mountPage()
  await click(wrapper.get('.schedule-card a'))
  expect(router.currentRoute.value.fullPath).toBe('/plan/schedule')
  wrapper.unmount()
})

test('Max solving time is changed in a dialog, which saves the whole setup', async () => {
  const stored = plan({ skips: [{ day: 2, meal: 1 }], minimums: [{ day: 2, at_least: 1 }] })
  const sent: unknown[] = []
  const { wrapper } = await mountPage({
    'GET /api/plan': { body: stored },
    'PUT /api/plan': (body) => {
      sent.push(body)
      return { body: { ...stored, ...(body as object) } }
    },
  })
  expect(wrapper.get('.max-time').text()).toContain('Max solving time')
  expect(wrapper.get('.max-time').text()).toContain('30 s')
  await click(wrapper.get('.max-time'))
  expect(maxTimeInput().value).toBe('30')
  await typeMaxTime(' 120 ')
  await dialog().click('Save')
  expect(sent).toEqual([{ ...stored, solve_time_limit: 120 }])
  expect(wrapper.get('.max-time').text()).toContain('120 s')
  wrapper.unmount()
})

test('a max solving time out of range is marked and not sent', async () => {
  const { wrapper, calls } = await mountPage()
  await click(wrapper.get('.max-time'))
  for (const text of ['0', '301', '2.5', 'soon']) {
    await typeMaxTime(text)
    await dialog().click('Save')
    expect(dialog().text).toContain('A whole number of seconds from 1 to 300.')
  }
  expect(calls).not.toContain('PUT /api/plan')
  wrapper.unmount()
})

test('the server refusing the time marks it, and any other failure says so', async () => {
  const { wrapper } = await mountPage({
    'PUT /api/plan': {
      status: 422,
      body: { detail: [{ loc: ['body', 'solve_time_limit'], type: 'less_than_equal', msg: 'big' }] },
    },
  })
  await click(wrapper.get('.max-time'))
  await typeMaxTime('60')
  await dialog().click('Save')
  expect(dialog().text).toContain('A whole number of seconds from 1 to 300.')

  fakeServer({ 'PUT /api/plan': 500 })
  await dialog().click('Save')
  expect(dialog().text).toContain('Could not save. Try again.')
  expect(wrapper.get('.max-time').text()).toContain('30 s')
  wrapper.unmount()
})

test('Cancel leaves the time as it was', async () => {
  const { wrapper, calls } = await mountPage()
  await click(wrapper.get('.max-time'))
  await typeMaxTime('99')
  await dialog().click('Cancel')
  expect(calls).not.toContain('PUT /api/plan')
  await click(wrapper.get('.max-time'))
  expect(maxTimeInput().value).toBe('30')
  wrapper.unmount()
})

test('a plan that fails to load says so', async () => {
  const { wrapper } = await mountPage({ 'GET /api/plan': 500 })
  expect(wrapper.text()).toContain('Could not load the plan.')
  wrapper.unmount()
})
