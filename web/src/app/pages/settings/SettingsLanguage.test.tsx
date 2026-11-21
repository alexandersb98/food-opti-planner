import { screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { fakeServer, mountApp, unitRoutes } from '../../test-app'

// A test-only second language (Swedish has no message file yet): the English
// messages under another code, so the language choice appears.
vi.mock('../../../translator', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../translator')>()
  const locales = [...original.locales, { ...original.locales[0]!, code: 'sv', name: 'Svenska' }]
  return { ...original, locales, findLocale: (code: string) => locales.find((l) => l.code === code) ?? locales[0]! }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('with a second language, Settings offers the choice and switches to it', async () => {
  fakeServer({ 'GET /api/session': 204, ...unitRoutes(), 'GET /api/data-sources': { body: [] } })
  const { user } = await mountApp('/settings')
  const language = await screen.findByRole('group', { name: 'Language' })
  const buttons = within(language).getAllByRole('button')
  expect(buttons.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
    ['English', 'true'],
    ['Svenska', 'false'],
  ])
  expect(buttons[1]!.querySelector('[lang="sv"]')).not.toBeNull()

  await user.click(buttons[1]!)
  expect(within(language).getByRole('button', { name: 'Svenska' }).getAttribute('aria-pressed')).toBe('true')
})
