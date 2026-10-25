import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { expect, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import App from './App.vue'
import { makeI18n } from './i18n'
import { makeRouter } from './router'

/** What the fake server answers: a status, a status with a JSON body, or a
 * function of the request's JSON body giving either, at once or later (a
 * promise, for a call that takes a while). */
export type FakeReply = number | { status?: number; body?: unknown }
export type FakeServer = Record<string, FakeReply | ((body: unknown) => FakeReply | Promise<FakeReply>)>

/** Stub fetch with a fake server, keyed by "METHOD /path"; anything not
 * listed answers 404. Returns the calls made, as "METHOD /path", with the
 * query if there is one ("GET /path?date=2026-09-22"). */
export function fakeServer(server: FakeServer) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (request: Request) => {
    const url = new URL(request.url)
    const call = `${request.method} ${url.pathname}`
    calls.push(call + url.search)
    const handler = server[call] ?? 404
    const text = await request.text()
    const reply = typeof handler === 'function' ? await handler(text ? JSON.parse(text) : undefined) : handler
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

/** Click and wait for what the click starts, such as server calls. */
export async function click(target: { trigger: (event: string) => Promise<void> }) {
  await target.trigger('click')
  await flushPromises()
}

/** The button or list item labelled `label`. */
export function button(wrapper: VueWrapper, label: string) {
  const found = wrapper.findAll('button, .q-item').find((b) => b.text() === label)
  expect(found, `button ${label}`).toBeDefined()
  return found!
}

/** The input labelled `label`. */
export function field(wrapper: VueWrapper, label: string) {
  return wrapper.get<HTMLInputElement>(`input[aria-label="${label}"]`)
}

/** The text of each element matching `selector`, such as a list's rows. */
export function texts(wrapper: VueWrapper, selector: string) {
  return wrapper.findAll(selector).map((element) => element.text())
}

/** The open dialog's text, and a click on its button labelled `label`.
 * Dialogs are teleported to the document body, outside the wrapper; the
 * last one is the newest, as one closed just now may linger. */
export function dialog() {
  const element = [...document.querySelectorAll('.q-dialog')].at(-1)!
  return {
    text: element.textContent ?? '',
    async click(label: string) {
      const found = [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
      expect(found, `dialog button ${label}`).toBeDefined()
      found!.click()
      await flushPromises()
    },
  }
}
