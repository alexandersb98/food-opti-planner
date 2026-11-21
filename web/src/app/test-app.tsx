import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { afterEach } from 'vitest'
import { App } from './App'
import { BASE_PATH } from './base'
import { routes } from './routes'
import { editionStore } from './stores/edition'

// The React app test harness: the app at a URL with a fake server. Tests
// drive it by roles and labels through the returned user-event instance.
export { fakeServer, unitRoutes, type FakeReply, type FakeServer } from '../test-server'

/** Puts each store back to its starting state, before every mount. Each
 * store adds one line here. */
const resetStores: Array<() => void> = [
  editionStore.reset,
]

afterEach(cleanup)

/** Render the whole React app at `path`, one of the app's own paths such
 * as "/recipes/3" (the base path is added here, as the browser would). */
export async function mountApp(path: string) {
  for (const reset of resetStores) reset()
  const router = createMemoryRouter(routes, { basename: BASE_PATH, initialEntries: [BASE_PATH + path] })
  const user = userEvent.setup()
  const view = render(<App router={router} />)
  return { user, router, ...view }
}
