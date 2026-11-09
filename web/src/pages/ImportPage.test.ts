import { flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { setImportedDraft, takeImportedDraft } from '../importDraft'
import { button, click, fakeServer, mountApp, type FakeServer } from '../test-app'
import { importedRecipe } from '../test-data'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const health = (ai_configured: boolean) => ({ 'GET /api/health': { body: { database: true, ai_configured } } })

async function mountPage(server: FakeServer = {}, configured = true) {
  const sent: unknown[] = []
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/recipes': { body: [] },
    'GET /api/attributes': { body: [] },
    'GET /api/tags': { body: [] },
    'GET /api/ingredients': { body: [] },
    ...health(configured),
    'POST /api/recipe-imports': (body) => {
      sent.push(body)
      return { body: importedRecipe() }
    },
    ...server,
  })
  const { wrapper, router } = await mountApp('/recipes/import')
  return { wrapper, router, calls, sent }
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>['wrapper']

function box(wrapper: Wrapper) {
  return wrapper.get<HTMLTextAreaElement>('textarea[aria-label="Recipe text"]')
}

function importButton(wrapper: Wrapper) {
  return wrapper.get('button[type="submit"]')
}

test('Import is disabled while the box is empty or only spaces', async () => {
  const { wrapper } = await mountPage()
  expect(wrapper.get('h1').text()).toBe('Import recipe')
  expect(importButton(wrapper).attributes('disabled')).toBeDefined()
  await box(wrapper).setValue('   \n ')
  expect(importButton(wrapper).attributes('disabled')).toBeDefined()
  await box(wrapper).setValue('Porridge')
  expect(importButton(wrapper).attributes('disabled')).toBeUndefined()
  wrapper.unmount()
})

test('without an AI key Import is disabled and the hint says why', async () => {
  const { wrapper } = await mountPage({}, false)
  await box(wrapper).setValue('Porridge')
  expect(importButton(wrapper).attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('Needs an AI key.')
  wrapper.unmount()
})

test('the key hint does not show before health has answered', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const { wrapper } = await mountPage({
    'GET /api/health': async () => {
      await gate
      return { body: { database: true, ai_configured: false } }
    },
  })
  expect(wrapper.text()).not.toContain('Needs an AI key.')
  release()
  await flushPromises()
  expect(wrapper.text()).toContain('Needs an AI key.')
  wrapper.unmount()
})

test('an unreadable health answer counts as no key', async () => {
  const { wrapper } = await mountPage({ 'GET /api/health': 500 })
  await box(wrapper).setValue('Porridge')
  expect(importButton(wrapper).attributes('disabled')).toBeDefined()
  wrapper.unmount()
})

test('a success posts the text, shows the wait, hands the draft over and opens a new recipe', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const draft = importedRecipe({ name: 'Soup' })
  const { wrapper, router, sent } = await mountPage({
    'POST /api/recipe-imports': async (body) => {
      sent.push(body)
      await gate
      return { body: draft }
    },
    'GET /api/ingredients': { body: [] },
  })
  await box(wrapper).setValue('Porridge for two')
  await click(importButton(wrapper))
  expect(importButton(wrapper).text()).toContain('Reading the recipe…')
  // visible, not the hidden label Quasar keeps under its spinner
  expect(importButton(wrapper).get('.absolute-full').text()).toContain('Reading the recipe…')
  expect(box(wrapper).attributes('readonly')).toBeDefined()
  await click(importButton(wrapper)) // a second click does nothing
  release()
  await flushPromises()
  expect(sent).toEqual([{ text: 'Porridge for two' }])
  expect(router.currentRoute.value.fullPath).toBe('/recipes/new')
  // the editor took the draft: it is open for review with the imported name
  expect(takeImportedDraft()).toBeNull()
  expect(wrapper.get<HTMLInputElement>('input[aria-label="Name"], .q-field input').element.value).toBe('Soup')
  expect(wrapper.text()).toContain('Imported from pasted text')
  wrapper.unmount()
})

test.each([
  ['no_recipe', 422, 'No recipe found in this text.'],
  ['limit_reached', 429, "Today's import limit is reached."],
  ['ai_failed', 502, "The AI service didn't answer. Try again."],
  ['ai_not_configured', 503, 'Needs an AI key.'],
  ['text_required', 422, 'Paste the recipe text first.'],
  ['too_long', 422, 'That is too much text. Paste only the recipe.'],
])('%s shows its sentence, keeps the text and the page', async (type, status, message) => {
  const { wrapper, router } = await mountPage({
    'POST /api/recipe-imports': { status, body: { detail: [{ loc: ['body'], type, msg: 'x' }] } },
  })
  await box(wrapper).setValue('Porridge')
  await click(importButton(wrapper))
  expect(wrapper.get('.import-error').text()).toBe(message)
  expect(box(wrapper).element.value).toBe('Porridge')
  expect(router.currentRoute.value.fullPath).toBe('/recipes/import')
  expect(importButton(wrapper).attributes('disabled')).toBeUndefined()
  expect(takeImportedDraft()).toBeNull()
  wrapper.unmount()
})

test('a network error shows the general message', async () => {
  const { wrapper } = await mountPage({
    'POST /api/recipe-imports': () => {
      throw new Error('offline')
    },
  })
  await box(wrapper).setValue('Porridge')
  await click(importButton(wrapper))
  expect(wrapper.get('.import-error').text()).toBe('Could not import the recipe. Try again.')
  wrapper.unmount()
})

test('opening the page clears an old draft', async () => {
  setImportedDraft(importedRecipe())
  const { wrapper } = await mountPage()
  expect(takeImportedDraft()).toBeNull()
  expect(button(wrapper, 'Import')).toBeDefined()
  wrapper.unmount()
})
