import { act, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { api } from '../../api/client'
import { App } from '../App'
import { fakeServer, mountApp, type FakeServer } from '../test-app'
import { Shell } from './Shell'
import { useRunningHead } from './runningHead'
import { toast } from './toast'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const counts = { recipes: 8, ingredients: 16, attributes: 5, tags: 6 }
const session: FakeServer = { 'GET /api/session': 204, 'GET /api/counts': { body: counts }, 'POST /api/logout': 204 }

/** Where the router is: path and query. */
function where(router: Awaited<ReturnType<typeof mountApp>>['router']) {
  const { pathname, search } = router.state.location
  return pathname + search
}

async function openContents(user: Awaited<ReturnType<typeof mountApp>>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Contents' }))
  return screen.getByRole('dialog', { name: 'Contents' })
}

function runningHead() {
  // the printed running head is hidden from assistive technology (the
  // page's heading names the page), so it is read as text in the masthead
  return within(screen.getByRole('banner'))
}

test('the masthead has the wordmark, home to the brief, and the running head', async () => {
  fakeServer(session)
  const { user, router } = await mountApp('/ingredients')

  const wordmark = await screen.findByRole('link', { name: 'The Weekly Table, go to this week’s brief' })
  expect(wordmark.textContent).toContain('The Weekly Table')
  expect(runningHead().getByText('Ingredients')).toBeDefined()
  expect(runningHead().getByText('5')).toBeDefined()

  await user.click(wordmark)
  expect(where(router)).toBe('/')
  expect(await screen.findByRole('heading', { level: 1, name: 'This week’s brief' })).toBeDefined()
})

test('the Contents list the eight pages in order, with folios and descriptions', async () => {
  fakeServer(session)
  const { user } = await mountApp('/')
  const contents = await openContents(user)

  const links = within(within(contents).getByRole('navigation')).getAllByRole('link')
  expect(links.map((link) => [link.querySelector('.contents-name')?.textContent, within(link).getByText(/^page \d$/).textContent])).toEqual([
    ['This week’s brief', 'page 1'],
    ['The Menu', 'page 2'],
    ['The recipe index', 'page 3'],
    ['The archive', 'page 4'],
    ['Ingredients', 'page 5'],
    ['Attributes', 'page 6'],
    ['Tags', 'page 7'],
    ['Settings', 'page 8'],
  ])
  expect(links.map((link) => link.getAttribute('href'))).toEqual(
    ['/', '/plans/new', '/recipes', '/plans', '/ingredients', '/attributes', '/tags', '/settings'],
  )
  expect(within(links[1]).getByText('The composed week, day by day')).toBeDefined()
  expect(within(links[2]).getByText('Every dish, A to Z')).toBeDefined()
  // the last thing in the Contents is Log out
  expect(within(contents).getByRole('button', { name: 'Log out' })).toBeDefined()
})

test('the Contents show the catalogue counts, fresh each time they open', async () => {
  const server: FakeServer = { ...session }
  const calls = fakeServer(server)
  const { user } = await mountApp('/')
  const entry = (name: string) => within(screen.getByRole('dialog')).getByRole('link', { name: new RegExp(`^${name}`) })

  await openContents(user)
  expect(await within(entry('The recipe index')).findByText('8 recipes')).toBeDefined()
  expect(within(entry('Ingredients')).getByText('16 ingredients')).toBeDefined()
  expect(within(entry('Attributes')).getByText('5 attributes')).toBeDefined()
  expect(within(entry('Tags')).getByText('6 tags')).toBeDefined()

  server['GET /api/counts'] = { body: { recipes: 9, ingredients: 1, attributes: 0, tags: 7 } }
  await user.click(screen.getByRole('button', { name: 'Close contents' }))
  await openContents(user)
  expect(await within(entry('The recipe index')).findByText('9 recipes')).toBeDefined()
  expect(within(entry('Ingredients')).getByText('1 ingredient')).toBeDefined()
  expect(within(entry('Attributes')).getByText('no attributes')).toBeDefined()
  expect(calls.filter((call) => call === 'GET /api/counts')).toHaveLength(2)
})

test('the Contents open at once, without waiting for the counts', async () => {
  fakeServer({ ...session, 'GET /api/counts': () => new Promise(() => {}) })
  const { user } = await mountApp('/')
  const contents = await openContents(user)
  expect(within(contents).getAllByRole('link')).toHaveLength(8)
  expect(within(contents).queryByText(/recipes$/)).toBeNull()
})

test('the Contents mark the current page, a detail page by its registry page', async () => {
  fakeServer(session)
  const { user } = await mountApp('/recipes/12')
  const contents = await openContents(user)

  const current = within(contents)
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page')
  expect(current.map((link) => link.getAttribute('href'))).toEqual(['/recipes'])
})

test('a Contents link turns to that page and closes the Contents', async () => {
  fakeServer(session)
  const { user, router } = await mountApp('/')
  const contents = await openContents(user)
  await user.click(within(contents).getByRole('link', { name: /^The archive/ }))

  expect(where(router)).toBe('/plans')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(await screen.findByRole('heading', { level: 1, name: 'The archive' })).toBeDefined()
  expect(document.activeElement).toBe(screen.getByRole('main'))
})

test('Escape and the close button close the Contents and give focus back to the Contents button', async () => {
  fakeServer(session)
  const { user } = await mountApp('/')
  const button = await screen.findByRole('button', { name: 'Contents' })
  expect(button.getAttribute('aria-expanded')).toBe('false')

  await user.click(button)
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close contents' }))
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(button)

  await user.click(button)
  await user.click(screen.getByRole('button', { name: 'Close contents' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(button)
  expect(button.getAttribute('aria-expanded')).toBe('false')
})

test('while the Contents are open the page behind is out of reach', async () => {
  fakeServer(session)
  const { user } = await mountApp('/')
  await openContents(user)
  // the masthead and the page are inert: no focus, no clicks, not read
  expect(screen.getByRole('banner').closest('[inert]')).not.toBeNull()
  expect(screen.getByRole('main').closest('[inert]')).not.toBeNull()
  expect(screen.getByRole('dialog').closest('[inert]')).toBeNull()
  expect(document.body.style.overflow).toBe('hidden')
  await user.keyboard('{Escape}')
  expect(screen.getByRole('main').closest('[inert]')).toBeNull()
  expect(document.body.style.overflow).toBe('')
})

test('Log out ends the session and shows the login page', async () => {
  const calls = fakeServer(session)
  const { user, router } = await mountApp('/recipes')
  const contents = await openContents(user)
  await user.click(within(contents).getByRole('button', { name: 'Log out' }))

  expect(calls).toContain('POST /api/logout')
  await waitFor(() => expect(where(router)).toBe('/login'))
  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeDefined()
})

test('Log out that fails says so in the Contents', async () => {
  fakeServer(session)
  const { user, router } = await mountApp('/recipes')
  const contents = await openContents(user)
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
  await user.click(within(contents).getByRole('button', { name: 'Log out' }))

  expect((await within(contents).findByRole('alert')).textContent).toBe('Could not log out. Try again.')
  expect(where(router)).toBe('/recipes')
})

test('without a session, a page sends the owner to log in and back', async () => {
  fakeServer({ 'GET /api/session': 401 })
  const { router } = await mountApp('/recipes?q=soup')
  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeDefined()
  expect(router.state.location.pathname).toBe('/login')
  expect(new URLSearchParams(router.state.location.search).get('redirect')).toBe('/recipes?q=soup')
})

test('without a session, the brief sends the owner to log in with no way back to name', async () => {
  fakeServer({ 'GET /api/session': 401 })
  const { router } = await mountApp('/')
  await screen.findByRole('heading', { level: 1, name: 'Log in' })
  expect(where(router)).toBe('/login')
})

test('a server that cannot be reached still lets the page show', async () => {
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
  const { router } = await mountApp('/tags')
  expect(await screen.findByRole('heading', { level: 1, name: 'Tags' })).toBeDefined()
  expect(where(router)).toBe('/tags')
})

test('a 401 from a later call leads to the login page, then back here', async () => {
  fakeServer({ 'GET /api/session': 204, 'GET /api/health': 401 })
  const { router } = await mountApp('/tags?x=1')
  await screen.findByRole('heading', { level: 1, name: 'Tags' })

  await act(() => api.GET('/api/health'))
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  expect(new URLSearchParams(router.state.location.search).get('redirect')).toBe('/tags?x=1')
})

test.each([
  ['/plan/schedule', '/?sheet=schedule'],
  ['/plan/recipes', '/?sheet=filters'],
])('the old link %s opens the brief with its sheet', async (old, brief) => {
  fakeServer(session)
  const { router } = await mountApp(old)
  expect(await screen.findByRole('heading', { level: 1, name: 'This week’s brief' })).toBeDefined()
  expect(where(router)).toBe(brief)
})

test.each([
  ['/', 'This week’s brief', 1, 'This week’s brief'],
  ['/plans/new', 'The Menu', 2, 'The Menu'],
  ['/recipes', 'The recipe index', 3, 'Recipes'],
  ['/recipes/import', 'Import a recipe', 3, 'Recipes'],
  ['/plans', 'The archive', 4, 'The archive'],
  ['/plans/3', 'The Menu', 4, 'The archive'],
  ['/ingredients', 'Ingredients', 5, 'Ingredients'],
  ['/attributes', 'Attributes', 6, 'Attributes'],
  ['/tags', 'Tags', 7, 'Tags'],
  ['/settings', 'Settings', 8, 'Settings'],
])('%s shows its page under the running head %i, %s', async (path, title, folio, run) => {
  fakeServer(session)
  await mountApp(path)
  expect(await screen.findByRole('heading', { level: 1, name: title })).toBeDefined()
  expect(runningHead().getByText(run)).toBeDefined()
  expect(runningHead().getByText(String(folio))).toBeDefined()
  expect(document.title).toBe(`${run === 'Recipes' ? 'The recipe index' : run}, The Weekly Table`)
})

test('the login page is outside the shell', async () => {
  const calls = fakeServer({})
  await mountApp('/login')
  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeDefined()
  expect(screen.queryByRole('banner')).toBeNull()
  expect(calls).toEqual([])
})

test('an address the app does not have says so, inside the shell', async () => {
  fakeServer(session)
  await mountApp('/nowhere')
  expect(await screen.findByRole('heading', { level: 1, name: 'No such page' })).toBeDefined()
  expect(screen.getByRole('link', { name: 'Go to this week’s brief' })).toBeDefined()
  expect(screen.getByRole('button', { name: 'Contents' })).toBeDefined()
})

test('a toast is announced in the polite status region, then goes', async () => {
  fakeServer(session)
  await mountApp('/')
  await screen.findByRole('heading', { level: 1 })
  vi.useFakeTimers()
  act(() => toast('Goal changed.'))
  // The brief behind it may still show its own "Loading…" status, so find
  // the toast's region through its text rather than as the only status.
  const region = screen.getByText('Goal changed.').closest('[role="status"]') as HTMLElement
  expect(region).not.toBeNull()
  expect(region.getAttribute('aria-live')).toBe('polite')
  expect(region.textContent).toBe('Goal changed.')
  expect(region.hasAttribute('data-shown')).toBe(true)
  act(() => vi.advanceTimersByTime(3000))
  expect(region.hasAttribute('data-shown')).toBe(false)
})

test('a page can put its own text in the running head while it is open', async () => {
  fakeServer(session)
  function PeaSoup() {
    useRunningHead('Pea soup')
    return <h1>Pea soup</h1>
  }
  const router = createMemoryRouter(
    [{ path: '/', Component: Shell, children: [{ path: 'recipes/:id', Component: PeaSoup }, { path: 'recipes', Component: () => <h1>Index</h1> }] }],
    { initialEntries: ['/recipes/1'] },
  )
  render(<App router={router} />)
  await screen.findByRole('heading', { name: 'Pea soup' })
  expect(runningHead().getByText('Pea soup')).toBeDefined()
  expect(runningHead().getByText('3')).toBeDefined()

  await act(() => router.navigate('/recipes'))
  expect(runningHead().getByText('Recipes')).toBeDefined()
  expect(runningHead().queryByText('Pea soup')).toBeNull()
})
