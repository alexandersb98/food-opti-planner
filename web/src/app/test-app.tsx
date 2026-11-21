import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { afterEach } from 'vitest'
import { App } from './App'
import { BASE_PATH } from './base'
import { routes } from './routes'
import * as planSetup from './stores/planSetup'
import * as solve from './stores/solve'
import { importDraftStore } from './stores/importDraft'
import { preferencesStore } from './stores/preferences'
import { unitChangeQuestion } from './stores/unitChangeQuestion'
import { unitsStore } from './stores/units'
import { editionStore } from './stores/edition'

// The React app test harness: the app at a URL with a fake server. Tests
// drive it by roles and labels through the returned user-event instance.
export { fakeServer, unitRoutes, type FakeReply, type FakeServer } from '../test-server'

/** Puts each store back to its starting state, before every mount. Each
 * store adds one line here. */
const resetStores: Array<() => void> = [
  solve.reset,
  planSetup.reset,
  unitsStore.reset,
  preferencesStore.reset,
  unitChangeQuestion.reset,
  importDraftStore.reset,
  editionStore.reset,
]

/** Keys the app asked for that have no message; a test that leaves any
 * fails. */
const missingMessages = new Set<string>()
const reportMissing = (key: string) => {
  missingMessages.add(key)
}

afterEach(cleanup)
afterEach(() => {
  const keys = [...missingMessages]
  missingMessages.clear()
  if (keys.length) throw new Error(`No message for: ${keys.join(', ')}`)
})

/** Render the whole React app at `path`, one of the app's own paths such
 * as "/recipes/3" (the base path is added here, as the browser would). */
export async function mountApp(path: string) {
  for (const reset of resetStores) reset()
  const router = createMemoryRouter(routes, { basename: BASE_PATH, initialEntries: [BASE_PATH + path] })
  const user = userEvent.setup()
  const view = render(<App router={router} onMissingMessage={reportMissing} />)
  return { user, router, ...view }
}
