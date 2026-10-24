import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import App from './App.vue'
import { makeI18n } from './i18n'
import { makeRouter } from './router'

/** What the fake server answers: a status, a status with a JSON body, or a
 * function of the request's JSON body giving either. */
export type FakeReply = number | { status?: number; body?: unknown }
export type FakeServer = Record<string, FakeReply | ((body: unknown) => FakeReply)>

/** Stub fetch with a fake server, keyed by "METHOD /path"; anything not
 * listed answers 404. Returns the calls made, as "METHOD /path". */
export function fakeServer(server: FakeServer) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (request: Request) => {
    const call = `${request.method} ${new URL(request.url).pathname}`
    calls.push(call)
    const handler = server[call] ?? 404
    const text = await request.text()
    const reply = typeof handler === 'function' ? handler(text ? JSON.parse(text) : undefined) : handler
    const { status = 200, body = {} } = typeof reply === 'number' ? { status: reply } : reply
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
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
