import { screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { fakeServer, mountApp } from '../../test-app'

// Through the specimen page (the primitives' only page until the pages use
// them); the first find waits longer for the lazy route on a cold start.

// The specimen loads its sections lazily; a cold transform on a busy machine can take seconds.
vi.setConfig({ testTimeout: 20000 })

test('a field is labelled, described by its hint and error, and marked invalid', async () => {
  fakeServer({})
  const { user } = await mountApp('/specimen')
  const fields = await screen.findByRole('region', { name: 'Fields' }, { timeout: 15000 })
  const minutes = await within(fields).findByRole('textbox', { name: 'Minutes' }, { timeout: 15000 })

  expect(minutes.getAttribute('aria-invalid')).toBe('true')
  expect(minutes).toHaveProperty('value', 'forty')
  const description = () =>
    (minutes.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
      .join(' ')
  expect(description()).toBe('From the first chop to the table. A whole number of minutes, such as 40.')
  expect(within(fields).getByRole('alert').textContent).toBe('A whole number of minutes, such as 40.')

  await user.clear(minutes)
  await user.type(minutes, '40')

  expect(minutes.getAttribute('aria-invalid')).toBeNull()
  expect(description()).toBe('From the first chop to the table.')
  expect(within(fields).queryByRole('alert')).toBeNull()
})
