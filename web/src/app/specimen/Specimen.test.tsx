import { screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { EDITION_STORAGE_KEY } from '../stores/edition'
import { fakeServer, mountApp } from '../test-app'
import { specimenSections } from './sections'

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

test('the specimen shows one section per registered entry', async () => {
  fakeServer({})
  await mountApp('/specimen')

  expect(await screen.findByRole('heading', { level: 1, name: /Specimen/ })).toBeDefined()
  for (const section of specimenSections) {
    expect(await screen.findByRole('region', { name: section.title })).toBeDefined()
  }
})

test('the edition switch changes the edition and remembers it', async () => {
  fakeServer({})
  const { user } = await mountApp('/specimen')
  const evening = await screen.findByRole('button', { name: 'Evening' })
  expect(screen.getByRole('button', { name: 'Follow the device' }).getAttribute('aria-pressed')).toBe('true')

  await user.click(evening)

  expect(evening.getAttribute('aria-pressed')).toBe('true')
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBe('evening')
})
