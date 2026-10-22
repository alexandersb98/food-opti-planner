import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import App from './App.vue'
import { makeI18n } from './i18n'
import { makeRouter } from './router'

/** Status per "METHOD /path"; anything not listed answers 404. */
export type FakeServer = Record<string, number>

/** Stub fetch with a fake server; returns the calls made, as "METHOD /path". */
export function fakeServer(server: FakeServer) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (request: Request) => {
    const call = `${request.method} ${new URL(request.url).pathname}`
    calls.push(call)
    const status = server[call] ?? 404
    return new Response(status === 204 ? null : '{}', { status })
  })
  return calls
}

/** Mount the whole app at `path`, with its router and plugins. */
export async function mountApp(path: string) {
  const router = makeRouter(createMemoryHistory())
  await router.push(path)
  const wrapper = mount(App, {
    global: { plugins: [Quasar, makeI18n(), router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}
