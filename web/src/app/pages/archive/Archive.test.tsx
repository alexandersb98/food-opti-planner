import { screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { planSummary } from '../../../test-data'
import { fakeServer, mountApp, type FakeServer } from '../../test-app'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const session: FakeServer = { 'GET /api/session': 204, 'GET /api/counts': { body: { recipes: 0, ingredients: 0, attributes: 0, tags: 0 } } }

function server(fields: FakeServer = {}): FakeServer {
  return {
    ...session,
    'GET /api/plan-results': { body: { unsaved: null, saved: [] } },
    'GET /api/plan-results/today': { body: null },
    ...fields,
  }
}

/** The entries of the archive's list, as their links. */
async function entries() {
  const list = await screen.findByRole('list', { name: 'Saved plans' })
  return within(list).getAllByRole('link')
}

test('saved plans are listed in the order the server sends them, with their weeks, dates, days and saved times, and the Today mark', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 22, 23, 30)) // Tue 22 Sep, late evening locally
  const saved = [
    planSummary({ id: 4, saved_at: '2026-09-20T16:04:00Z' }),
    // an older plan saved later: the server's order is kept, not re-sorted
    planSummary({ id: 3, start_date: '2026-09-14', saved_at: '2026-09-21T07:30:00Z' }),
    // saved late on the 11th in UTC, which is the 12th in the owner's zone
    planSummary({ id: 2, start_date: '2026-09-28', days: 1, saved_at: '2026-09-11T22:15:00Z' }),
  ]
  const calls = fakeServer(
    server({
      'GET /api/plan-results': { body: { unsaved: null, saved } },
      'GET /api/plan-results/today': { body: { id: 3, day: 0, date: '2026-09-14', meals: [] } },
    }),
  )
  await mountApp('/plans')

  expect(await screen.findByRole('heading', { level: 1, name: 'The archive' })).toBeDefined()
  const links = await entries()
  expect(links.map((link) => link.textContent)).toEqual([
    '39Mon 21 – Sun 27 Sep7 days. Saved Sun\u00a020\u00a0Sep, 18:04.›',
    '38Mon 14 – Sun 20 Sep7 days. Saved Mon\u00a021\u00a0Sep, 09:30.Today',
    '40Mon 28 Sep1 day. Saved Sat\u00a012\u00a0Sep, 00:15.›',
  ])
  // the week ornament and the chevron are not read out
  expect(links[0]!.querySelector('[aria-hidden="true"]')?.textContent).toBe('39')
  expect(calls).toContain('GET /api/plan-results/today?date=2026-09-22')
})

test('a saved plan opens its menu', async () => {
  fakeServer(server({ 'GET /api/plan-results': { body: { unsaved: null, saved: [planSummary({ id: 7 })] } } }))
  const { user, router } = await mountApp('/plans')

  const [entry] = await entries()
  expect(entry!.getAttribute('href')).toBe('/plans/7')
  await user.click(entry!)
  expect(router.state.location.pathname).toBe('/plans/7')
})

test('an empty archive says how plans get there and links to The Menu', async () => {
  fakeServer(server())
  const { user, router } = await mountApp('/plans')

  expect(await screen.findByText('No saved plans yet. Save a menu and it is filed here.')).toBeDefined()
  expect(screen.queryByRole('list', { name: 'Saved plans' })).toBeNull()
  await user.click(screen.getByRole('link', { name: 'Go to The Menu' }))
  expect(router.state.location.pathname).toBe('/plans/new')
})

test('an archive that fails to load says so, and Try again loads it', async () => {
  let fail = true
  fakeServer(
    server({
      'GET /api/plan-results': () => (fail ? 500 : { body: { unsaved: null, saved: [planSummary({ id: 4 })] } }),
    }),
  )
  const { user } = await mountApp('/plans')

  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('Could not load the saved plans.')
  fail = false
  await user.click(within(alert).getByRole('button', { name: 'Try again' }))
  expect((await entries()).map((link) => link.textContent)).toEqual(['39Mon 21 – Sun 27 Sep7 days. Saved Sun\u00a020\u00a0Sep, 18:04.›'])
  expect(screen.queryByRole('alert')).toBeNull()
})
