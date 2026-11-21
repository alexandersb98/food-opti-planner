import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { importedRecipe } from '../../../test-data'
import { importDraftStore } from '../../stores/importDraft'
import { fakeServer, mountApp, type FakeServer } from '../../test-app'

// Ported from the Vue ImportPage tests (src/pages/ImportPage.test.ts).

// the first mount waits up to 5 s for the lazy route on a cold transform
vi.setConfig({ testTimeout: 15_000 })

afterEach(() => {
  vi.unstubAllGlobals()
})

type Mounted = Awaited<ReturnType<typeof mountApp>>

const health = (ai_configured: boolean): FakeServer => ({ 'GET /api/health': { body: { database: true, ai_configured } } })

/** The Import page, switched to Pasted text unless `startInLink` (the page
 * opens on the Link field). */
async function mountPage(server: FakeServer = {}, configured = true, startInLink = false) {
  const sent: unknown[] = []
  fakeServer({
    'GET /api/session': 204,
    'GET /api/recipes': { body: [] },
    ...health(configured),
    'POST /api/recipe-imports': (body) => {
      sent.push(body)
      return { body: importedRecipe() }
    },
    ...server,
  })
  const mounted = await mountApp('/recipes/import')
  await screen.findByRole('heading', { level: 1, name: 'Import a recipe' }, { timeout: 5000 })
  if (!startInLink) await flip(mounted)
  return { ...mounted, sent }
}

const where = ({ router }: Mounted) => router.state.location.pathname

const modeButton = (name: 'A link' | 'Pasted text') => screen.getByRole('button', { name })

async function flip(mounted: Mounted) {
  const toText = modeButton('A link').getAttribute('aria-pressed') === 'true'
  await mounted.user.click(modeButton(toText ? 'Pasted text' : 'A link'))
}

const linkField = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Link' })
const box = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Recipe text' })
const importButton = () => screen.getByRole<HTMLButtonElement>('button', { name: /^(Import|Reading the recipe…)$/ })

/** Replaces a field's text (an empty value clears it). */
async function type({ user }: Mounted, field: HTMLElement, value: string) {
  await user.clear(field)
  if (value) await user.type(field, value)
}

/** The page's own status line (the toast region is one too). */
const readingStatus = () => screen.getAllByRole('status').find((status) => status.closest('.import-form'))

test('Import is disabled while the box is empty or only spaces', async () => {
  const page = await mountPage()
  expect(importButton().disabled).toBe(true)
  await type(page, box(), 'Porridge')
  await waitFor(() => expect(importButton().disabled).toBe(false)) // health has answered
  await type(page, box(), '   ')
  expect(importButton().disabled).toBe(true)
  await type(page, box(), '')
  expect(importButton().disabled).toBe(true)
})

test('without an AI key Import is disabled and the hint says why, with a way to write it by hand', async () => {
  const page = await mountPage({}, false)
  await type(page, box(), 'Porridge')
  expect(await screen.findByText(/Importing needs an AI key/)).toBeDefined()
  expect(importButton().disabled).toBe(true)
  expect(screen.getByRole('link', { name: 'Write a new recipe' }).getAttribute('href')).toBe('/recipes/new')
})

test('the key hint does not show before health has answered', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  await mountPage({
    'GET /api/health': async () => {
      await gate
      return { body: { database: true, ai_configured: false } }
    },
  })
  expect(screen.queryByText(/Importing needs an AI key/)).toBeNull()
  release()
  expect(await screen.findByText(/Importing needs an AI key/)).toBeDefined()
})

test('an unreadable health answer counts as no key', async () => {
  const page = await mountPage({ 'GET /api/health': 500 })
  await type(page, box(), 'Porridge')
  expect(await screen.findByText(/Importing needs an AI key/)).toBeDefined()
  expect(importButton().disabled).toBe(true)
})

test('a success posts the text, shows the wait, hands the draft over and opens a new recipe', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const draft = importedRecipe({ name: 'Soup' })
  const page = await mountPage({
    'POST /api/recipe-imports': async (body) => {
      page.sent.push(body)
      await gate
      return { body: draft }
    },
  })
  await type(page, box(), 'Porridge for two')
  await waitFor(() => expect(importButton().disabled).toBe(false))
  await page.user.click(importButton())
  expect(importButton().textContent).toBe('Reading the recipe…')
  expect(importButton().disabled).toBe(true)
  expect(readingStatus()?.textContent).toBe('Reading the recipe…')
  expect(box().readOnly).toBe(true)
  await page.user.click(importButton()) // a second click does nothing
  release()
  await waitFor(() => expect(where(page)).toBe('/recipes/new'))
  expect(page.sent).toEqual([{ text: 'Porridge for two' }])
  // the draft waits in the store for the new recipe spread to take
  expect(importDraftStore.getSnapshot()).toEqual(draft)
})

test.each([
  ['no_recipe', 422, 'No recipe found in this text.'],
  ['limit_reached', 429, "Today's import limit is reached."],
  ['ai_failed', 502, "The AI service didn't answer. Try again."],
  ['ai_not_configured', 503, 'Needs an AI key.'],
  ['text_required', 422, 'Paste the recipe text first.'],
  ['too_long', 422, 'That is too much text. Paste only the recipe.'],
  ['something_new', 422, 'Could not import the recipe. Try again.'],
])('%s shows its sentence, keeps the text and the page', async (type_, status, message) => {
  const page = await mountPage({
    'POST /api/recipe-imports': { status, body: { detail: [{ loc: ['body'], type: type_, msg: 'x' }] } },
  })
  await type(page, box(), 'Porridge')
  await waitFor(() => expect(importButton().disabled).toBe(false))
  await page.user.click(importButton())
  expect((await screen.findByRole('alert')).textContent).toBe(message)
  expect(box().value).toBe('Porridge')
  expect(where(page)).toBe('/recipes/import')
  expect(importButton().disabled).toBe(false)
  expect(importDraftStore.getSnapshot()).toBeNull()
})

test('a network error shows the general message', async () => {
  const page = await mountPage({
    'POST /api/recipe-imports': () => {
      throw new Error('offline')
    },
  })
  await type(page, box(), 'Porridge')
  await waitFor(() => expect(importButton().disabled).toBe(false))
  await page.user.click(importButton())
  expect((await screen.findByRole('alert')).textContent).toBe('Could not import the recipe. Try again.')
})

test('opening the page clears an old draft', async () => {
  fakeServer({ 'GET /api/session': 204, 'GET /api/recipes': { body: [] }, ...health(true) })
  const { router } = await mountApp('/recipes')
  importDraftStore.put(importedRecipe()) // left by an import that was never opened
  await act(() => router.navigate('/recipes/import'))
  await screen.findByRole('heading', { level: 1, name: 'Import a recipe' }, { timeout: 5000 })
  await waitFor(() => expect(importDraftStore.getSnapshot()).toBeNull())
})

test('Cancel goes back to the recipe index', async () => {
  const page = await mountPage({}, true, true)
  await page.user.click(screen.getByRole('link', { name: 'Cancel' }))
  expect(where(page)).toBe('/recipes')
})

// --- the Link field and the switch ---------------------------------------------

test('the page opens on the Link field with its hint and no text box', async () => {
  await mountPage({}, true, true)
  expect(modeButton('A link').getAttribute('aria-pressed')).toBe('true')
  expect(modeButton('Pasted text').getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('group', { name: 'Import from' })).toBeDefined()
  expect(linkField().type).toBe('url')
  expect(linkField().getAttribute('inputmode')).toBe('url')
  expect(linkField().getAttribute('aria-describedby')).toBeTruthy()
  expect(screen.getByText("Works for most recipe sites. If a site won't open, paste the recipe text instead.")).toBeDefined()
  expect(screen.queryByRole('textbox', { name: 'Recipe text' })).toBeNull()
})

test('Import is disabled while the link is blank or spaces', async () => {
  const page = await mountPage({}, true, true)
  expect(importButton().disabled).toBe(true)
  await type(page, linkField(), 'https://ica.se/x')
  await waitFor(() => expect(importButton().disabled).toBe(false)) // health has answered
  await type(page, linkField(), '   ')
  expect(importButton().disabled).toBe(true)
})

test('a click posts the trimmed link and no text key', async () => {
  const page = await mountPage({}, true, true)
  await type(page, linkField(), '  https://ica.se/recept/x  ')
  await waitFor(() => expect(importButton().disabled).toBe(false))
  await page.user.click(importButton())
  await waitFor(() => expect(where(page)).toBe('/recipes/new'))
  expect(page.sent).toEqual([{ url: 'https://ica.se/recept/x' }])
})

test('Enter in the link field posts', async () => {
  const page = await mountPage({}, true, true)
  await type(page, linkField(), 'https://ica.se/x')
  await waitFor(() => expect(importButton().disabled).toBe(false))
  await page.user.type(linkField(), '{Enter}')
  await waitFor(() => expect(page.sent).toEqual([{ url: 'https://ica.se/x' }]))
})

test('Pasted text shows the box, hides the field and posts only the text', async () => {
  const page = await mountPage({}, true, true)
  await type(page, linkField(), 'https://ica.se/x')
  await flip(page)
  expect(screen.queryByRole('textbox', { name: 'Link' })).toBeNull()
  await type(page, box(), 'Porridge')
  await waitFor(() => expect(importButton().disabled).toBe(false))
  await page.user.click(importButton())
  await waitFor(() => expect(page.sent).toEqual([{ text: 'Porridge' }]))
})

test('both inputs keep their text when switching back and forth and Import follows the active one', async () => {
  const page = await mountPage({}, true, true)
  await type(page, linkField(), 'https://ica.se/x')
  await waitFor(() => expect(importButton().disabled).toBe(false)) // health has answered
  await flip(page)
  expect(box().value).toBe('')
  expect(importButton().disabled).toBe(true) // the link does not enable text mode
  await type(page, box(), 'Porridge')
  await flip(page)
  expect(linkField().value).toBe('https://ica.se/x')
  await type(page, linkField(), '')
  expect(importButton().disabled).toBe(true) // the text does not enable link mode
  await flip(page)
  expect(box().value).toBe('Porridge')
})

const failure = (status: number, type: string): FakeServer => ({
  'POST /api/recipe-imports': { status, body: { detail: [{ loc: ['body', 'url'], type, msg: 'x' }] } },
})

test.each([
  ['page_unreadable', 422, "Couldn't read this page. Paste the recipe text instead."],
  ['no_recipe', 422, 'No recipe found on this page. Paste the recipe text instead.'],
  ['url_required', 422, 'Enter the link to the recipe.'],
  ['url_invalid', 422, 'Enter a link that starts with http:// or https://.'],
  ['limit_reached', 429, "Today's import limit is reached."],
  ['ai_failed', 502, "The AI service didn't answer. Try again."],
  ['ai_not_configured', 503, 'Needs an AI key.'],
  ['input_required', 422, 'Could not import the recipe. Try again.'],
])('link mode: %s shows its sentence and keeps the link and the text', async (type_, status, message) => {
  const page = await mountPage(failure(status, type_), true, true)
  await flip(page)
  await type(page, box(), 'Porridge')
  await flip(page)
  await type(page, linkField(), 'https://ica.se/x')
  await waitFor(() => expect(importButton().disabled).toBe(false))
  await page.user.click(importButton())
  expect((await screen.findByRole('alert')).textContent).toBe(message)
  expect(linkField().value).toBe('https://ica.se/x')
  expect(importButton().disabled).toBe(false)
  expect(where(page)).toBe('/recipes/import')
  // the refusal stays when switching, as its advice is often to paste the text
  await flip(page)
  expect(box().value).toBe('Porridge')
  expect(screen.getByRole('alert').textContent).toBe(message)
})

test('text mode keeps its own no-recipe sentence', async () => {
  const page = await mountPage(failure(422, 'no_recipe'))
  await type(page, box(), 'Porridge')
  await waitFor(() => expect(importButton().disabled).toBe(false))
  await page.user.click(importButton())
  expect((await screen.findByRole('alert')).textContent).toBe('No recipe found in this text.')
})

test('a network error in link mode is the general message', async () => {
  const page = await mountPage(
    {
      'POST /api/recipe-imports': () => {
        throw new Error('offline')
      },
    },
    true,
    true,
  )
  await type(page, linkField(), 'https://ica.se/x')
  await waitFor(() => expect(importButton().disabled).toBe(false))
  await page.user.click(importButton())
  expect((await screen.findByRole('alert')).textContent).toBe('Could not import the recipe. Try again.')
})

test('while reading, the link is read-only and a double click posts once; the draft keeps the source link', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const page = await mountPage(
    {
      'POST /api/recipe-imports': async (body) => {
        page.sent.push(body)
        await gate
        return { body: importedRecipe({ source_url: 'https://www.ica.se/recept/x' }) }
      },
    },
    true,
    true,
  )
  await type(page, linkField(), 'https://ica.se/x')
  await waitFor(() => expect(importButton().disabled).toBe(false))
  await page.user.click(importButton())
  expect(importButton().textContent).toBe('Reading the recipe…')
  expect(linkField().readOnly).toBe(true)
  await page.user.click(importButton())
  release()
  await waitFor(() => expect(where(page)).toBe('/recipes/new'))
  expect(page.sent).toHaveLength(1)
  expect(importDraftStore.getSnapshot()?.source_url).toBe('https://www.ica.se/recept/x')
})
