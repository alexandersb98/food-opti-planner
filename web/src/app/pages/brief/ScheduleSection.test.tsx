import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { PlanFields } from '../../../api/types'
import { goal, plan } from '../../../test-data'
import { fakeServer, mountApp, type FakeReply, type FakeServer } from '../../test-app'

// Section 1 of the brief: the schedule grid and each day's "at least".
// Mon 21 to Wed 23 Sep, dinner skipped on Tue 22, at least 2 meals on Mon 21.
const stored = plan({ days: 3, skips: [{ day: 1, meal: 2 }], minimums: [{ day: 0, at_least: 2 }] })

afterEach(() => {
  vi.unstubAllGlobals()
})

async function mountBrief(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/plan': { body: stored },
    'GET /api/attributes': { body: [] },
    'GET /api/tags': { body: [] },
    'GET /api/plan-results': { body: { unsaved: null, saved: [] } },
    'GET /api/plan-results/today': { body: null },
    'POST /api/plan/recipe-count': { body: { usable: 6, total: 8 } },
    ...server,
  })
  const app = await mountApp('/')
  await screen.findByRole('group', { name: 'Meals to plan' }, { timeout: 5000 })
  return { ...app, calls }
}

/** A PUT handler that records what is sent and answers it as saved. */
function recorder() {
  const sent: PlanFields[] = []
  const handler = (body: unknown) => {
    sent.push(body as PlanFields)
    return { body: { ...stored, ...(body as object) } }
  }
  return { sent, handler }
}

function section() {
  return screen.getByRole('region', { name: 'The schedule' })
}

function cell(name: string) {
  return within(section()).getByRole('button', { name })
}

/** The grid, a row per day: each meal 'plan' or 'skip'. */
function grid() {
  const group = screen.getByRole('group', { name: 'Meals to plan' })
  const cells = [...group.querySelectorAll('.sched-cell')].map((el) =>
    el.getAttribute('aria-pressed') === 'true' ? 'plan' : 'skip',
  )
  return Array.from({ length: cells.length / 3 }, (_, day) => cells.slice(day * 3, day * 3 + 3))
}

function dayButton(day: string) {
  return within(section()).getByRole('button', { name: new RegExp(`^${day}[.,]`) })
}

test('the sentence gives the start, the days and the meals', async () => {
  await mountBrief()
  expect(section().querySelector('.sched-line')!.textContent).toBe(
    'From Monday 21 September, for three days: Breakfast, Lunch and Dinner.',
  )
})

test('one meal on one day reads as such', async () => {
  await mountBrief({
    'GET /api/plan': { body: plan({ start_date: '2026-10-30', days: 1, meals: [{ id: 1, name: 'Dinner' }] }) },
  })
  expect(section().querySelector('.sched-line')!.textContent).toBe('From Friday 30 October, for one day: Dinner.')
})

test('the grid shows each meal planned or out, and a day’s minimum under it', async () => {
  await mountBrief()
  expect(grid()).toEqual([
    ['plan', 'plan', 'plan'],
    ['plan', 'plan', 'skip'],
    ['plan', 'plan', 'plan'],
  ])
  expect(cell('Dinner on Tue 22').getAttribute('aria-pressed')).toBe('false')
  expect(dayButton('Mon 21').textContent).toBe('Mon21at least 2')
  expect(dayButton('Mon 21').getAttribute('aria-label')).toBe(
    'Mon 21, at least 2 meals. Set how many meals must be served',
  )
  expect(dayButton('Tue 22').textContent).toBe('Tue22')
  expect(screen.getByRole('group', { name: 'Meals to plan' }).hasAttribute('data-no-swipe')).toBe(true)
})

test('a tap on a cell switches it and saves the whole setup', async () => {
  const { sent, handler } = recorder()
  const withGoal = { ...stored, goals: [goal({ id: 1, attribute_id: 1, must: true })] }
  const { user } = await mountBrief({ 'GET /api/plan': { body: withGoal }, 'PUT /api/plan': handler })
  await user.click(cell('Dinner on Tue 22'))
  expect(cell('Dinner on Tue 22').getAttribute('aria-pressed')).toBe('true')
  await user.click(cell('Breakfast on Wed 23'))
  expect(grid()[2]).toEqual(['skip', 'plan', 'plan'])
  await waitFor(() => expect(sent).toHaveLength(2))
  expect(sent[0]).toEqual(
    expect.objectContaining({
      start_date: '2026-09-21',
      days: 3,
      skips: [],
      minimums: [{ day: 0, at_least: 2 }],
      goals: [expect.objectContaining({ attribute_id: 1, must: true })],
    }),
  )
  expect(sent[1]!.skips).toEqual([{ day: 2, meal: 0 }])
})

test('a failed save puts the cell back and says so', async () => {
  const { user } = await mountBrief({ 'PUT /api/plan': 500 })
  await user.click(cell('Lunch on Mon 21'))
  expect((await screen.findByRole('alert')).textContent).toBe('Could not save. Try again.')
  expect(cell('Lunch on Mon 21').getAttribute('aria-pressed')).toBe('true')
})

test('quick taps are all sent, in order, each from the latest state', async () => {
  const sent: PlanFields[] = []
  const replies: ((reply: FakeReply) => void)[] = []
  const { user } = await mountBrief({
    'PUT /api/plan': (body) => {
      sent.push(body as PlanFields)
      return new Promise<FakeReply>((resolve) => replies.push(resolve))
    },
  })
  await user.click(cell('Breakfast on Mon 21'))
  await user.click(cell('Lunch on Tue 22'))
  await user.click(cell('Dinner on Tue 22'))
  // All three show at once.
  expect(grid()).toEqual([
    ['skip', 'plan', 'plan'],
    ['plan', 'skip', 'plan'],
    ['plan', 'plan', 'plan'],
  ])
  for (let i = 0; i < 3; i++) {
    await waitFor(() => expect(replies).toHaveLength(i + 1))
    replies[i]!({ body: { ...stored, ...sent[i]! } })
  }
  await waitFor(() => expect(sent).toHaveLength(3))
  expect(sent.map((body) => body.skips)).toEqual([
    [
      { day: 0, meal: 0 },
      { day: 1, meal: 2 },
    ],
    [
      { day: 0, meal: 0 },
      { day: 1, meal: 1 },
      { day: 1, meal: 2 },
    ],
    [
      { day: 0, meal: 0 },
      { day: 1, meal: 1 },
    ],
  ])
})

test('skipping a meal drops a minimum it makes too high', async () => {
  const { sent, handler } = recorder()
  const { user } = await mountBrief({ 'PUT /api/plan': handler })
  await user.click(cell('Lunch on Mon 21'))
  expect(dayButton('Mon 21').textContent).toBe('Mon21')
  await waitFor(() => expect(sent).toHaveLength(1))
  expect(sent[0]!.minimums).toEqual([])
  expect(sent[0]!.skips).toEqual([
    { day: 0, meal: 1 },
    { day: 1, meal: 2 },
  ])
})

test('a day’s sheet offers from none up to the meals planned, and Done saves', async () => {
  const { sent, handler } = recorder()
  const { user } = await mountBrief({ 'PUT /api/plan': handler })
  await user.click(dayButton('Tue 22'))
  const sheet = await screen.findByRole('dialog', { name: 'Tuesday 22 September' })
  const stepper = within(sheet).getByRole('group', { name: 'Meals served, at least' })
  const value = () => within(stepper).getByRole('status').textContent
  const fewer = within(stepper).getByRole('button', { name: 'Fewer meals' })
  const more = within(stepper).getByRole('button', { name: 'More meals' })
  const preview = () => sheet.querySelector('.sheet-preview')!.textContent

  expect(value()).toBe('all')
  expect(more.hasAttribute('disabled')).toBe(true)
  expect(preview()).toBe('All 2 planned meals are served.')
  expect(sheet.textContent).toContain('Two meals are planned on Tuesday.')
  await user.click(fewer)
  expect(value()).toBe('1')
  expect(preview()).toBe('At least 1 of 2 meals is served.')
  await user.click(fewer)
  expect(value()).toBe('0')
  expect(preview()).toBe('The planner may leave all 2 meals empty.')
  expect(fewer.hasAttribute('disabled')).toBe(true)
  await user.click(more)

  await user.click(within(sheet).getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(sent.map((body) => body.minimums)).toEqual([
    [
      { day: 0, at_least: 2 },
      { day: 1, at_least: 1 },
    ],
  ])
  expect(dayButton('Tue 22').textContent).toBe('Tue22at least 1')
})

test('"all" in a day’s sheet takes its minimum away', async () => {
  const { sent, handler } = recorder()
  const { user } = await mountBrief({ 'PUT /api/plan': handler })
  await user.click(dayButton('Mon 21'))
  const sheet = await screen.findByRole('dialog', { name: 'Monday 21 September' })
  expect(within(sheet).getByRole('status').textContent).toBe('2')
  expect(sheet.querySelector('.sheet-preview')!.textContent).toBe('At least 2 of 3 meals are served.')
  await user.click(within(sheet).getByRole('button', { name: 'More meals' }))
  await user.click(within(sheet).getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(sent).toHaveLength(1))
  expect(sent[0]!.minimums).toEqual([])
})

test('a refused minimum stays in the sheet with the reason', async () => {
  const { user } = await mountBrief({
    'PUT /api/plan': {
      status: 422,
      body: { detail: [{ loc: ['body', 'minimums', 1, 'at_least'], type: 'above_planned', msg: 'high' }] },
    },
  })
  await user.click(dayButton('Wed 23'))
  const sheet = await screen.findByRole('dialog', { name: 'Wednesday 23 September' })
  await user.click(within(sheet).getByRole('button', { name: 'Fewer meals' }))
  await user.click(within(sheet).getByRole('button', { name: 'Done' }))
  expect((await within(sheet).findByRole('alert')).textContent).toBe('Must be at most the meals planned that day.')
  expect(screen.getByRole('dialog', { name: 'Wednesday 23 September' })).toBeDefined()
  expect(dayButton('Wed 23').textContent).toBe('Wed23')

  fakeServer({ 'PUT /api/plan': 500 })
  await user.click(within(sheet).getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(within(sheet).getByRole('alert').textContent).toBe('Could not save. Try again.'))
})

test('long meal names are shortened in the header, and whole for screen readers', async () => {
  await mountBrief({
    'GET /api/plan': {
      body: plan({
        days: 2,
        meals: [
          { id: 1, name: 'Breakfast' },
          { id: 2, name: 'Lunch' },
          { id: 3, name: 'Afternoon tea' },
          { id: 4, name: 'Dinner' },
        ],
      }),
    },
  })
  const headers = [...section().querySelectorAll('.sched-h')].slice(1)
  expect(headers.map((h) => h.querySelector('.sched-h-short')?.textContent ?? h.textContent)).toEqual([
    'Bre.',
    'Lunch',
    'Aft.',
    'Din.',
  ])
  expect(headers.map((h) => h.querySelector('.visually-hidden')?.textContent ?? h.textContent)).toEqual([
    'Breakfast',
    'Lunch',
    'Afternoon tea',
    'Dinner',
  ])
  expect(headers[0]!.getAttribute('title')).toBe('Breakfast')
  expect(cell('Afternoon tea on Tue 22')).toBeDefined()
})
