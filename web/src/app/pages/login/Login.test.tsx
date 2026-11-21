import { screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { BASE_PATH } from '../../base'
import { fakeServer, mountApp, type FakeServer } from '../../test-app'

afterEach(() => {
  vi.unstubAllGlobals()
})

type Mounted = Awaited<ReturnType<typeof mountApp>>

/** Where the router is, within the app (without the base path). */
function where(router: Mounted['router']) {
  const { pathname, search } = router.state.location
  return (pathname.slice(BASE_PATH.length) || '/') + search
}

async function logIn(user: Mounted['user'], password: string) {
  await user.type(await screen.findByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Log in' }))
}

test('the login page has the wordmark, the password and Log in', async () => {
  fakeServer({})
  await mountApp('/login')
  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeDefined()
  expect(screen.getByText('Weekly Table').textContent).toBe('The Weekly Table')
  const password = screen.getByLabelText('Password')
  expect(password.getAttribute('type')).toBe('password')
  expect(password.getAttribute('autocomplete')).toBe('current-password')
  expect(document.activeElement).toBe(password)
  expect(document.title).toBe('Log in, The Weekly Table')
})

test('a wrong password says so and stays on the login page', async () => {
  const calls = fakeServer({ 'GET /api/session': 401, 'POST /api/login': 401 })
  const { user, router } = await mountApp('/login?redirect=%2Frecipes')
  await logIn(user, 'wrong')

  expect((await screen.findByRole('alert')).textContent).toBe('Wrong password.')
  const password = screen.getByLabelText('Password')
  expect(password.getAttribute('aria-invalid')).toBe('true')
  expect((password as HTMLInputElement).value).toBe('')
  expect(document.activeElement).toBe(password)
  expect(where(router)).toBe('/login?redirect=%2Frecipes')
  expect(calls).toEqual(['POST /api/login'])
})

test.each([
  ['the server fails', { 'POST /api/login': 500 } as FakeServer],
  ['the server cannot be reached', null],
])('when %s, it says it could not log in', async (_, server) => {
  fakeServer(server ?? {})
  if (!server) vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
  const { user, router } = await mountApp('/login')
  await logIn(user, 'right')

  expect((await screen.findByRole('alert')).textContent).toBe('Could not log in. Try again.')
  expect(where(router)).toBe('/login')
  expect(screen.getByRole('button', { name: 'Log in' }).hasAttribute('disabled')).toBe(false)
})

test('the right password goes back to the page that asked for it', async () => {
  const server: FakeServer = { 'GET /api/session': 401, 'POST /api/login': 204 }
  const passwords: unknown[] = []
  server['POST /api/login'] = (body) => {
    passwords.push(body)
    return 204
  }
  fakeServer(server)
  const { user, router } = await mountApp('/ingredients?q=salt')
  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeDefined()
  server['GET /api/session'] = 204

  await logIn(user, 'right')
  await waitFor(() => expect(where(router)).toBe('/ingredients?q=salt'))
  expect(passwords).toEqual([{ password: 'right' }])
  expect(await screen.findByRole('banner')).toBeDefined()
  expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull()
})

test.each([
  ['no redirect', '/login'],
  ['a redirect to another site', '/login?redirect=%2F%2Fevil.example'],
  ['a redirect that is not a path', '/login?redirect=https%3A%2F%2Fevil.example'],
])('with %s, the right password goes to the brief', async (_, path) => {
  fakeServer({ 'GET /api/session': 204, 'POST /api/login': 204 })
  const { user, router } = await mountApp(path)
  await logIn(user, 'right')
  await waitFor(() => expect(where(router)).toBe('/'))
})

test('Log in without a password asks for it and sends nothing', async () => {
  const calls = fakeServer({ 'POST /api/login': 204 })
  const { user } = await mountApp('/login')
  await user.click(await screen.findByRole('button', { name: 'Log in' }))

  expect((await screen.findByRole('alert')).textContent).toBe('Enter the password.')
  expect(calls).toEqual([])
})

test('while logging in, Log in waits and says so', async () => {
  let answer: (status: number) => void = () => {}
  fakeServer({ 'POST /api/login': () => new Promise<number>((resolve) => (answer = resolve)) })
  const { user } = await mountApp('/login')
  await logIn(user, 'wrong')

  const busy = await screen.findByRole('button', { name: 'Logging in…' })
  expect(busy.hasAttribute('disabled')).toBe(true)
  answer(401)
  expect((await screen.findByRole('alert')).textContent).toBe('Wrong password.')
  expect(screen.getByRole('button', { name: 'Log in' })).toBeDefined()
})
