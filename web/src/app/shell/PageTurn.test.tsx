import { fireEvent, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { BASE_PATH } from '../base'
import { fakeServer, mountApp, type FakeServer } from '../test-app'

const session: FakeServer = { 'GET /api/session': 204 }

/** Where the router is, within the app (without the base path). */
function where(router: Awaited<ReturnType<typeof mountApp>>['router']) {
  return router.state.location.pathname.slice(BASE_PATH.length) || '/'
}

/** A one-finger stroke from (x, y) by (dx, dy), starting on `element`. */
function swipe(element: Element, dx: number, dy = 0, x = 200, y = 400) {
  fireEvent.touchStart(element, { touches: [{ clientX: x, clientY: y }] })
  fireEvent.touchEnd(element, { touches: [], changedTouches: [{ clientX: x + dx, clientY: y + dy }] })
}

async function heading(name: string) {
  return screen.findByRole('heading', { level: 1, name })
}

function turnLinks() {
  return within(screen.getByRole('navigation', { name: 'Turn the page' })).queryAllByRole('link')
}

test('a left swipe on the brief turns to The Menu, and a right swipe turns back', async () => {
  fakeServer(session)
  const { router } = await mountApp('/')
  swipe(await heading('This week’s brief'), -120)
  expect(where(router)).toBe('/plans/new')

  swipe(await heading('The Menu'), 120)
  expect(where(router)).toBe('/')
  expect(await heading('This week’s brief')).toBeDefined()
})

test('a detail page turns from the page it belongs to', async () => {
  fakeServer(session)
  const { router } = await mountApp('/recipes/3')
  swipe(await screen.findByRole('main'), -120)
  expect(where(router)).toBe('/plans')
})

test('a short, slow or mostly upright stroke is not a swipe', async () => {
  fakeServer(session)
  const { router } = await mountApp('/plans/new')
  const page = await heading('The Menu')
  swipe(page, -40)
  swipe(page, -120, 80)
  expect(where(router)).toBe('/plans/new')
})

test('no turn past the first or the last page', async () => {
  fakeServer(session)
  const { router } = await mountApp('/')
  swipe(await heading('This week’s brief'), 120)
  expect(where(router)).toBe('/')
})

test('a swipe that starts in an input or a data-no-swipe element does nothing', async () => {
  fakeServer(session)
  const { router } = await mountApp('/')
  const page = await screen.findByRole('main')
  // stand-ins for a page's field and its schedule grid
  const input = document.createElement('input')
  const grid = document.createElement('div')
  grid.dataset.noSwipe = ''
  const cell = grid.appendChild(document.createElement('span'))
  page.prepend(input, grid)

  swipe(input, -120)
  swipe(cell, -120)
  expect(where(router)).toBe('/')
  input.remove()
  grid.remove()
})

test('the foot of a page turns to the pages either side, named, and gives the folio', async () => {
  fakeServer(session)
  const { user, router } = await mountApp('/recipes')
  await heading('The recipe index')
  expect(turnLinks().map((link) => link.textContent)).toEqual(['Previous pageThe Menu', 'Next pageThe archive'])
  expect(turnLinks().map((link) => link.getAttribute('href'))).toEqual([BASE_PATH + '/plans/new', BASE_PATH + '/plans'])
  expect(within(screen.getByRole('main')).getByText('Page 3')).toBeDefined()

  await user.click(screen.getByRole('link', { name: /^Next page/ }))
  expect(where(router)).toBe('/plans')
  expect(await heading('The archive')).toBeDefined()
})

test('the first and last pages have one turn link each', async () => {
  fakeServer(session)
  await mountApp('/')
  await heading('This week’s brief')
  expect(turnLinks().map((link) => link.textContent)).toEqual(['Next pageThe Menu'])
})

test('the last page has only a previous page', async () => {
  fakeServer(session)
  await mountApp('/settings')
  await heading('Settings')
  expect(turnLinks().map((link) => link.textContent)).toEqual(['Previous pageTags'])
  expect(within(screen.getByRole('main')).getByText('Page 8')).toBeDefined()
})

test('the skip link moves focus to the page’s main region', async () => {
  fakeServer(session)
  const { user } = await mountApp('/recipes')
  await heading('The recipe index')
  await user.tab()
  const skip = screen.getByRole('link', { name: 'Skip to the page' })
  expect(document.activeElement).toBe(skip)

  await user.keyboard('{Enter}')
  expect(document.activeElement).toBe(screen.getByRole('main'))
})

test('Back returns to the page before', async () => {
  fakeServer(session)
  const { user, router } = await mountApp('/')
  await heading('This week’s brief')
  await user.click(screen.getByRole('link', { name: /^Next page/ }))
  await heading('The Menu')
  await router.navigate(-1)
  expect(where(router)).toBe('/')
  expect(await heading('This week’s brief')).toBeDefined()
})
