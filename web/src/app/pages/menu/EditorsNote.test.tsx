import { act, screen, waitFor, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { PlanFields } from '../../../api/types'
import { goalFields } from '../../../planFields'
import { attribute, goal, plan } from '../../../test-data'
import * as solve from '../../stores/solve'
import { fakeServer, mountApp, type FakeServer } from '../../test-app'

// The Editor's note (A5): the parity checklist is the Vue ClashCard and the
// PlanPage "No plan possible card" tests.

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal' })
const daily = goal({ id: 7, attribute_id: 1, name: 'Energy per day', min: null, max: '50', must: true })
const total = goal({ id: 8, attribute_id: 1, name: 'Energy, plan total', min: '10', max: '900', must: true, applies_to: 'plan_total' })
const other = goal({ id: 9, attribute_id: 1, name: 'Energy, a wish', min: '10', applies_to: 'plan_total' })
const setup = plan({ goals: [other, daily, total], minimums: [{ day: 1, at_least: 2 }] })
const clash = [
  { kind: 'goal', goal_id: 7, name: 'Energy per day', day: 1, date: '2026-09-22' },
  { kind: 'goal', goal_id: 7, name: 'Energy per day', day: 3, date: '2026-09-24' },
  { kind: 'goal', goal_id: 8, name: 'Energy, plan total', day: null, date: null },
  { kind: 'day_minimum', goal_id: null, name: null, day: 1, date: '2026-09-22' },
  { kind: 'day_minimum', goal_id: null, name: null, day: 2, date: '2026-09-23' },
]
const infeasible = { body: { plan: null, failure: 'infeasible', clash, clash_minimal: true } }

/** /plans/new after a solve that found no plan possible. */
async function showNote(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/plan-results': { body: { unsaved: null, saved: [] } },
    'GET /api/plan': { body: setup },
    'GET /api/attributes': { body: [energy] },
    'POST /api/plan/solve': infeasible,
    ...server,
  })
  const mounted = await mountApp('/plans/new')
  await screen.findByRole('article', { name: 'The Menu' }, { timeout: 5000 })
  await act(() => solve.start(10))
  const note = await screen.findByRole('article', { name: 'No plan possible' })
  await within(note).findByText('The planner')
  return { ...mounted, calls, note }
}

function items(note: HTMLElement) {
  return within(within(note).getByRole('list', { name: 'The rules that clash' })).getAllByRole('listitem')
}

const solves = (calls: string[]) => calls.filter((call) => call === 'POST /api/plan/solve').length

test('lists each clashing goal with where it clashes, and each day of meals', async () => {
  const { note } = await showNote()
  expect(within(note).getByRole('heading', { level: 1, name: 'No plan possible' })).toBeDefined()
  expect(within(note).getByText('Editor’s note')).toBeDefined()
  expect(note.textContent).toContain('Fixing these may show another clash.')
  const [perDay, wholePlan, day1, day2] = items(note)
  expect(items(note)).toHaveLength(4)

  expect(within(perDay!).getByText('Clashes on Tue 22, Thu 24')).toBeDefined()
  expect(within(perDay!).getByText('Energy per day')).toBeDefined()
  expect(within(perDay!).getByRole('textbox', { name: 'Max' })).toHaveProperty('value', '50')
  expect(within(perDay!).queryByRole('textbox', { name: 'Min' })).toBeNull()
  expect(within(perDay!).getByText('Must')).toBeDefined()

  expect(within(wholePlan!).getByText('Clashes over the whole plan')).toBeDefined()
  expect(within(wholePlan!).getByRole('textbox', { name: 'Min' })).toHaveProperty('value', '10')
  expect(within(wholePlan!).getByRole('textbox', { name: 'Max' })).toHaveProperty('value', '900')

  expect(within(day1!).getByText('Meals on Tue 22')).toBeDefined()
  expect(within(day1!).getByText('At least 2 meals are served')).toBeDefined()
  expect(within(day2!).getByText('Meals on Wed 23')).toBeDefined()
  expect(within(day2!).getByText('All planned meals are served')).toBeDefined()
  expect(within(day2!).getByRole('link', { name: 'Change the schedule' })).toBeDefined()
  // The menu stays behind the note.
  expect(screen.queryByRole('article', { name: 'The Menu' })).toBeNull()
})

test('a clash cut short by Cancel says some rules may not take part', async () => {
  const { note } = await showNote({ 'POST /api/plan/solve': { body: { ...infeasible.body, clash_minimal: false } } })
  expect(note.textContent).toContain('Stopped early: some of these may not take part.')
  expect(note.textContent).not.toContain('Fixing these may show another clash.')
})

test('with none of its rules left, the note says only that no plan is possible', async () => {
  const { note } = await showNote({ 'GET /api/plan': { body: plan({ days: 1, goals: [other] }) } })
  expect(within(note).getByText('No plan possible with these settings.')).toBeDefined()
  expect(within(note).queryByRole('list')).toBeNull()
  expect(note.textContent).not.toContain('Fixing these')
})

test('Try again with nothing changed goes back to the brief and composes again', async () => {
  const { note, user, router, calls } = await showNote()
  await user.click(within(note).getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(solves(calls)).toBe(2))
  expect(calls).not.toContain('PUT /api/plan')
  // The solve runs from the brief (ticket 20); the fake server finds no plan
  // possible again, so the owner lands back on the Editor's note.
  await waitFor(() => expect(router.state.location.pathname).toBe('/plans/new'))
  expect(await screen.findByRole('heading', { name: /no plan/i })).toBeDefined()
})

test('Try again saves a looser bound and Make Prefer, then composes', async () => {
  let sent: PlanFields | null = null
  const { note, user, router, calls } = await showNote({
    'PUT /api/plan': (body) => {
      sent = body as PlanFields
      return { body: plan({ ...setup, goals: [other, { ...daily, max: '500', must: false }, total] }) }
    },
  })
  const [perDay] = items(note)
  const max = within(perDay!).getByRole('textbox', { name: 'Max' })
  await user.clear(max)
  await user.type(max, '500')
  await user.click(within(perDay!).getByRole('button', { name: 'Make Prefer' }))
  expect(within(perDay!).getByText('Will be Prefer')).toBeDefined()
  await user.click(within(perDay!).getByRole('button', { name: 'Keep Must' }))
  expect(within(perDay!).queryByText('Will be Prefer')).toBeNull()
  await user.click(within(perDay!).getByRole('button', { name: 'Make Prefer' }))
  await user.click(within(note).getByRole('button', { name: 'Try again' }))

  await waitFor(() => expect(solves(calls)).toBe(2))
  expect(sent!.goals).toEqual([goalFields(other), { ...goalFields(daily), max: '500', must: false }, goalFields(total)])
  expect(calls.indexOf('PUT /api/plan')).toBeLessThan(calls.lastIndexOf('POST /api/plan/solve'))
  expect(router.state.location.pathname).toBe('/')
})

test('a bound that is no number, or one the server refuses, is marked in the note and nothing is made', async () => {
  const { note, user, router, calls } = await showNote({
    'PUT /api/plan': { status: 422, body: { detail: [{ loc: ['body', 'goals', 1, 'max'], type: 'too_many_decimals', msg: '' }] } },
  })
  const [perDay] = items(note)
  const max = within(perDay!).getByRole('textbox', { name: 'Max' })
  await user.clear(max)
  await user.type(max, 'lots')
  await user.click(within(note).getByRole('button', { name: 'Try again' }))
  expect(within(perDay!).getByRole('alert').textContent).toContain('A number, such as 120 or 1.5.')
  expect(max.getAttribute('aria-invalid')).toBe('true')
  expect(calls).not.toContain('PUT /api/plan')

  await user.clear(max)
  await user.type(max, '50.5')
  await user.click(within(note).getByRole('button', { name: 'Try again' }))
  expect((await within(perDay!).findByText('At most 0 decimals for Energy.')).textContent).toBeTruthy()
  expect(calls).toContain('PUT /api/plan')
  expect(solves(calls)).toBe(1)
  expect(router.state.location.pathname).toBe('/plans/new')
})

test('a goal with only a Max, cleared, is marked on Max', async () => {
  const { note, user, calls } = await showNote()
  const [perDay] = items(note)
  await user.clear(within(perDay!).getByRole('textbox', { name: 'Max' }))
  await user.click(within(note).getByRole('button', { name: 'Try again' }))
  expect(within(perDay!).getByText('Give a minimum, a maximum or both.')).toBeDefined()
  expect(calls).not.toContain('PUT /api/plan')
})

test('Make Prefer on a bound of 0 asks for the zero reference, and marks it', async () => {
  const zero = { ...daily, max: '0' }
  const { note, user, calls } = await showNote({ 'GET /api/plan': { body: plan({ ...setup, goals: [other, zero, total] }) } })
  const [perDay] = items(note)
  expect(within(perDay!).queryByRole('textbox', { name: 'Count a miss as a percentage of' })).toBeNull()
  await user.click(within(perDay!).getByRole('button', { name: 'Make Prefer' }))
  expect(within(perDay!).getByRole('textbox', { name: 'Count a miss as a percentage of' })).toBeDefined()
  await user.click(within(note).getByRole('button', { name: 'Try again' }))
  expect(within(perDay!).getByText('A number above 0.')).toBeDefined()
  expect(calls).not.toContain('PUT /api/plan')
})

test('a save that fails otherwise says so inside the note, keeping what was typed', async () => {
  const { note, user, calls } = await showNote({ 'PUT /api/plan': 500 })
  const [perDay] = items(note)
  const max = within(perDay!).getByRole('textbox', { name: 'Max' })
  await user.clear(max)
  await user.type(max, '80')
  await user.click(within(note).getByRole('button', { name: 'Try again' }))
  expect((await within(note).findByText('Could not save. Try again.')).getAttribute('role')).toBe('alert')
  expect(max).toHaveProperty('value', '80')
  expect(solves(calls)).toBe(1)
})

test('Change the schedule opens the schedule on the brief', async () => {
  const { note, user, router } = await showNote()
  await user.click(within(note).getAllByRole('link', { name: 'Change the schedule' })[0]!)
  expect(router.state.location.pathname).toBe('/')
  expect(router.state.location.search).toBe('?sheet=schedule')
})

test('Dismiss closes the note and shows the page behind it', async () => {
  const { note, user } = await showNote()
  await user.click(within(note).getByRole('button', { name: 'Dismiss' }))
  expect(await screen.findByRole('article', { name: 'The Menu' })).toBeDefined()
  expect(screen.queryByRole('article', { name: 'No plan possible' })).toBeNull()
  expect(solve.getSnapshot().failure).toBeNull()
})
