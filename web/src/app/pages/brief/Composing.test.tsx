import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { plan, planResult, planSummary } from '../../../test-data'
import { fakeServer, mountApp, type FakeReply, type FakeServer } from '../../test-app'
import { isComposed } from '../menu/composed'

// Composing the week (ticket 20): the view while the solve runs, Cancel,
// and where each outcome leads. Parity with the Vue PlanPage solve tests
// and SolveCard.

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function mountBrief(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/plan': { body: plan() },
    'GET /api/attributes': { body: [] },
    'GET /api/tags': { body: [] },
    'GET /api/plan-results': { body: { unsaved: null, saved: [] } },
    'GET /api/plan-results/today': { body: null },
    'POST /api/plan/recipe-count': { body: { usable: 6, total: 8 } },
    'GET /api/recipes': { body: [] },
    ...server,
  })
  const app = await mountApp('/')
  await screen.findByRole('navigation', { name: 'In this brief' }, { timeout: 3000 })
  return { ...app, calls }
}

/** Where the router is: path and query. */
function where(router: Awaited<ReturnType<typeof mountApp>>['router']) {
  return router.state.location.pathname
}

/** A solve that answers when the test lets it go, keeping the solve id sent. */
function slowSolve() {
  let release!: (reply: FakeReply) => void
  const answer = new Promise<FakeReply>((resolve) => (release = resolve))
  const ids: string[] = []
  return {
    ids,
    reply: (body: unknown) => {
      ids.push((body as { solve_id: string }).solve_id)
      return answer
    },
    answer: async (reply: FakeReply) => {
      await act(async () => {
        release(reply)
        await answer
      })
    },
  }
}

const composeButton = () => screen.getByRole('button', { name: 'Compose the week' })
const view = () => screen.queryByRole('dialog', { name: 'Composing the week' })

test('Compose shows the composing view, its seconds counted against the time allowed, the ruler full past it', async () => {
  const solve = slowSolve()
  await mountBrief({ 'POST /api/plan/solve': solve.reply })
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  expect(view()).toBeNull()
  fireEvent.click(composeButton())
  const dialog = await screen.findByRole('dialog', { name: 'Composing the week' })
  expect(dialog.hasAttribute('open')).toBe(true)
  expect(within(dialog).getByText('Week 39, 21–27 September')).toBeDefined()
  const ruler = within(dialog).getByRole('progressbar', { name: 'Time used' })
  expect(ruler.getAttribute('aria-valuemax')).toBe('30')
  expect(ruler.getAttribute('aria-valuenow')).toBe('0')
  expect(ruler.getAttribute('aria-valuetext')).toBe('0 of 30 seconds')
  expect(dialog.querySelector('.composing-count')!.textContent).toBe('0of 30 seconds')
  // The galley shows the days and their meals, never dishes.
  const days = within(within(dialog).getByRole('list', { name: 'The days being set' })).getAllByRole('listitem')
  expect(days.map((day) => day.textContent)).toEqual([
    'Mon 21Breakfast, Lunch, Dinner',
    'Tue 22Breakfast, Lunch, Dinner',
    'Wed 23Breakfast, Lunch, Dinner',
    'Thu 24Breakfast, Lunch, Dinner',
    'Fri 25Breakfast, Lunch, Dinner',
    'Sat 26Breakfast, Lunch, Dinner',
    'Sun 27Breakfast, Lunch, Dinner',
  ])
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(composeButton()).toHaveProperty('disabled', true)

  await act(() => vi.advanceTimersByTimeAsync(12_000))
  expect(ruler.getAttribute('aria-valuenow')).toBe('12')
  expect(ruler.getAttribute('aria-valuetext')).toBe('12 of 30 seconds')
  expect((ruler.firstElementChild as HTMLElement).style.transform).toBe('scaleX(0.4)')
  await act(() => vi.advanceTimersByTimeAsync(30_000))
  expect(ruler.getAttribute('aria-valuenow')).toBe('30')
  expect(ruler.getAttribute('aria-valuetext')).toBe('42 of 30 seconds')
  expect((ruler.firstElementChild as HTMLElement).style.transform).toBe('scaleX(1)')

  await solve.answer({ body: { plan: null, failure: 'no_recipes' } })
  expect(view()).toBeNull()
  expect(composeButton()).toHaveProperty('disabled', false)
}, 15_000)

test('a skipped meal is left out of its day in the galley', async () => {
  const solve = slowSolve()
  const { user } = await mountBrief({
    'GET /api/plan': { body: plan({ days: 2, skips: [{ day: 0, meal: 1 }, { day: 1, meal: 0 }, { day: 1, meal: 1 }, { day: 1, meal: 2 }] }) },
    'POST /api/plan/solve': solve.reply,
  })
  await user.click(composeButton())
  const dialog = await screen.findByRole('dialog', { name: 'Composing the week' })
  expect(within(dialog).getAllByRole('listitem').map((day) => day.textContent)).toEqual([
    'Mon 21Breakfast, Dinner',
    'Tue 22Nothing to set',
  ])
  await solve.answer({ body: { plan: null, failure: 'no_recipes' } })
})

test.each([
  ['Cancel', async (user: Awaited<ReturnType<typeof mountBrief>>['user']) => user.click(screen.getByRole('button', { name: 'Cancel' }))],
  ['Escape', async (user: Awaited<ReturnType<typeof mountBrief>>['user']) => user.keyboard('{Escape}')],
])('%s stops the solve it names: Stopping… until it answers, then the plan found opens The Menu', async (_, stop) => {
  const solve = slowSolve()
  const cancels: unknown[] = []
  const made = planResult({ id: 5, saved: false, saved_at: null, status: 'stopped' })
  const { user, router, calls } = await mountBrief({
    'POST /api/plan/solve': solve.reply,
    'POST /api/plan/solve/cancel': (body) => {
      cancels.push(body)
      return 204
    },
    'GET /api/plan-results/5': { body: made },
  })
  await user.click(composeButton())
  await screen.findByRole('dialog', { name: 'Composing the week' })
  await stop(user)
  await waitFor(() => expect(cancels).toEqual([{ solve_id: solve.ids[0] }]))
  const stopping = screen.getByRole('button', { name: 'Stopping…' })
  expect(stopping.getAttribute('aria-disabled')).toBe('true')
  expect(screen.getByText('Putting the pencils down.')).toBeDefined()
  await user.click(stopping)
  await user.keyboard('{Escape}')
  expect(calls.filter((call) => call === 'POST /api/plan/solve/cancel')).toHaveLength(1)
  expect(view()).not.toBeNull()

  // The Menu reads the unsaved plan from the list.
  fakeServer({
    'GET /api/session': 204,
    'GET /api/plan-results': { body: { unsaved: planSummary(made), saved: [] } },
    'GET /api/plan-results/5': { body: made },
    'GET /api/recipes': { body: [] },
  })
  await solve.answer({ body: { plan: made, failure: null } })
  await waitFor(() => expect(where(router)).toBe('/plans/new'))
  expect(isComposed(router.state.location.state)).toBe(true)
})

test('leaving the brief while it composes and coming back shows the view again', async () => {
  const solve = slowSolve()
  const { user, router } = await mountBrief({ 'POST /api/plan/solve': solve.reply })
  await user.click(composeButton())
  await screen.findByRole('dialog', { name: 'Composing the week' })
  await act(() => router.navigate('/recipes'))
  await waitFor(() => expect(view()).toBeNull())
  await act(() => router.navigate('/'))
  const dialog = await screen.findByRole('dialog', { name: 'Composing the week' }, { timeout: 3000 })
  expect(dialog.hasAttribute('open')).toBe(true)
  await solve.answer({ body: { plan: null, failure: 'no_recipes' } })
  expect(view()).toBeNull()
})

test('a plan made opens The Menu from the brief, with its reveal', async () => {
  const made = planResult({ id: 5, saved: false, saved_at: null })
  const { user, router } = await mountBrief({
    'POST /api/plan/solve': { body: { plan: made, failure: null } },
    'GET /api/plan-results/5': { body: made },
  })
  await user.click(composeButton())
  await waitFor(() => expect(where(router)).toBe('/plans/new'))
  expect(isComposed(router.state.location.state)).toBe(true)
})

test('a plan made while the owner is on another page leaves them there; the brief then shows the new plan', async () => {
  const solve = slowSolve()
  const made = planResult({ id: 5, saved: false, saved_at: null })
  const { user, router } = await mountBrief({
    'POST /api/plan/solve': solve.reply,
    'GET /api/plan-results': { body: { unsaved: planSummary(made), saved: [] } },
  })
  await user.click(composeButton())
  await screen.findByRole('dialog', { name: 'Composing the week' })
  await act(() => router.navigate('/recipes'))
  await solve.answer({ body: { plan: made, failure: null } })
  expect(where(router)).toBe('/recipes')
  await act(() => router.navigate('/'))
  expect(await screen.findByRole('link', { name: 'Open The Menu' }, { timeout: 3000 })).toBeDefined()
  expect(view()).toBeNull()
})

test('a solve with no plan possible opens the Editor’s note on /plans/new from the brief, but not from another page', async () => {
  const clash = { plan: null, failure: 'infeasible', clash: [], clash_minimal: true }
  const { user, router } = await mountBrief({ 'POST /api/plan/solve': { body: clash } })
  await user.click(composeButton())
  await waitFor(() => expect(where(router)).toBe('/plans/new'))
  expect(isComposed(router.state.location.state)).toBe(false)

  const solve = slowSolve()
  const away = await mountBrief({ 'POST /api/plan/solve': solve.reply })
  await away.user.click(composeButton())
  await screen.findByRole('dialog', { name: 'Composing the week' })
  await act(() => away.router.navigate('/recipes'))
  await solve.answer({ body: clash })
  expect(where(away.router)).toBe('/recipes')
})

test.each([
  ['no_plan_in_time', 'No plan was found within 45 seconds. Allow more time and compose again.'],
  ['no_recipes', 'There are no recipes to plan with yet. Add some to the recipe index first.'],
  ['no_usable_recipes', 'No recipe passes the recipe filters. Loosen them and compose again.'],
  ['too_large', 'This week is too large to solve. Try fewer days or meals in the schedule.'],
  ['stopped', 'It was stopped before any plan was found. Compose again when you are ready.'],
])('no plan (%s) stays on the brief with a note saying why, until dismissed', async (failure, text) => {
  const { user, router } = await mountBrief({
    'GET /api/plan': { body: plan({ solve_time_limit: 45 }) },
    'POST /api/plan/solve': { body: { plan: null, failure } },
  })
  await user.click(composeButton())
  const note = await screen.findByRole('alert')
  expect(where(router)).toBe('/')
  expect(note.textContent).toBe(`The week could not be composed. ${text}Dismiss`)
  await user.click(within(note).getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByRole('alert')).toBeNull()
})

test('a solve already running on the server, from another tab, says so', async () => {
  const { user } = await mountBrief({ 'POST /api/plan/solve': { status: 409, body: { detail: 'busy' } } })
  await user.click(composeButton())
  expect((await screen.findByRole('alert')).textContent).toContain(
    'A plan is already being made, in another tab or window. Try again when it is done.',
  )
})

test('a solve the server fails says so', async () => {
  const { user } = await mountBrief({ 'POST /api/plan/solve': 500 })
  await user.click(composeButton())
  expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong while making the plan. Try again.')
})

test('a note for one solve given up while away is on the brief when the owner comes back', async () => {
  const solve = slowSolve()
  const { user, router } = await mountBrief({ 'POST /api/plan/solve': solve.reply })
  await user.click(composeButton())
  await screen.findByRole('dialog', { name: 'Composing the week' })
  await act(() => router.navigate('/recipes'))
  await solve.answer({ body: { plan: null, failure: 'too_large' } })
  await act(() => router.navigate('/'))
  expect((await screen.findByRole('alert', {}, { timeout: 3000 })).textContent).toContain('This week is too large to solve.')
})
