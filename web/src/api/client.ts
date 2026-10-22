import createClient from 'openapi-fetch'
import type { paths } from './schema'

// Typed calls to the server, e.g. api.GET('/api/health').
export const api = createClient<paths>({
  baseUrl: globalThis.location?.origin,
  fetch: (request) => globalThis.fetch(request), // looked up per call, so tests can stub it
})

// Login and the session check deal with their own 401s; any other 401
// means the session has ended.
const handlesOwn401 = ['/api/login', '/api/session']

let onUnauthorized = () => {}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

api.use({
  onResponse({ request, response }) {
    if (response.status === 401 && !handlesOwn401.includes(new URL(request.url).pathname)) {
      onUnauthorized()
    }
  },
})
