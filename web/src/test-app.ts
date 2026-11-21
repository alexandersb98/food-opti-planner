import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { expect } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import App from './App.vue'
import { makeI18n } from './i18n'
import { makeRouter } from './router'

// The fake server lives in a framework-free module shared with the React
// harness (app/test-app.tsx).
export { fakeServer, unitRoutes, type FakeReply, type FakeServer } from './test-server'

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

/** Wait for Quasar to fill a menu's virtual list, which it does a moment
 * after the menu opens or its options change: until a row shows, or 300 ms
 * (an empty list shows none). */
export async function settleMenu() {
  const start = Date.now()
  do {
    await new Promise((resolve) => setTimeout(resolve, 30))
    await flushPromises()
  } while (Date.now() - start < 300 && !document.querySelector('.q-menu .q-item'))
  await new Promise((resolve) => setTimeout(resolve, 30))
  await flushPromises()
}

/** Open the unit list of the field labelled `label` and answer its rows:
 * group headers as "# Mass", units as "kg (kilogram)". Quasar fills a menu's
 * virtual list a moment after it opens. */
export async function openUnitList(wrapper: VueWrapper, label: string) {
  const input = field(wrapper, label)
  if (input.attributes('aria-expanded') !== 'true') {
    await input.element.closest('.q-field__control')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }
  await settleMenu()
  const menu = [...document.querySelectorAll('.q-menu')].at(-1)
  return [...(menu?.querySelectorAll<HTMLElement>('.q-item, .q-item__label--header') ?? [])].map((row) =>
    row.classList.contains('q-item__label--header') ? `# ${row.textContent?.trim()}` : (row.textContent?.trim() ?? ''),
  )
}

/** Open the unit list of the field labelled `label` and choose the row `option`. */
export async function chooseUnit(wrapper: VueWrapper, label: string, option: string) {
  await openUnitList(wrapper, label)
  const row = [...document.querySelectorAll<HTMLElement>('.q-menu .q-item')].find((r) => r.textContent?.trim() === option)
  expect(row, `unit ${option}`).toBeDefined()
  row!.click()
  await settleMenu()
}
