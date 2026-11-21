import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { PlanFields } from '../../../api/types'
import { goal, plan } from '../../../test-data'
import { fakeServer, mountApp, type FakeServer } from '../../test-app'

// The schedule sheet of the brief: start date, days and meal names. Ports
// the Vue SchedulePage tests about dates, days and meal names, and the
// MealNamesDialog's.
// Mon 21 to Wed 23 Sep, dinner skipped on Tue 22, at least 2 meals on Mon 21.
const stored = plan({ days: 3, skips: [{ day: 1, meal: 2 }], minimums: [{ day: 0, at_least: 2 }] })

afterEach(() => {
  vi.unstubAllGlobals()
})

async function mountBrief(server: FakeServer = {}, path = '/') {
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
  const app = await mountApp(path)
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

/** Opens the sheet with "Change" and gives its parts. */
async function openSheet(user: Awaited<ReturnType<typeof mountBrief>>['user']) {
  const section = screen.getByRole('region', { name: 'The schedule' })
  await user.click(within(section).getByRole('button', { name: 'Change the schedule' }))
  return parts(await screen.findByRole('dialog', { name: 'The schedule' }))
}

function parts(sheet: HTMLElement) {
  const inSheet = within(sheet)
  return {
    sheet,
    preview: () => sheet.querySelector('.sheet-preview')!.textContent,
    start: () => inSheet.getByLabelText<HTMLInputElement>('Starts on'),
    days: () => within(inSheet.getByRole('group', { name: 'Number of days' })).getByRole('status').textContent,
    names: () => inSheet.queryAllByRole('textbox').map((input) => (input as HTMLInputElement).value),
    name: (n: number) => inSheet.getByRole<HTMLInputElement>('textbox', { name: `Name of meal ${n}` }),
    button: (name: string) => inSheet.getByRole<HTMLButtonElement>('button', { name }),
  }
}

function header() {
  const group = screen.getByRole('group', { name: 'Meals to plan' })
  return [...group.querySelectorAll('.sched-h')].slice(1).map((h) => h.textContent)
}

test('"Change" opens the sheet with the schedule as saved', async () => {
  const { user } = await mountBrief()
  const sheet = await openSheet(user)
  expect(sheet.start().value).toBe('2026-09-21')
  expect(sheet.start().getAttribute('type')).toBe('date')
  expect(sheet.preview()).toBe('Week 39, 21–23 September: three days, three meals a day.')
  expect(sheet.days()).toBe('3')
  expect(sheet.names()).toEqual(['Breakfast', 'Lunch', 'Dinner'])
  expect(sheet.sheet.textContent).toContain('Meal names are labels for you; the planner only counts meals.')
})

test('the date range follows the start date chosen', async () => {
  const { user, calls } = await mountBrief()
  const sheet = await openSheet(user)
  fireEvent.change(sheet.start(), { target: { value: '2026-10-30' } })
  expect(sheet.preview()).toBe('Week 44, 30 Oct – 1 Nov: three days, three meals a day.')
  // Cleared, the range stays on the last date and Done says what is wrong.
  fireEvent.change(sheet.start(), { target: { value: '' } })
  expect(sheet.preview()).toBe('Week 44, 30 Oct – 1 Nov: three days, three meals a day.')
  await user.click(sheet.button('Done'))
  expect(within(sheet.sheet).getByRole('alert').textContent).toBe('Enter a date, such as 2026-10-21.')
  expect(sheet.start().getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(sheet.start())
  expect(calls).not.toContain('PUT /api/plan')
})

test('the days stepper goes from 1 to 31, and the range with it', async () => {
  const { user } = await mountBrief({ 'GET /api/plan': { body: { ...stored, days: 30 } } })
  const sheet = await openSheet(user)
  await user.click(sheet.button('More days'))
  expect(sheet.days()).toBe('31')
  expect(sheet.button('More days').disabled).toBe(true)
  expect(sheet.preview()).toBe('Week 39, 21 Sep – 21 Oct: 31 days, three meals a day.')

  const { user: other } = await mountBrief({ 'GET /api/plan': { body: { ...stored, days: 2 } } })
  const small = await openSheet(other)
  await other.click(small.button('Fewer days'))
  expect(small.days()).toBe('1')
  expect(small.button('Fewer days').disabled).toBe(true)
  expect(small.preview()).toBe('Week 39, 21 September: one day, three meals a day.')
})

test('meals are added, renamed, moved and removed, and each skipped cell keeps its meal', async () => {
  const { sent, handler } = recorder()
  const { user } = await mountBrief({ 'PUT /api/plan': handler })
  const sheet = await openSheet(user)
  await user.clear(sheet.name(2))
  await user.type(sheet.name(2), 'Brunch')
  await user.click(sheet.button('Move Dinner up'))
  await user.click(sheet.button('Add a meal'))
  expect(document.activeElement).toBe(sheet.name(4))
  await user.type(sheet.name(4), ' Snack ')
  await user.click(sheet.button('Move Breakfast down'))
  expect(sheet.names()).toEqual(['Dinner', 'Breakfast', 'Brunch', ' Snack '])
  await user.click(sheet.button('Remove Brunch'))
  expect(sheet.names()).toEqual(['Dinner', 'Breakfast', ' Snack '])
  expect(sheet.button('Move Dinner up').disabled).toBe(true)
  expect(sheet.button('Move Snack down').disabled).toBe(true)
  expect(sheet.preview()).toBe('Week 39, 21–23 September: three days, three meals a day.')

  await user.click(sheet.button('Done'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(sent).toHaveLength(1)
  expect(sent[0]).toEqual(
    expect.objectContaining({
      meals: [
        { id: 3, name: 'Dinner' },
        { id: 1, name: 'Breakfast' },
        { id: null, name: 'Snack' },
      ],
      // Dinner on Tue 22 is still the one skipped.
      skips: [{ day: 1, meal: 0 }],
      minimums: [{ day: 0, at_least: 2 }],
    }),
  )
  expect(header()).toEqual(['Dinner', 'Breakfast', 'Snack'])
})

test('moving a meal keeps focus on its arrows', async () => {
  const { user } = await mountBrief()
  const sheet = await openSheet(user)
  await user.click(sheet.button('Move Lunch up'))
  // At the top, "up" is disabled: focus goes to "down".
  expect(document.activeElement).toBe(sheet.button('Move Lunch down'))
  await user.click(sheet.button('Move Lunch down'))
  expect(document.activeElement).toBe(sheet.button('Move Lunch down'))
  // At the foot, "down" is disabled: focus goes to "up".
  await user.click(sheet.button('Move Lunch down'))
  expect(document.activeElement).toBe(sheet.button('Move Lunch up'))
})

test('the last meal can not be removed, and no more than 8 added', async () => {
  const { user } = await mountBrief()
  const sheet = await openSheet(user)
  await user.click(sheet.button('Remove Breakfast'))
  expect(document.activeElement).toBe(sheet.button('Add a meal'))
  await user.click(sheet.button('Remove Lunch'))
  expect(sheet.button('Remove Dinner').disabled).toBe(true)
  for (let n = 2; n <= 8; n++) {
    await user.click(sheet.button('Add a meal'))
    await user.type(sheet.name(n), `Meal ${n}`)
  }
  expect(sheet.names()).toHaveLength(8)
  expect(sheet.button('Add a meal').disabled).toBe(true)
  expect(sheet.sheet.textContent).toContain('At most 8 meals a day.')
})

test('empty, repeated and too long names are marked on their fields and nothing is sent', async () => {
  const { user, calls } = await mountBrief()
  const sheet = await openSheet(user)
  await user.clear(sheet.name(1))
  await user.type(sheet.name(1), '  ')
  await user.clear(sheet.name(3))
  await user.type(sheet.name(3), 'Lunch ')
  await user.click(sheet.button('Add a meal'))
  await user.type(sheet.name(4), 'x'.repeat(41))
  await user.click(sheet.button('Done'))

  const message = (n: number) => {
    const input = sheet.name(n)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    return document.getElementById(input.getAttribute('aria-describedby')!)!.textContent
  }
  expect(message(1)).toBe('Enter a name.')
  expect(sheet.name(2).getAttribute('aria-invalid')).toBeNull()
  expect(message(3)).toBe('Another meal has this name.')
  expect(message(4)).toBe('Use at most 40 characters.')
  expect(document.activeElement).toBe(sheet.name(1))
  expect(screen.getByRole('dialog', { name: 'The schedule' })).toBeDefined()
  expect(calls).not.toContain('PUT /api/plan')

  // Typing in a field takes its mark away.
  await user.type(sheet.name(1), 'Tea')
  expect(sheet.name(1).getAttribute('aria-invalid')).toBeNull()
})

test('Cancel throws the changes away', async () => {
  const { user, calls } = await mountBrief()
  let sheet = await openSheet(user)
  fireEvent.change(sheet.start(), { target: { value: '2026-10-05' } })
  await user.click(sheet.button('More days'))
  await user.click(sheet.button('Remove Lunch'))
  await user.click(sheet.button('Cancel'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change the schedule' }))

  sheet = await openSheet(user)
  expect(sheet.start().value).toBe('2026-09-21')
  expect(sheet.days()).toBe('3')
  expect(sheet.names()).toEqual(['Breakfast', 'Lunch', 'Dinner'])
  expect(calls).not.toContain('PUT /api/plan')
})

test('Done sends the whole setup, goals back without their names, and closes', async () => {
  const { sent, handler } = recorder()
  const withGoal = { ...stored, goals: [goal({ id: 7, attribute_id: 1, must: true })] }
  const { user } = await mountBrief({ 'GET /api/plan': { body: withGoal }, 'PUT /api/plan': handler })
  const sheet = await openSheet(user)
  fireEvent.change(sheet.start(), { target: { value: '2026-10-05' } })
  await user.click(sheet.button('Fewer days'))
  await user.click(sheet.button('Done'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(sent).toEqual([
    {
      start_date: '2026-10-05',
      days: 2,
      meals: [
        { id: 1, name: 'Breakfast' },
        { id: 2, name: 'Lunch' },
        { id: 3, name: 'Dinner' },
      ],
      skips: [{ day: 1, meal: 2 }],
      minimums: [{ day: 0, at_least: 2 }],
      goals: [expect.objectContaining({ id: 7, attribute_id: 1, must: true })],
      tag_filters: [],
      solve_time_limit: 30,
    },
  ])
  expect(sent[0]!.goals[0]).not.toHaveProperty('name')
  expect(screen.getByRole('region', { name: 'The schedule' }).querySelector('.sched-line')!.textContent).toBe(
    'From Monday 5 October, for two days: Breakfast, Lunch and Dinner.',
  )
  expect(await screen.findByText('Schedule changed.')).toBeDefined()
})

test('removing a meal drops its cells and a minimum it makes too high', async () => {
  const { sent, handler } = recorder()
  const { user } = await mountBrief({ 'PUT /api/plan': handler })
  const sheet = await openSheet(user)
  await user.click(sheet.button('Remove Dinner'))
  await user.click(sheet.button('Remove Lunch'))
  await user.click(sheet.button('Done'))
  await waitFor(() => expect(sent).toHaveLength(1))
  expect(sent[0]).toEqual(
    expect.objectContaining({ meals: [{ id: 1, name: 'Breakfast' }], skips: [], minimums: [] }),
  )
})

test('Done without a change sends nothing', async () => {
  const { user, calls } = await mountBrief()
  const sheet = await openSheet(user)
  await user.click(sheet.button('Done'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(calls).not.toContain('PUT /api/plan')
})

test('what the server refuses shows on its field and the sheet stays open', async () => {
  const replies = [
    {
      status: 422,
      body: {
        detail: [
          { loc: ['body', 'start_date'], type: 'date_from_datetime_parsing', msg: 'bad' },
          { loc: ['body', 'days'], type: 'less_than_equal', msg: 'many' },
          { loc: ['body', 'meals', 2, 'name'], type: 'duplicate', msg: 'twice' },
        ],
      },
    },
    500,
  ]
  const { user } = await mountBrief({ 'PUT /api/plan': () => replies.shift()! })
  const sheet = await openSheet(user)
  await user.click(sheet.button('More days'))
  await user.click(sheet.button('Done'))
  await waitFor(() => expect(sheet.start().getAttribute('aria-invalid')).toBe('true'))
  const alerts = () => within(sheet.sheet).queryAllByRole('alert').map((alert) => alert.textContent)
  expect(alerts()).toEqual([
    'Enter a date, such as 2026-10-21.',
    'A whole number from 1 to 31.',
    'Another meal has this name.',
  ])
  expect(document.getElementById(sheet.name(3).getAttribute('aria-describedby')!)!.textContent).toBe(
    'Another meal has this name.',
  )
  expect(screen.getByRole('dialog', { name: 'The schedule' })).toBeDefined()
  expect(screen.getByRole('region', { name: 'The schedule' }).querySelector('.sched-line')!.textContent).toContain(
    'for three days',
  )

  // A later save clears the refusals; any other failure says so.
  await user.click(sheet.button('Done'))
  await waitFor(() => expect(alerts()).toEqual(['Could not save. Try again.']))
})

test('/plan/schedule opens the brief with the sheet, and the address loses the parameter', async () => {
  const { router } = await mountBrief({}, '/plan/schedule')
  expect(await screen.findByRole('dialog', { name: 'The schedule' })).toBeDefined()
  await waitFor(() => expect(router.state.location.search).toBe(''))
  expect(router.state.location.pathname).toBe('/')
})
