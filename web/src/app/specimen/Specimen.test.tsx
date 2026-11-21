import { screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { EDITION_STORAGE_KEY } from '../stores/edition'
import { fakeServer, mountApp } from '../test-app'
import { specimenSections } from './sections'

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

// The specimen loads its sections lazily; a cold transform on a busy machine can take seconds.
vi.setConfig({ testTimeout: 20000 })

test('the specimen shows one section per registered entry', async () => {
  fakeServer({})
  await mountApp('/specimen')

  expect(await screen.findByRole('heading', { level: 1, name: /Specimen/ }, { timeout: 15000 })).toBeDefined()
  for (const section of specimenSections) {
    expect(await screen.findByRole('region', { name: section.title }, { timeout: 15000 })).toBeDefined()
  }
})

test('the edition switch changes the edition and remembers it', async () => {
  fakeServer({})
  const { user } = await mountApp('/specimen')
  const evening = await screen.findByRole('button', { name: 'Evening' }, { timeout: 15000 })
  expect(screen.getByRole('button', { name: 'Follow the device' }).getAttribute('aria-pressed')).toBe('true')

  await user.click(evening)

  expect(evening.getAttribute('aria-pressed')).toBe('true')
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBe('evening')
})
